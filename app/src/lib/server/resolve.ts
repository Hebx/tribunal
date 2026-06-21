// Full resolution pipeline — the single entry point for deciding a case.
//
//   case + agents → DEBATE (advocates argue) → JURY (persona panel deliberates)
//                  → GUARDRAIL (opus-4.8 audits + issues binding verdict)
//                  → VerdictBundle (everything, + locked resolver config hash)
//
// The config hash binds the exact model map (advocate / jury / guardrail) used
// to produce the verdict. It is the value anchored on Sui alongside the verdict
// (mirrors the v1 committee config-hash), so the off-chain resolver is pinned:
// changing any model changes the hash and is detectable on-chain.

import { createHash } from "node:crypto";
import {
  runDebate,
  advocateModel,
  type CaseInput,
  type DebateResult,
  type AdvocatePersona,
} from "./debate";
import { runJury, juryModel, type JurorPersona, type JuryResult } from "./jury";
import { guardrailRule, guardrailModel, type GuardrailDecision } from "./guardrail";
import { GUARDRAIL_CONFIG_HASH } from "./guardrail-prompt";
import { envVal } from "./gateway";
import { buildProvenance, type Provenance } from "./provenance";
import type { LoadedStake } from "./load-stakers";
import type { AssembledCase } from "./assemble-case";
import type { JuryPick } from "./select-jury";

export interface ResolveAgents {
  affirmer: AdvocatePersona; // argues YES
  denier: AdvocatePersona; // argues NO
  jurors: JurorPersona[]; // the persona panel (>=2, distinct)
}

export interface ResolveOptions {
  rounds?: number; // debate rounds (default 2)
  /** When provided, the verdict bundle carries a full provenance entry. */
  provenance?: {
    caseId: string;
    loaded: LoadedStake;
    assembled: AssembledCase;
    jurySelection: JuryPick;
    resolverCommit?: string;
    gatewayBase?: string;
  };
}

export interface VerdictBundle {
  case: CaseInput;
  debate: DebateResult;
  jury: JuryResult;
  guardrail: GuardrailDecision;
  finalOutcome: boolean; // binding verdict — follows the guardrail
  models: { advocate: string; jury: string; guardrail: string };
  configHashHex: string;
  /** sha256 over the locked guardrail prompt — pinned alongside the model map. */
  guardrailConfigHash: string;
  decidedAt: number;
  /** Audit-trail row. Present when resolveCase was given a provenance bundle. */
  provenance?: Provenance;
}

/**
 * SHA-256 over the locked model map. Stable for a given config; any model swap
 * changes it. This is what gets anchored on-chain with the verdict.
 */
export function resolverConfigHash(advocate: string, jury: string, guardrail: string): string {
  const preimage = `tribunal-resolver-v2|advocate=${advocate}|jury=${jury}|guardrail=${guardrail}`;
  return createHash("sha256").update(Buffer.from(preimage, "utf8")).digest("hex");
}

/**
 * Resolve a case end-to-end. Throws if the jury config is invalid (delegated to
 * runJury). The binding `finalOutcome` is the guardrail's, not the jury's.
 *
 * When `opts.provenance` is supplied, the verdict bundle carries a fully
 * populated Provenance entry (M3 audit trail). Without it, the bundle is the
 * v2 shape minus the audit row — a tolerant path so legacy callers (tests,
 * verify-resolve.mts) keep working.
 */
export async function resolveCase(
  c: CaseInput,
  agents: ResolveAgents,
  opts: ResolveOptions = {},
): Promise<VerdictBundle> {
  const rounds = opts.rounds ?? 2;

  // 1. Debate — advocates argue opposing sides.
  const debate = await runDebate(c, agents.affirmer, agents.denier, rounds);

  // 2. Jury — persona panel votes independently, then deliberates.
  const jury = await runJury(c, debate, agents.jurors);

  // 3. Guardrail — opus-4.8 audits and issues the binding verdict.
  const guardrail = await guardrailRule(c, debate, jury);

  const models = { advocate: advocateModel(), jury: juryModel(), guardrail: guardrailModel() };
  const decidedAt = Date.now();
  const resolverHash = resolverConfigHash(models.advocate, models.jury, models.guardrail);

  const bundle: VerdictBundle = {
    case: c,
    debate,
    jury,
    guardrail,
    finalOutcome: guardrail.finalOutcome,
    models,
    configHashHex: resolverHash,
    guardrailConfigHash: GUARDRAIL_CONFIG_HASH,
    decidedAt,
  };

  if (opts.provenance) {
    const p = opts.provenance;
    bundle.provenance = buildProvenance({
      caseId: p.caseId,
      loaded: p.loaded,
      assembled: p.assembled,
      jurySelection: p.jurySelection,
      models,
      configHashes: { resolver: resolverHash, guardrail: GUARDRAIL_CONFIG_HASH },
      gateway: {
        base: p.gatewayBase ?? envVal("KIRO_GATEWAY_BASE") ?? "",
        // Temperatures here are the call-site defaults; buildProvenance fills
        // its own defaults if any are missing, so omitting them is safe.
        temperatures: {},
      },
      decidedAt,
      resolverCommit: p.resolverCommit,
    });
  }

  return bundle;
}
