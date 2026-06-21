// Read the StakePool's on-chain matchmaking state in one RPC.
//
// Branch A path (Decision Gate 0.1): getObject + showContent deserializes
// the pool fields directly. Returns:
//   - advocate{Yes,No}Id  : the first wallet that staked on that side (set once)
//   - stakers             : every StakeRecord pushed by stake(), with weights
//   - yes/no totals       : raw and weighted
//
// Used by the resolver to match advocates without walking the event log.

import type { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";

export interface StakerRecord {
  agentId: string;
  sideTrue: boolean;
  amount: bigint;
  weight: bigint;
  isAdvocate: boolean;
}

export interface StakePoolState {
  caseId: string;
  yesTotal: bigint;
  noTotal: bigint;
  yesWeightedTotal: bigint;
  noWeightedTotal: bigint;
  advocateYesId: string | null;
  advocateNoId: string | null;
  stakers: StakerRecord[];
}

// The smallest interface readStakerList needs from a Sui client.
// Both @mysten/sui's SuiClient and SuiJsonRpcClient satisfy this.
export interface ClientLike {
  getObject(args: {
    id: string;
    options?: { showContent?: boolean; showType?: boolean };
  }): Promise<{
    data?: {
      content?: unknown;
    } | null;
  }>;
}

interface PoolFields {
  case_id: string;
  yes_total: string;
  no_total: string;
  yes_weighted_total: string;
  no_weighted_total: string;
  advocate_yes:
    | { fields?: { vec?: string[] } }    // SuiClient shape
    | string[]                            // SuiJsonRpcClient shape
    | null;
  advocate_no:
    | { fields?: { vec?: string[] } }
    | string[]
    | null;
  stakes: Array<{
    fields?: {
      agent_id?: string;
      side_true?: boolean;
      amount?: string;
      weight?: string;
      is_advocate?: boolean;
    };
    // tolerate the alternative shape some RPC clients emit
    agent_id?: string;
    side_true?: boolean;
    amount?: string;
    weight?: string;
    is_advocate?: boolean;
  }>;
}

/** Decode an Option<ID> from Sui's two common JSON shapes. */
function decodeOptionId(
  v: PoolFields["advocate_yes"] | PoolFields["advocate_no"],
): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) return v.length > 0 ? v[0] : null;
  const inner = (v as { fields?: { vec?: string[] } }).fields?.vec ?? [];
  return inner.length > 0 ? inner[0] : null;
}

function decodeRecord(
  raw: PoolFields["stakes"][number],
): StakerRecord {
  const f = raw.fields ?? raw;
  return {
    agentId: f.agent_id!,
    sideTrue: !!f.side_true,
    amount: BigInt(f.amount ?? "0"),
    weight: BigInt(f.weight ?? "0"),
    isAdvocate: !!f.is_advocate,
  };
}

/** Read full pool state (advocates + stakers + totals) in one RPC. */
export async function readStakerList(
  client: ClientLike,
  poolId: string,
): Promise<StakePoolState> {
  const obj = await client.getObject({
    id: poolId,
    options: { showContent: true, showType: true },
  });
  const content = obj.data?.content as
    | { fields?: PoolFields; dataType?: string }
    | undefined;
  if (!content || content.dataType !== "moveObject" || !content.fields) {
    throw new Error(`readStakerList: pool ${poolId} has no parsed content`);
  }
  const f = content.fields;
  return {
    caseId: f.case_id,
    yesTotal: BigInt(f.yes_total),
    noTotal: BigInt(f.no_total),
    yesWeightedTotal: BigInt(f.yes_weighted_total),
    noWeightedTotal: BigInt(f.no_weighted_total),
    advocateYesId: decodeOptionId(f.advocate_yes),
    advocateNoId: decodeOptionId(f.advocate_no),
    stakers: (f.stakes ?? []).map(decodeRecord),
  };
}

// Re-export typed alias so consumers can take SuiJsonRpcClient or our mock.
export type ReadStakerListClient = ClientLike | SuiJsonRpcClient;
