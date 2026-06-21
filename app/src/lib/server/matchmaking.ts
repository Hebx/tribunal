// Matchmaking — derive the case matchup from on-chain stake state.
//
// v3 rule (no autonomous matching): the first wallet to stake YES becomes the
// YES advocate; first to stake NO becomes the NO advocate. Set on-chain in
// `stake.move::stake()` and recorded as `advocate_yes_id`/`advocate_no_id`.
// Remaining stakers on either side are *backers* — they share winnings, do
// not argue.
//
// pickAdvocates() refuses to return a matchup when either advocate slot is
// unset — the case stays in `summoning` until both sides have a staker.
// This is the explicit replacement for v2 conscription/jury-duty fallback.
//
// Reputation is reserved for two things, neither of which is matchmaking:
//   1. the public leaderboard
//   2. juror selection (top-rep, archetype-distinct from both advocates;
//      implemented in select-jury.ts)

import type { Side } from "./debate";

export interface PoolAgent {
  agentId: string; // AgentCard object id
  handle: string;
  score: number; // on-chain reputation score
  archetypeId?: string;
}

export interface Stake {
  agent: PoolAgent;
  side: Side;
  /** Stake amount in MIST. */
  amount?: bigint;
  /** Claim weight in MIST (=amount × 3 for advocate, =amount for backer). */
  weight?: bigint;
  /** True iff this stake was the first on its side (carries advocate role). */
  isAdvocate?: boolean;
}

export interface Matchup {
  /** YES advocate — the first wallet to stake YES. */
  affirmer: PoolAgent;
  /** NO advocate — the first wallet to stake NO. */
  denier: PoolAgent;
  /** Backers on each side, in stake order (not used for argument, share winnings). */
  backers: { yes: PoolAgent[]; no: PoolAgent[] };
}

/** Thrown when a case has at least one side with no staker. */
export class BothSidesMustStake extends Error {
  constructor(public emptySides: Side[]) {
    super(`Both sides must have a staked advocate; missing: ${emptySides.join(", ")}`);
    this.name = "BothSidesMustStake";
  }
}

/**
 * Match a case from chain state. `advocateYesId` and `advocateNoId` are the
 * `Option<ID>` projections of `StakePool.advocate_yes`/`advocate_no` after
 * decoding (see sdk/staker-list). `stakers` is the parallel list of every
 * stake call (advocate + backers, both sides). `pool` is the global
 * `AgentCard` set we resolve ids against so the returned matchup carries
 * full agent metadata (handle, score, archetype).
 *
 * Throws BothSidesMustStake when either advocate slot is unset.
 */
export function pickAdvocates(
  advocateYesId: string | null,
  advocateNoId: string | null,
  stakers: Stake[],
  pool: PoolAgent[],
): Matchup {
  const empty: Side[] = [];
  if (!advocateYesId) empty.push("yes");
  if (!advocateNoId) empty.push("no");
  if (empty.length > 0) throw new BothSidesMustStake(empty);

  const findAgent = (id: string): PoolAgent | undefined =>
    pool.find((a) => a.agentId === id);

  const affirmer = findAgent(advocateYesId!);
  const denier = findAgent(advocateNoId!);
  if (!affirmer) {
    throw new Error(`advocate YES (${advocateYesId}) not in agent pool`);
  }
  if (!denier) {
    throw new Error(`advocate NO (${advocateNoId}) not in agent pool`);
  }
  if (affirmer.agentId === denier.agentId) {
    throw new Error("affirmer and denier are the same agent");
  }

  const backerOnSide = (side: Side, advocateId: string): PoolAgent[] =>
    stakers
      .filter((s) => s.side === side && s.agent.agentId !== advocateId)
      .map((s) => findAgent(s.agent.agentId))
      .filter((a): a is PoolAgent => !!a);

  return {
    affirmer,
    denier,
    backers: {
      yes: backerOnSide("yes", advocateYesId!),
      no: backerOnSide("no", advocateNoId!),
    },
  };
}
