// Jury selection — pick the deliberators for a case from the global agent pool.
//
// v3 rules (in priority order):
//   1. Exclude the two advocates.
//   2. Sort candidates by reputation DESC.
//   3. Prefer candidates whose archetype matches neither advocate's archetype
//      (persona diversity reduces "debate diversity collapse").
//   4. If the diverse subset has < 3 members, relax the archetype filter and
//      flag `fallbackUsed = true`.
//   5. Break ties (equal score) by sha256(seed + agentId) ASC. Same case → same
//      jury, every time. Determinism prevents seed-shopping by re-runs.
//
// Returns exactly 3 jurors when the pool can supply them, or throws if the
// remaining pool (after excluding advocates) has < 3 members. The seed is
// emitted in the provenance entry so any verdict is reconstructable.

import { createHash } from "node:crypto";
import type { PoolAgent } from "./matchmaking";

export interface JuryPick {
  /** Always length 3 when this resolves. */
  jurors: PoolAgent[];
  /** True when the archetype-distinct filter had to be relaxed. */
  fallbackUsed: boolean;
  /** Echoed from the input for provenance. */
  seed: string;
}

/** Stable tiebreak key. Lower digest comes first. */
function tiebreak(seed: string, agentId: string): string {
  return createHash("sha256").update(seed).update(agentId).digest("hex");
}

/**
 * Compare two candidates: higher score first, then digest(seed + id) ASC.
 * Deterministic across runs for a fixed seed.
 */
function compareCandidates(seed: string) {
  return (a: PoolAgent, b: PoolAgent) => {
    if (b.score !== a.score) return b.score - a.score;
    const ka = tiebreak(seed, a.agentId);
    const kb = tiebreak(seed, b.agentId);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  };
}

/**
 * Pick a 3-juror panel.
 *
 * @param advocates  the two advocates (excluded from the jury)
 * @param pool       global candidate pool (typically loadAgentPool() output)
 * @param seed       deterministic tiebreak seed (typically `sha256(caseId).slice(0,16)`)
 *
 * @throws when fewer than 3 candidates remain after excluding advocates
 */
export function selectJury(
  advocates: [PoolAgent, PoolAgent],
  pool: PoolAgent[],
  seed: string,
): JuryPick {
  const advocateIds = new Set([advocates[0].agentId, advocates[1].agentId]);
  const advocateArchetypes = new Set(
    [advocates[0].archetypeId, advocates[1].archetypeId].filter(
      (a): a is string => !!a,
    ),
  );

  const candidates = pool.filter((a) => !advocateIds.has(a.agentId));
  if (candidates.length < 3) {
    throw new Error(
      `selectJury: not enough candidates (have ${candidates.length} after ` +
        "excluding advocates, need 3). Register more AgentCards before resolving.",
    );
  }

  const cmp = compareCandidates(seed);

  // Diverse subset: archetype not in either advocate's archetype.
  const diverse = candidates
    .filter((a) => a.archetypeId && !advocateArchetypes.has(a.archetypeId))
    .sort(cmp);

  if (diverse.length >= 3) {
    return { jurors: diverse.slice(0, 3), fallbackUsed: false, seed };
  }

  // Fallback: take the diverse picks, then backfill from the rest of the
  // top-score list (excluding what we already have).
  const usedIds = new Set(diverse.map((a) => a.agentId));
  const backfill = candidates
    .filter((a) => !usedIds.has(a.agentId))
    .sort(cmp);
  const jurors = [...diverse, ...backfill.slice(0, 3 - diverse.length)];
  return { jurors, fallbackUsed: true, seed };
}
