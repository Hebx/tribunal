// Jury — a panel of persona-conditioned jurors deliberates on a debate.
//
// Two-stage design, built to resist the documented failure modes of naive
// multi-LLM voting (anchoring, bandwagon, "debate diversity collapse"):
//
//   1. FIRST PASS (independent): each juror sees only the ANONYMIZED debate
//      transcript (advocate handles stripped → "Side A / Side B") plus the case,
//      and votes alone. No juror sees any peer's reasoning. This is the
//      anchoring-resistant signal.
//   2. DELIBERATION: each juror is shown peers' first-pass rationales (still
//      anonymized) and MAY revise. Divergence is preserved, not forced —
//      a juror holds its line unless genuinely persuaded.
//
// We measure `disagreementRate` over the final votes; the guardrail judge (M3.3)
// consumes the panel result and the dissent. Jurors run on sonnet-4.6 — the
// persona diversity comes from the system prompt, not the weights.

import { chat, envVal, extractJson, type ChatMessage } from "./gateway";
import type { CaseInput, DebateResult } from "./debate";

export interface JurorPersona {
  /** Stable juror handle (kept on the vote, distinct from advocate handles). */
  handle: string;
  /** Persona system-prompt fragment from composePersona. */
  systemPrompt: string;
}

export interface JurorVote {
  handle: string;
  vote: boolean | null; // true = resolves YES, false = NO, null = abstain/parse-fail
  confidence: number; // 0..1
  rationale: string;
  revised?: boolean; // true if the deliberation pass changed this juror's vote
}

export interface JuryResult {
  firstPass: JurorVote[];
  finalVotes: JurorVote[];
  outcome: boolean; // majority of non-abstaining final votes (ties resolve NO)
  votesTrue: number;
  votesFalse: number;
  abstain: number;
  dissent: boolean; // true if the final panel is not unanimous among voters
  /** Fraction of voting jurors on the minority side (0 = unanimous). */
  disagreementRate: number;
}

export function juryModel(): string {
  return envVal("TRIBUNAL_JURY_MODEL") ?? "claude-sonnet-4.6";
}

/**
 * Render the debate with advocate identities removed. The YES advocate becomes
 * "Side A", the NO advocate becomes "Side B", and every occurrence of either
 * advocate's handle anywhere in the text (including rebuttals) is scrubbed.
 * This is what reaches the jury, so no juror can anchor on who argued.
 */
export function anonymizeTranscript(debate: DebateResult): string {
  const handles = new Set<string>();
  for (const round of debate.rounds) {
    for (const arg of round.arguments) handles.add(arg.handle);
  }

  const label = (side: string) => (side === "yes" ? "Side A" : "Side B");
  const scrub = (text: string): string => {
    let out = text;
    for (const h of handles) {
      if (!h) continue;
      // replace any mention of an advocate handle with its side label is unsafe
      // (we don't know which side a rebuttal references), so neutralize to "the
      // opposing side" — keeps the argument, kills the identity anchor.
      out = out.split(h).join("the opposing side");
    }
    return out;
  };

  const lines: string[] = [];
  for (const round of debate.rounds) {
    lines.push(`--- Round ${round.round} ---`);
    // stable Side A (yes) then Side B (no) ordering regardless of array order
    const ordered = [...round.arguments].sort((a, b) => (a.side === "yes" ? -1 : 1) - (b.side === "yes" ? -1 : 1));
    for (const arg of ordered) {
      lines.push(`${label(arg.side)} claim: ${scrub(arg.claim)}`);
      lines.push(`${label(arg.side)} reasoning: ${scrub(arg.reasoning)}`);
      if (arg.rebuttal?.trim()) {
        lines.push(`${label(arg.side)} rebuttal: ${scrub(arg.rebuttal)}`);
      }
    }
  }
  return lines.join("\n");
}

function caseBlock(c: CaseInput): string {
  return `Question: ${c.question}\n\nResolution criteria:\n${c.criteria}\n\nEvidence:\n${c.evidence}`;
}

function jurorSystem(persona: JurorPersona): string {
  return (
    `${persona.systemPrompt}\n\n` +
    `You are a JUROR on a tribunal panel deciding a SUBJECTIVE yes/no question. ` +
    `You did not argue the case — you judge it. Apply the stated resolution criteria ` +
    `through your judicial lens, weigh both sides' arguments on the merits (not on who ` +
    `argued them), and reason only from the evidence on the record. Do not invent facts. ` +
    `Respond with STRICT JSON only, no prose: ` +
    `{"vote": true|false, "confidence": 0.0-1.0, "rationale": "<=240 chars"}. ` +
    `vote=true means the question resolves YES/TRUE.`
  );
}

function parseVote(raw: string): { vote: boolean | null; confidence: number; rationale: string } {
  const j = extractJson(raw);
  if (!j) return { vote: null, confidence: 0, rationale: raw.slice(0, 240) };
  const vote = typeof j.vote === "boolean" ? j.vote : null;
  const confidence = Math.max(0, Math.min(1, Number(j.confidence) || 0));
  const rationale = String(j.rationale ?? "").slice(0, 240);
  return { vote, confidence, rationale };
}

/**
 * One juror's independent first-pass vote on the anonymized debate. The juror
 * never sees advocate identities or any peer juror's reasoning.
 */
export async function jurorVote(
  c: CaseInput,
  debate: DebateResult,
  persona: JurorPersona,
): Promise<JurorVote> {
  const anon = anonymizeTranscript(debate);
  const messages: ChatMessage[] = [
    { role: "system", content: jurorSystem(persona) },
    { role: "user", content: `${caseBlock(c)}\n\nThe debate (advocate identities withheld):\n${anon}\n\nReturn your independent vote.` },
  ];
  const raw = await chat({ model: juryModel(), messages, maxTokens: 400, temperature: 0.3 });
  const { vote, confidence, rationale } = parseVote(raw);
  return { handle: persona.handle, vote, confidence, rationale };
}

/** One juror's deliberation-pass vote: sees peers' (anonymized) rationales, may revise. */
async function deliberate(
  c: CaseInput,
  debate: DebateResult,
  persona: JurorPersona,
  ownFirst: JurorVote,
  peers: JurorVote[],
): Promise<JurorVote> {
  const anon = anonymizeTranscript(debate);
  const peerBlock = peers
    .map((p, i) => `Juror ${i + 1} voted ${p.vote === true ? "YES" : p.vote === false ? "NO" : "ABSTAIN"} (confidence ${p.confidence.toFixed(2)}): ${p.rationale}`)
    .join("\n");
  const messages: ChatMessage[] = [
    { role: "system", content: jurorSystem(persona) },
    {
      role: "user",
      content:
        `${caseBlock(c)}\n\nThe debate (advocate identities withheld):\n${anon}\n\n` +
        `Your own first-pass vote was ${ownFirst.vote === true ? "YES" : ownFirst.vote === false ? "NO" : "ABSTAIN"}: ${ownFirst.rationale}\n\n` +
        `The other jurors voted as follows:\n${peerBlock}\n\n` +
        `Reconsider in light of the other jurors' reasoning. Change your vote ONLY if genuinely persuaded ` +
        `on the merits — do not follow the majority for its own sake. Return your final vote as STRICT JSON.`,
    },
  ];
  const raw = await chat({ model: juryModel(), messages, maxTokens: 400, temperature: 0.3 });
  const { vote, confidence, rationale } = parseVote(raw);
  return { handle: persona.handle, vote, confidence, rationale, revised: vote !== ownFirst.vote };
}

function tally(votes: JurorVote[]): { outcome: boolean; votesTrue: number; votesFalse: number; abstain: number; dissent: boolean; disagreementRate: number } {
  let votesTrue = 0,
    votesFalse = 0,
    abstain = 0;
  for (const v of votes) {
    if (v.vote === true) votesTrue++;
    else if (v.vote === false) votesFalse++;
    else abstain++;
  }
  const voting = votesTrue + votesFalse;
  const outcome = votesTrue > votesFalse; // tie → NO (claimant bears the burden)
  const majority = Math.max(votesTrue, votesFalse);
  const minority = voting - majority;
  const dissent = voting > 0 && minority > 0;
  const disagreementRate = voting === 0 ? 0 : minority / voting;
  return { outcome, votesTrue, votesFalse, abstain, dissent, disagreementRate };
}

/**
 * Run the full panel: independent first pass (parallel), then a deliberation
 * pass (parallel) where each juror sees peers' rationales. Personas must be
 * distinct (diversity is the point). Returns first-pass + final votes + tally.
 */
export async function runJury(
  c: CaseInput,
  debate: DebateResult,
  jurors: JurorPersona[],
): Promise<JuryResult> {
  const handles = new Set(jurors.map((j) => j.handle));
  if (handles.size !== jurors.length) {
    throw new Error("jury requires distinct juror personas (duplicate handle)");
  }
  if (jurors.length < 2) {
    throw new Error("jury requires at least 2 jurors");
  }

  // Stage 1 — independent first pass.
  const firstPass = await Promise.all(jurors.map((p) => jurorVote(c, debate, p)));

  // Stage 2 — deliberation; each juror sees the OTHER jurors' first-pass votes.
  const finalVotes = await Promise.all(
    jurors.map((p, i) =>
      deliberate(
        c,
        debate,
        p,
        firstPass[i],
        firstPass.filter((_, j) => j !== i),
      ),
    ),
  );

  const t = tally(finalVotes);
  return { firstPass, finalVotes, ...t };
}
