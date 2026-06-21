// Debate engine — advocates argue opposing sides of a subjective case.
//
// Two advocates (persona-conditioned) argue YES vs NO across N rounds:
//   round 1: opening (both sides, in parallel, no cross-talk)
//   round 2+: rebuttal (each advocate sees the opponent's prior-round argument)
//
// Advocates run on a fast model (haiku-4.5 by default) — high call volume,
// persona diversity comes from the persona system prompt, not the model.
// The transcript feeds the jury (M3); advocate identities are anonymized to
// the jury downstream to resist anchoring.

import { chat, envVal, extractJson, gatewayProvider, type ChatMessage } from "./gateway";

export type Side = "yes" | "no";

export interface CaseInput {
  question: string;
  criteria: string;
  evidence: string;
}

export interface AdvocatePersona {
  /** Stable handle for the transcript (anonymized before the jury sees it). */
  handle: string;
  /** Persona system-prompt fragment from composePersona. */
  systemPrompt: string;
}

export interface Argument {
  side: Side;
  handle: string;
  claim: string; // one-sentence thesis for this side
  reasoning: string; // the substantive argument
  rebuttal: string; // direct response to the opponent (empty in round 1)
}

export interface DebateRound {
  round: number;
  arguments: Argument[]; // one per side
}

export interface DebateResult {
  case: CaseInput;
  rounds: DebateRound[];
}

export function advocateModel(): string {
  const explicit = envVal("TRIBUNAL_ADVOCATE_MODEL");
  if (explicit) return explicit;
  // Provider-aware default. OpenRouter uses fully-qualified slugs.
  return gatewayProvider() === "openrouter"
    ? "deepseek/deepseek-v4-flash"
    : "claude-haiku-4.5";
}

const SIDE_GOAL: Record<Side, string> = {
  yes: "You argue that the question resolves YES / TRUE.",
  no: "You argue that the question resolves NO / FALSE.",
};

function advocateSystem(persona: AdvocatePersona, side: Side): string {
  return (
    `${persona.systemPrompt}\n\n` +
    `You are an ADVOCATE in a tribunal debate. ${SIDE_GOAL[side]} ` +
    `Argue your assigned side as persuasively and honestly as the evidence allows — ` +
    `reason from your judicial lens, cite the evidence and criteria, and do not invent facts. ` +
    `Respond with STRICT JSON only, no prose: ` +
    `{"claim": "<one-sentence thesis, <=160 chars>", "reasoning": "<your argument, <=600 chars>", ` +
    `"rebuttal": "<direct response to the opponent's argument, <=400 chars; empty string if none yet>"}`
  );
}

function caseBlock(c: CaseInput): string {
  return `Question: ${c.question}\n\nResolution criteria:\n${c.criteria}\n\nEvidence:\n${c.evidence}`;
}

/**
 * Generate one advocate argument for a side. `priorOpponent` is the opponent's
 * argument from the previous round (drives the rebuttal); omit in round 1.
 */
export async function argue(
  c: CaseInput,
  persona: AdvocatePersona,
  side: Side,
  priorOpponent?: Argument,
): Promise<Argument> {
  const userParts = [caseBlock(c)];
  if (priorOpponent) {
    userParts.push(
      `\nThe opposing advocate argued:\nClaim: ${priorOpponent.claim}\nReasoning: ${priorOpponent.reasoning}` +
        `\n\nRebut their argument and strengthen yours.`,
    );
  }
  const messages: ChatMessage[] = [
    { role: "system", content: advocateSystem(persona, side) },
    { role: "user", content: userParts.join("\n") },
  ];
  const raw = await chat({ model: advocateModel(), messages, maxTokens: 600, temperature: 0.4 });
  const j = extractJson(raw);
  return {
    side,
    handle: persona.handle,
    claim: String(j?.claim ?? "").slice(0, 160),
    reasoning: String(j?.reasoning ?? raw).slice(0, 600),
    rebuttal: String(j?.rebuttal ?? "").slice(0, 400),
  };
}

/**
 * Run a multi-round debate. Round 1 = parallel openings; each later round =
 * parallel rebuttals where each advocate sees the opponent's previous argument.
 * Defaults to 2 rounds (opening + rebuttal).
 */
export async function runDebate(
  c: CaseInput,
  affirmer: AdvocatePersona,
  denier: AdvocatePersona,
  rounds = 2,
): Promise<DebateResult> {
  const result: DebateResult = { case: c, rounds: [] };
  let prevYes: Argument | undefined;
  let prevNo: Argument | undefined;

  for (let r = 1; r <= rounds; r++) {
    // each side rebuts the OTHER side's previous-round argument
    const [yesArg, noArg] = await Promise.all([
      argue(c, affirmer, "yes", r === 1 ? undefined : prevNo),
      argue(c, denier, "no", r === 1 ? undefined : prevYes),
    ]);
    result.rounds.push({ round: r, arguments: [yesArg, noArg] });
    prevYes = yesArg;
    prevNo = noArg;
  }
  return result;
}
