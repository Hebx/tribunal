// Server-side helpers for the agent leaderboard + profile pages.
//
// Reads on-chain reputation by walking the `AgentRegistered` event stream for
// the deployed package, then fetching each AgentCard object for its current
// score. No DB — the chain is the source of truth.
//
// The Sui RPC limits queryEvents pages, so we paginate with cursors.

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { NETWORK, PACKAGE_ID, EVENTS, explorerObject } from "@/lib/chain";

export interface AgentRow {
  cardId: string;
  owner: string;
  archetypeId: string;
  personaHash: string; // hex
  createdAtEpoch: number;
  score: number;
  wins: number;
  losses: number;
  overturned: number;
  currentStreak: number;
  hasOutcome: boolean;
  /** Convenience link to the SuiScan object page. */
  explorerUrl: string;
}

function decodeBytes(value: unknown): string {
  // Move event field for `vector<u8>` comes back as number[] or hex string.
  if (Array.isArray(value)) {
    return Buffer.from(value as number[]).toString("utf8");
  }
  if (typeof value === "string") {
    if (value.startsWith("0x")) {
      return Buffer.from(value.slice(2), "hex").toString("utf8");
    }
    return value;
  }
  return "";
}

function decodeHex(value: unknown): string {
  if (Array.isArray(value)) {
    return Buffer.from(value as number[]).toString("hex");
  }
  if (typeof value === "string") {
    return value.startsWith("0x") ? value.slice(2) : value;
  }
  return "";
}

let _client: SuiClient | null = null;
function client(): SuiClient {
  if (!_client) _client = new SuiClient({ url: getFullnodeUrl(NETWORK) });
  return _client;
}

/**
 * Walk every AgentRegistered event for this package. Returns one row per
 * registered card, sorted by score DESC (leaderboard order). Best-effort —
 * cards whose object read fails (deleted, mis-versioned) are skipped.
 */
export async function listAgents(opts: { limit?: number } = {}): Promise<AgentRow[]> {
  const limit = opts.limit ?? 200;
  const c = client();
  const eventType = `${PACKAGE_ID}${EVENTS.AgentRegistered}`;

  // Paginate AgentRegistered events newest-first until we have `limit` or run out.
  const cards = new Map<string, { owner: string; archetypeId: string; personaHash: string; createdAtEpoch: number }>();
  let cursor: any = null;
  while (cards.size < limit) {
    const page: any = await c.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      limit: Math.min(50, limit - cards.size),
      order: "descending",
    });
    for (const ev of page.data ?? []) {
      const p = ev.parsedJson as any;
      if (!p?.card_id) continue;
      // Dedupe in case events show up twice during reorgs
      if (cards.has(p.card_id)) continue;
      cards.set(p.card_id, {
        owner: String(p.owner ?? ""),
        archetypeId: decodeBytes(p.archetype_id),
        personaHash: decodeHex(p.persona_hash),
        createdAtEpoch: Number(p.created_at_epoch ?? 0),
      });
    }
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }

  if (cards.size === 0) return [];

  // Multi-get the current AgentCard state in batches of 50 (RPC limit).
  const ids = Array.from(cards.keys());
  const rows: AgentRow[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const objs = await c.multiGetObjects({ ids: chunk, options: { showContent: true } });
    for (const obj of objs) {
      const data = obj.data;
      if (!data) continue;
      const fields = (data as any).content?.fields;
      if (!fields) continue;
      const reg = cards.get(data.objectId)!;
      rows.push({
        cardId: data.objectId,
        owner: String(fields.owner ?? reg.owner),
        archetypeId: decodeBytes(fields.archetype_id) || reg.archetypeId,
        personaHash: decodeHex(fields.persona_hash) || reg.personaHash,
        createdAtEpoch: Number(fields.created_at_epoch ?? reg.createdAtEpoch),
        score: Number(fields.score ?? 0),
        wins: Number(fields.wins ?? 0),
        losses: Number(fields.losses ?? 0),
        overturned: Number(fields.overturned ?? 0),
        currentStreak: Number(fields.current_streak ?? 0),
        hasOutcome: Boolean(fields.has_outcome ?? false),
        explorerUrl: explorerObject(data.objectId),
      });
    }
  }

  // Stable ordering: score DESC, then more wins, then earlier created.
  rows.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return a.createdAtEpoch - b.createdAtEpoch;
  });
  return rows;
}

/** Fetch a single AgentCard by id (for the profile page). */
export async function getAgent(cardId: string): Promise<AgentRow | null> {
  const c = client();
  const obj = await c.getObject({ id: cardId, options: { showContent: true } });
  const data = obj.data;
  if (!data) return null;
  const fields = (data as any).content?.fields;
  if (!fields) return null;
  return {
    cardId: data.objectId,
    owner: String(fields.owner ?? ""),
    archetypeId: decodeBytes(fields.archetype_id),
    personaHash: decodeHex(fields.persona_hash),
    createdAtEpoch: Number(fields.created_at_epoch ?? 0),
    score: Number(fields.score ?? 0),
    wins: Number(fields.wins ?? 0),
    losses: Number(fields.losses ?? 0),
    overturned: Number(fields.overturned ?? 0),
    currentStreak: Number(fields.current_streak ?? 0),
    hasOutcome: Boolean(fields.has_outcome ?? false),
    explorerUrl: explorerObject(data.objectId),
  };
}

/**
 * Score-update history for an agent (most recent first). Reads ScoreUpdated
 * events and filters by card_id client-side. Sui has no by-object event index
 * so this is the cheapest option for a low-volume system.
 */
export async function getAgentHistory(cardId: string, limit = 25): Promise<
  Array<{ oldScore: number; newScore: number; won: boolean; overturned: boolean; epoch: number }>
> {
  const c = client();
  const eventType = `${PACKAGE_ID}${EVENTS.ScoreUpdated}`;
  const out: Array<{ oldScore: number; newScore: number; won: boolean; overturned: boolean; epoch: number }> = [];
  let cursor: any = null;
  while (out.length < limit) {
    const page: any = await c.queryEvents({
      query: { MoveEventType: eventType },
      cursor,
      limit: 50,
      order: "descending",
    });
    for (const ev of page.data ?? []) {
      const p = ev.parsedJson as any;
      if (p?.card_id !== cardId) continue;
      out.push({
        oldScore: Number(p.old_score),
        newScore: Number(p.new_score),
        won: Boolean(p.won),
        overturned: Boolean(p.overturned),
        epoch: Number(p.epoch),
      });
      if (out.length >= limit) break;
    }
    if (!page.hasNextPage || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return out;
}
