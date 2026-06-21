// Server-side Tribunal committee runner.
//
// Self-contained mirror of sdk/src/memory/committee.ts so the Next API route has
// no cross-version dependency on the SDK (dapp-kit pins @mysten/sui 1.x; the SDK
// targets 2.x). Pure fetch against the OpenAI-compatible Kiro gateway. This is
// the REAL judge — N models vote in parallel on a subjective question.

import { createHash } from "node:crypto";
import { envVal, gatewayBaseUrl, gatewayApiKey } from "./gateway";

export interface JudgeVote {
  model: string;
  vote: boolean | null;
  confidence: number;
  rationale: string;
  error?: string;
}

export interface Verdict {
  outcomeTrue: boolean;
  votesTrue: number;
  votesFalse: number;
  abstain: number;
  agreement: number;
  votes: JudgeVote[];
  configPreimage: string;
  configHashHex: string;
  decidedAt: number;
}

const PROMPT =
  "Resolve the question strictly on the supplied evidence and authoritative sources. " +
  "Be neutral; do not speculate beyond the evidence.";
const SOURCES = "official-announcements, primary-reporting, on-chain-data";

const VOTE_SYSTEM = (prompt: string, sources: string) =>
  `${prompt}\n\nAuthoritative data sources: ${sources}\n\n` +
  `You are one member of a neutral resolution committee deciding a SUBJECTIVE ` +
  `yes/no question. Weigh only the evidence and sources provided. Respond with ` +
  `STRICT JSON only, no prose: {"vote": true|false, "confidence": 0.0-1.0, ` +
  `"rationale": "<=240 chars"}. vote=true means the claim resolves YES/TRUE.`;

/** Read a key from env, falling back to ~/.hermes/.env (zero-dep). */
// envVal is provided by ./gateway

export function committeeModels(): string[] {
  return (envVal("TRIBUNAL_COMMITTEE_MODELS") ?? "claude-haiku-4.5,claude-sonnet-4.5,minimax-m2.5")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function configHashHex(models: string[]): string {
  const preimage = `${models.join(",")}|${PROMPT}|${SOURCES}`;
  return createHash("sha256").update(Buffer.from(preimage, "utf8")).digest("hex");
}

function parseVote(raw: string): { vote: boolean | null; confidence: number; rationale: string } {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { vote: null, confidence: 0, rationale: raw.slice(0, 240) };
  try {
    const j = JSON.parse(m[0]);
    const vote = typeof j.vote === "boolean" ? j.vote : null;
    const confidence = Math.max(0, Math.min(1, Number(j.confidence) || 0));
    const rationale = String(j.rationale ?? "").slice(0, 240);
    return { vote, confidence, rationale };
  } catch {
    return { vote: null, confidence: 0, rationale: raw.slice(0, 240) };
  }
}

async function askOne(
  baseUrl: string,
  apiKey: string,
  model: string,
  question: string,
  evidence: string,
  priorContext?: string,
): Promise<JudgeVote> {
  const userParts = [`Question: ${question}`, `\nEvidence:\n${evidence}`];
  if (priorContext?.trim()) {
    userParts.push(
      `\nRelevant prior case law (precedent from this tribunal's settled cases — ` +
        `weigh it for consistency, but the current evidence governs):\n${priorContext}`,
    );
  }
  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: VOTE_SYSTEM(PROMPT, SOURCES) },
          { role: "user", content: userParts.join("\n") },
        ],
        max_tokens: 400,
        temperature: 0,
      }),
    });
    if (!res.ok) {
      return { model, vote: null, confidence: 0, rationale: "", error: `${res.status} ${(await res.text()).slice(0, 160)}` };
    }
    const j: any = await res.json();
    const raw = j.choices?.[0]?.message?.content ?? "";
    const { vote, confidence, rationale } = parseVote(raw);
    return { model, vote, confidence, rationale };
  } catch (e: any) {
    return { model, vote: null, confidence: 0, rationale: "", error: String(e?.message ?? e).slice(0, 160) };
  }
}

/** Run the full committee in parallel and aggregate to a verdict. */
export async function judge(question: string, evidence: string, priorContext?: string): Promise<Verdict> {
  const baseUrl = gatewayBaseUrl();
  const apiKey = gatewayApiKey();
  const models = committeeModels();

  const votes = await Promise.all(models.map((m) => askOne(baseUrl, apiKey, m, question, evidence, priorContext)));
  let votesTrue = 0,
    votesFalse = 0,
    abstain = 0;
  for (const v of votes) {
    if (v.vote === true) votesTrue++;
    else if (v.vote === false) votesFalse++;
    else abstain++;
  }
  const voting = votesTrue + votesFalse;
  const outcomeTrue = votesTrue > votesFalse;
  const agreement = voting === 0 ? 0 : Math.max(votesTrue, votesFalse) / voting;
  return {
    outcomeTrue,
    votesTrue,
    votesFalse,
    abstain,
    agreement,
    votes,
    configPreimage: `${models.join(",")}|${PROMPT}|${SOURCES}`,
    configHashHex: configHashHex(models),
    decidedAt: Date.now(),
  };
}
