// Provenance — the audit trail attached to every verdict.
//
// Captures *exactly* what produced the verdict so anyone can reproduce it from
// on-chain ids alone:
//   - which AgentCards were the advocates (with archetype + personaHash)
//   - which AgentCards backed each side (with weight + amount)
//   - which AgentCards were seated as jurors (with archetype + personaHash)
//   - the jury-selection seed + fallback flag (selectJury is deterministic
//     given the seed; this row makes the seed explicit)
//   - the model names + temperatures used at each tier
//   - the configHashes of the locked prompts at decision time
//   - the resolver commit SHA at run time (lets a reader pin the code)
//
// This module is pure: it shapes a Provenance from inputs the caller already
// has. Persistence is a separate concern (M3b — Walrus typed Quilts).

import type { LoadedStake } from "./load-stakers";
import type { AssembledCase, AssembledAgent } from "./assemble-case";
import type { JuryPick } from "./select-jury";

/** A single staker's contribution, surfaced into provenance. */
export interface BackerProvenance {
  agentCardId: string;
  /** Stake in MIST, serialised as a decimal string for JSON portability. */
  amount: string;
  /** Claim weight in MIST, serialised as a decimal string. */
  weight: string;
}

/** Advocate slot — same as backer but with the first-staker flag pinned true. */
export interface AdvocateProvenance {
  agentCardId: string;
  archetypeId: string;
  personaHash: string;
  score: number;
  /** Always true; the schema is explicit so a reader doesn't have to infer. */
  isFirstStaker: true;
  /** Advocate's own stake in MIST, serialised as a decimal string. */
  amount: string;
  /** Advocate's claim weight in MIST (= amount × 3 in v3). */
  weight: string;
}

export interface JurorProvenance {
  agentCardId: string;
  archetypeId: string;
  personaHash: string;
  score: number;
}

export interface Provenance {
  caseId: string;
  poolId: string;
  advocates: {
    affirmer: AdvocateProvenance;
    denier: AdvocateProvenance;
  };
  backers: {
    yes: BackerProvenance[];
    no: BackerProvenance[];
  };
  jurors: JurorProvenance[];
  jurySelection: {
    seed: string;
    fallbackUsed: boolean;
  };
  models: {
    advocate: string;
    jury: string;
    guardrail: string;
  };
  configHashes: {
    /** sha256 over the resolver's locked model map (resolverConfigHash). */
    resolver: string;
    /** sha256 over GUARDRAIL_SYSTEM_PROMPT. */
    guardrail: string;
  };
  gateway: {
    base: string;
    temperatures: { advocate: number; jury: number; guardrail: number };
  };
  decidedAt: number;
  /** Git revision of the resolver at run time. Empty string if unavailable. */
  resolverCommit: string;
}

export interface BuildProvenanceArgs {
  caseId: string;
  loaded: LoadedStake;
  assembled: AssembledCase;
  jurySelection: JuryPick;
  models: { advocate: string; jury: string; guardrail: string };
  configHashes: { resolver: string; guardrail: string };
  gateway: {
    base: string;
    temperatures?: { advocate?: number; jury?: number; guardrail?: number };
  };
  decidedAt: number;
  resolverCommit?: string;
}

/** Default temperatures used across the resolver tiers. Kept in sync with the
 *  call sites in debate.ts / jury.ts / guardrail.ts so the provenance entry
 *  reflects actual model behaviour rather than guessed defaults. */
const DEFAULT_TEMPERATURES = { advocate: 0.4, jury: 0.3, guardrail: 0 } as const;

/** Find a staker by agent id; throws if the staker is missing — which can only
 *  happen if loaded.stakers diverged from advocate slots, an invariant break. */
function findStake(loaded: LoadedStake, agentCardId: string) {
  const s = loaded.stakers.find((r) => r.agent.agentId === agentCardId);
  if (!s) {
    throw new Error(
      `provenance: advocate ${agentCardId.slice(0, 10)}… missing from stakers list (pool ${loaded.poolId})`,
    );
  }
  return s;
}

/** Decimal serialise a possibly-undefined bigint MIST value. */
function mist(v: bigint | undefined): string {
  return (v ?? 0n).toString();
}

function advocateRow(loaded: LoadedStake, a: AssembledAgent): AdvocateProvenance {
  const stake = findStake(loaded, a.agentId);
  return {
    agentCardId: a.agentId,
    archetypeId: a.archetypeId,
    personaHash: a.personaHash,
    score: scoreOf(loaded, a.agentId),
    isFirstStaker: true,
    amount: mist(stake.amount),
    weight: mist(stake.weight),
  };
}

function scoreOf(loaded: LoadedStake, agentCardId: string): number {
  const s = loaded.stakers.find((r) => r.agent.agentId === agentCardId);
  return s?.agent.score ?? 0;
}

function backerRows(
  loaded: LoadedStake,
  side: "yes" | "no",
  excludeId: string,
): BackerProvenance[] {
  return loaded.stakers
    .filter((s) => s.side === side && s.agent.agentId !== excludeId)
    .map((s) => ({
      agentCardId: s.agent.agentId,
      amount: mist(s.amount),
      weight: mist(s.weight),
    }));
}

function jurorRow(loaded: LoadedStake, j: AssembledAgent): JurorProvenance {
  return {
    agentCardId: j.agentId,
    archetypeId: j.archetypeId,
    personaHash: j.personaHash,
    // Jurors typically don't stake on the case — fall back to 0 silently.
    score: scoreOf(loaded, j.agentId),
  };
}

/** Build the provenance row for a verdict. Pure (no IO). */
export function buildProvenance(args: BuildProvenanceArgs): Provenance {
  const {
    caseId,
    loaded,
    assembled,
    jurySelection,
    models,
    configHashes,
    gateway,
    decidedAt,
    resolverCommit,
  } = args;

  return {
    caseId,
    poolId: loaded.poolId,
    advocates: {
      affirmer: advocateRow(loaded, assembled.affirmer),
      denier: advocateRow(loaded, assembled.denier),
    },
    backers: {
      yes: backerRows(loaded, "yes", assembled.affirmer.agentId),
      no: backerRows(loaded, "no", assembled.denier.agentId),
    },
    jurors: assembled.jurors.map((j) => jurorRow(loaded, j)),
    jurySelection: {
      seed: jurySelection.seed,
      fallbackUsed: jurySelection.fallbackUsed,
    },
    models,
    configHashes,
    gateway: {
      base: gateway.base,
      temperatures: {
        advocate: gateway.temperatures?.advocate ?? DEFAULT_TEMPERATURES.advocate,
        jury: gateway.temperatures?.jury ?? DEFAULT_TEMPERATURES.jury,
        guardrail: gateway.temperatures?.guardrail ?? DEFAULT_TEMPERATURES.guardrail,
      },
    },
    decidedAt,
    resolverCommit: resolverCommit ?? "",
  };
}
