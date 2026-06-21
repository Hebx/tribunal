// Matchmaking — pair an affirmer + denier for a case.
//
// Primary path: agents opt in and stake on a side. If both sides have at least
// one staker, we pick the highest-reputation staker per side (skin-in-the-game
// PvP). Fallback: if a side has no staker, conscript an agent from the pool
// (jury-duty style) so a case never stalls. Conscription uses a seedable RNG so
// selection is deterministic in tests; on-chain this maps to sui::random.

import type { Side } from "./debate";

export interface PoolAgent {
  agentId: string; // AgentCard object id
  handle: string;
  score: number; // on-chain reputation score
}

export interface Stake {
  agent: PoolAgent;
  side: Side;
}

export interface Matchup {
  affirmer: PoolAgent; // argues YES
  denier: PoolAgent; // argues NO
  conscripted: Side[]; // which sides were filled by conscription (not opt-in)
}

/** Deterministic RNG (mulberry32) — same seed → same sequence. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function topByScore(stakes: Stake[], side: Side): PoolAgent | undefined {
  const onSide = stakes.filter((s) => s.side === side).map((s) => s.agent);
  if (onSide.length === 0) return undefined;
  return onSide.sort((a, b) => b.score - a.score)[0];
}

/**
 * Conscript one agent from `pool`, excluding `exclude` ids. Reputation-weighted
 * random pick (higher score = higher chance) for fairness + quality. Returns
 * undefined if no eligible agent remains.
 */
export function conscript(
  pool: PoolAgent[],
  exclude: string[],
  seed: number,
): PoolAgent | undefined {
  const eligible = pool.filter((a) => !exclude.includes(a.agentId));
  if (eligible.length === 0) return undefined;
  const total = eligible.reduce((acc, a) => acc + Math.max(1, a.score), 0);
  const r = rng(seed)() * total;
  let cum = 0;
  for (const a of eligible) {
    cum += Math.max(1, a.score);
    if (r < cum) return a;
  }
  return eligible[eligible.length - 1];
}

/**
 * Build a matchup from opted-in stakes, conscripting from the pool for any
 * empty side. Throws if a side cannot be filled (no stakers, empty pool).
 */
export function matchSides(stakes: Stake[], pool: PoolAgent[], seed = 1): Matchup {
  const conscripted: Side[] = [];

  let affirmer = topByScore(stakes, "yes");
  let denier = topByScore(stakes, "no");

  const excluded: string[] = [];
  if (affirmer) excluded.push(affirmer.agentId);
  if (denier) excluded.push(denier.agentId);

  if (!affirmer) {
    affirmer = conscript(pool, excluded, seed);
    if (!affirmer) throw new Error("cannot fill YES side: no staker and no eligible pool agent");
    excluded.push(affirmer.agentId);
    conscripted.push("yes");
  }
  if (!denier) {
    denier = conscript(pool, excluded, seed + 1);
    if (!denier) throw new Error("cannot fill NO side: no staker and no eligible pool agent");
    excluded.push(denier.agentId);
    conscripted.push("no");
  }

  if (affirmer.agentId === denier.agentId) {
    throw new Error("affirmer and denier resolved to the same agent");
  }
  return { affirmer, denier, conscripted };
}
