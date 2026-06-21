// Load the stake-pool matchmaking state for a case in one trip:
//   1. find the canonical pool via PoolCreated events filtered by case_id
//   2. read the pool object → advocates + stakers + weighted totals
//   3. cross-reference each staker against the global agent pool (so backers
//      come back with handle/archetype/score, not just an id)
//
// Returns LoadedStake { advocateYesId, advocateNoId, stakers, pool } —
// exactly the shape pickAdvocates() consumes. Throws on the unexpected
// (multiple PoolCreated for one case, pool object missing) so the resolver
// surfaces a typed error rather than producing a bogus matchup.

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { NETWORK, PACKAGE_ID, EVENTS } from "@/lib/chain";
import type { Stake, PoolAgent } from "./matchmaking";

/** Decoded shape of one StakeRecord. */
export interface StakerRecord {
  agentId: string;
  sideTrue: boolean;
  amount: bigint;
  weight: bigint;
  isAdvocate: boolean;
}

export interface LoadedStake {
  poolId: string;
  caseId: string;
  advocateYesId: string | null;
  advocateNoId: string | null;
  yesTotal: bigint;
  noTotal: bigint;
  yesWeightedTotal: bigint;
  noWeightedTotal: bigint;
  /** Stake[] in pickAdvocates() format, with on-chain weight + isAdvocate flags. */
  stakers: Stake[];
}

/** Decode Option<ID> across the three RPC dialects (string | array | boxed-vec). */
function decodeOptionId(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.length > 0 ? v : null;
  if (Array.isArray(v)) return v.length > 0 ? (v[0] as string) : null;
  if (typeof v === "object" && v !== null) {
    const inner = (v as { fields?: { vec?: string[] } }).fields?.vec ?? [];
    return inner.length > 0 ? inner[0] : null;
  }
  return null;
}

/** Decode one stakes[] entry across the field-wrapper dialects. */
function decodeRecord(raw: any): StakerRecord {
  const f = raw?.fields ?? raw ?? {};
  return {
    agentId: String(f.agent_id ?? ""),
    sideTrue: Boolean(f.side_true),
    amount: BigInt(f.amount ?? "0"),
    weight: BigInt(f.weight ?? "0"),
    isAdvocate: Boolean(f.is_advocate),
  };
}

let _client: SuiClient | null = null;
function client(): SuiClient {
  if (!_client) _client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  return _client;
}

/** Find the canonical pool id for a case via PoolCreated events.
 *  Returns null if no pool exists for the case yet. */
export async function findPoolForCase(
  c: SuiClient,
  caseId: string,
  pkgId = PACKAGE_ID,
): Promise<string | null> {
  const eventType = `${pkgId}${EVENTS.PoolCreated}`;
  let cursor: any = null;
  for (let pages = 0; pages < 20; pages++) {
    const page: any = await c.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      limit: 50,
      order: "descending",
    });
    for (const ev of page.data ?? []) {
      const p = ev.parsedJson as { pool_id?: string; case_id?: string };
      if (p?.case_id === caseId && p?.pool_id) return p.pool_id;
    }
    if (!page.hasNextPage || !page.nextCursor) return null;
    cursor = page.nextCursor;
  }
  return null;
}

/** Read a v3 StakePool object and decode the matchmaking state. */
export async function readPoolState(
  c: SuiClient,
  poolId: string,
): Promise<Omit<LoadedStake, "stakers"> & { stakers: StakerRecord[] }> {
  const obj = await c.getObject({
    id: poolId,
    options: { showContent: true, showType: true },
  });
  const content = obj.data?.content as
    | { dataType?: string; fields?: any }
    | undefined;
  if (!content || content.dataType !== "moveObject" || !content.fields) {
    throw new Error(`readPoolState: pool ${poolId} has no parsed content`);
  }
  const f = content.fields;
  // v2 pools predate the v3 schema; refuse cleanly.
  if (f.advocate_yes === undefined || f.yes_weighted_total === undefined) {
    throw new Error(
      `readPoolState: pool ${poolId} is pre-v3 (missing advocate_yes/yes_weighted_total). ` +
        "Set NEXT_PUBLIC_TRIBUNAL_PACKAGE_ID to a v3 package and re-summon the case.",
    );
  }
  return {
    poolId,
    caseId: String(f.case_id),
    advocateYesId: decodeOptionId(f.advocate_yes),
    advocateNoId: decodeOptionId(f.advocate_no),
    yesTotal: BigInt(f.yes_total ?? "0"),
    noTotal: BigInt(f.no_total ?? "0"),
    yesWeightedTotal: BigInt(f.yes_weighted_total ?? "0"),
    noWeightedTotal: BigInt(f.no_weighted_total ?? "0"),
    stakers: ((f.stakes ?? []) as any[]).map(decodeRecord),
  };
}

/**
 * Load full matchmaking state for a case + cross-reference each staker
 * against the global agent pool so the matchup carries handle/score/archetype.
 * @param caseId  the Case<T> object id
 * @param pool    global AgentCard pool (output of loadAgentPool)
 * @param opts.client  optional SuiClient (defaults to the package's testnet client)
 * @param opts.pkgId   package id (defaults to PACKAGE_ID env)
 *
 * Returns LoadedStake. Returns null when no pool exists yet for the case.
 */
export async function loadStakersForCase(
  caseId: string,
  pool: PoolAgent[],
  opts: { client?: SuiClient; pkgId?: string } = {},
): Promise<LoadedStake | null> {
  const c = opts.client ?? client();
  const pkgId = opts.pkgId ?? PACKAGE_ID;

  const poolId = await findPoolForCase(c, caseId, pkgId);
  if (!poolId) return null;

  const state = await readPoolState(c, poolId);

  const byId = new Map(pool.map((a) => [a.agentId, a]));
  const stakers: Stake[] = state.stakers.map((r) => {
    const agent = byId.get(r.agentId) ?? {
      // Agent isn't in the global pool snapshot we were handed. Most likely
      // a fresh AgentCard that registered after we loaded the pool. Surface
      // a placeholder rather than silently drop — pickAdvocates() can decide
      // (and will, for advocate slots, refuse).
      agentId: r.agentId,
      handle: r.agentId.slice(0, 10) + "…",
      score: 0,
      archetypeId: undefined,
    };
    return {
      agent,
      side: r.sideTrue ? "yes" : "no",
      amount: r.amount,
      weight: r.weight,
      isAdvocate: r.isAdvocate,
    };
  });

  return {
    poolId: state.poolId,
    caseId: state.caseId,
    advocateYesId: state.advocateYesId,
    advocateNoId: state.advocateNoId,
    yesTotal: state.yesTotal,
    noTotal: state.noTotal,
    yesWeightedTotal: state.yesWeightedTotal,
    noWeightedTotal: state.noWeightedTotal,
    stakers,
  };
}
