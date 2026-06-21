// Guardrail judge — the final authority.
//
// A single meta-judge (opus-4.8) reviews the full debate and the jury's
// reasoning and issues the binding verdict. It does a DIFFERENT job from the
// jury: the jury captures viewpoints; the guardrail resists the biases that
// deliberation amplifies — anchoring, verbosity bias, bandwagon/majority
// pressure — and enforces procedure (did jurors actually apply the stated
// criteria?) and red lines (safety/PII). It may RATIFY the jury or OVERRIDE it.
//
// Hard rule: an override must always carry a reason. If the model overrides
// without one (contradicts itself), we backfill a reason rather than emit a
// silent, unaccountable flip — accountability is the whole point of this layer.

import { chat, envVal, extractJson, type ChatMessage } from "./gateway";
import { anonymizeTranscript } from "./jury";
import {
  GUARDRAIL_SYSTEM_PROMPT,
  GUARDRAIL_CONFIG_HASH,
  parseGuardrailResponse,
} from "./guardrail-prompt";
import type { CaseInput, DebateResult } from "./debate";
import type { JuryResult } from "./jury";

export interface GuardrailDecision {
  finalOutcome: boolean; // the binding verdict — true = YES/TRUE
  ratifiedJury: boolean; // true if it upheld the jury's outcome
  overrideReason: string; // non-empty iff !ratifiedJury
  biasFlags: string[]; // e.g. ["anchoring","verbosity","bandwagon"]
  confidence: number; // 0..1
  reasoning: string; // the judge's own reasoning trace
  /** Persona-driven rhetorical moves the judge explicitly rejected. Empty
   *  array = either clean debate or guardrail missed it; either way the audit
   *  trail surfaces it. */
  personaTrapsRejected: string[];
  /** sha256 of the locked guardrail system prompt at decision time. Re-export
   *  here so the resolver can fold it into the verdict bundle without a
   *  separate import chain. */
  configHash: string;
}

export function guardrailModel(): string {
  return envVal("TRIBUNAL_GUARDRAIL_MODEL") ?? "claude-opus-4.8";
}

/** Re-export the prompt hash so the resolver provenance entry can pin it. */
export const guardrailPromptHash = GUARDRAIL_CONFIG_HASH;

function juryDigest(jury: JuryResult): string {
  const lines = jury.finalVotes.map(
    (v, i) => `Juror ${i + 1}: ${v.vote === true ? "YES" : v.vote === false ? "NO" : "ABSTAIN"} (confidence ${v.confidence.toFixed(2)})${v.revised ? " [revised in deliberation]" : ""} — ${v.rationale}`,
  );
  return (
    `Jury outcome: ${jury.outcome ? "YES/TRUE" : "NO/FALSE"} ` +
    `(${jury.votesTrue} YES, ${jury.votesFalse} NO, ${jury.abstain} abstain). ` +
    `Dissent: ${jury.dissent ? "yes" : "no"}. Disagreement rate: ${jury.disagreementRate.toFixed(2)}.\n\n` +
    `Juror reasoning:\n${lines.join("\n")}`
  );
}

function caseBlock(c: CaseInput): string {
  return `Question: ${c.question}\n\nResolution criteria:\n${c.criteria}\n\nEvidence:\n${c.evidence}`;
}

/**
 * Run the guardrail judge over a completed debate + jury result. Returns the
 * binding decision. Guarantees an override never has an empty reason.
 */
export async function guardrailRule(
  c: CaseInput,
  debate: DebateResult,
  jury: JuryResult,
): Promise<GuardrailDecision> {
  const anon = anonymizeTranscript(debate);
  const messages: ChatMessage[] = [
    { role: "system", content: GUARDRAIL_SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `${caseBlock(c)}\n\n` +
        `The debate (advocate identities withheld):\n${anon}\n\n` +
        `The jury's deliberated result:\n${juryDigest(jury)}\n\n` +
        `Audit the jury and issue the binding verdict.`,
    },
  ];

  const raw = await chat({ model: guardrailModel(), messages, maxTokens: 600, temperature: 0 });
  const rawJson = extractJson(raw);
  // Tolerant normalisation — fills defaults, clamps numbers, drops nulls.
  // Falls back to an empty object if the model emitted no JSON at all so we
  // can still apply the accountability guard below.
  const j = parseGuardrailResponse(rawJson ?? {});

  const finalOutcome = typeof j.finalOutcome === "boolean" ? j.finalOutcome : jury.outcome;
  // ratifiedJury is authoritative if the model set it; otherwise derive from agreement.
  let ratifiedJury =
    typeof j.ratifiedJury === "boolean" ? j.ratifiedJury : finalOutcome === jury.outcome;
  // Reconcile contradictions: if the final outcome differs from the jury, it IS an override.
  if (finalOutcome !== jury.outcome) ratifiedJury = false;
  if (finalOutcome === jury.outcome && j.ratifiedJury !== false) ratifiedJury = true;

  let overrideReason = j.overrideReason;
  const biasFlags = j.biasFlags;
  const confidence = j.confidence;
  const reasoning = j.reasoning || String(raw).slice(0, 400);
  const personaTrapsRejected = j.personaTrapsRejected;

  // Accountability guard: an override must always carry a reason.
  if (!ratifiedJury && !overrideReason.trim()) {
    overrideReason =
      reasoning.trim() ||
      `Guardrail overrode the jury's ${jury.outcome ? "YES" : "NO"} outcome to ` +
        `${finalOutcome ? "YES" : "NO"} on review of the criteria and record (no model reason supplied).`;
    overrideReason = overrideReason.slice(0, 300);
  }
  // Conversely, a ratification carries no override reason.
  if (ratifiedJury) overrideReason = "";

  return {
    finalOutcome,
    ratifiedJury,
    overrideReason,
    biasFlags,
    confidence,
    reasoning,
    personaTrapsRejected,
    configHash: GUARDRAIL_CONFIG_HASH,
  };
}
