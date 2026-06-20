// Tribunal committee runner — the verifiable AI judgment engine.
//
// A panel of N diverse models (served locally by the Kiro gateway, OpenAI-compat
// at 127.0.0.1:8000) each independently votes TRUE/FALSE on a subjective question
// given the locked config (prompt + sources) and evidence. Votes aggregate into a
// verdict by majority; the full panel — every model's vote + rationale + the
// aggregate — is returned as a structured bundle that becomes:
//   1. the Walrus memory trail (committee_vote + verdict entries), and
//   2. the evidence bundle anchored on-chain via ArtifactRef.
//
// Why local models: satisfies the "N diverse models" requirement with no external
// LLM key (local-first posture) and keeps the deciding config reproducible. The
// model ids + prompt + sources are exactly what gets hashed into the on-chain
// config_hash, so the committee is tamper-evident.

export interface CommitteeConfig {
  /** OpenAI-compatible base url (Kiro gateway). */
  baseUrl: string;
  apiKey: string;
  /** The N panel model ids (must exist on the gateway). */
  models: string[];
  /** System prompt — part of the locked config_hash preimage. */
  prompt: string;
  /** Data sources description — part of the locked config_hash preimage. */
  sources: string;
}

export interface ModelVote {
  model: string;
  vote: boolean | null; // null = abstain/parse failure
  confidence: number; // 0..1 (model self-reported, clamped)
  rationale: string;
  raw?: string;
  error?: string;
}

export interface Verdict {
  question: string;
  outcomeTrue: boolean;
  votesTrue: number;
  votesFalse: number;
  abstain: number;
  /** majority margin as a fraction of voting members (0..1). */
  agreement: number;
  votes: ModelVote[];
  /** The config preimage the on-chain config_hash must match. */
  configPreimage: string;
  decidedAt: number;
}

const VOTE_SYSTEM = (prompt: string, sources: string) =>
  `${prompt}\n\nAuthoritative data sources: ${sources}\n\n` +
  `You are one member of a neutral resolution committee deciding a SUBJECTIVE ` +
  `yes/no question. Weigh only the evidence and sources provided. Respond with ` +
  `STRICT JSON only, no prose: {"vote": true|false, "confidence": 0.0-1.0, ` +
  `"rationale": "<=240 chars"}. vote=true means the claim resolves YES/TRUE.`;

function parseVote(raw: string): { vote: boolean | null; confidence: number; rationale: string } {
  // tolerate fenced code blocks / leading prose
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

export class Committee {
  constructor(private readonly cfg: CommitteeConfig) {}

  /** The exact preimage that must hash to the on-chain config_hash. */
  configPreimage(): string {
    return `${this.cfg.models.join(",")}|${this.cfg.prompt}|${this.cfg.sources}`;
  }

  private async askOne(model: string, question: string, evidence: string, priorContext?: string): Promise<ModelVote> {
    const userParts = [`Question: ${question}`, `\nEvidence:\n${evidence}`];
    if (priorContext && priorContext.trim()) {
      userParts.push(
        `\nRelevant prior case law (precedent from this tribunal's settled cases — ` +
        `weigh it for consistency, but the current evidence governs):\n${priorContext}`,
      );
    }
    const body = {
      model,
      messages: [
        { role: "system", content: VOTE_SYSTEM(this.cfg.prompt, this.cfg.sources) },
        { role: "user", content: userParts.join("\n") },
      ],
      max_tokens: 400,
      temperature: 0,
    };
    try {
      const res = await fetch(`${this.cfg.baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.cfg.apiKey}` },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        return { model, vote: null, confidence: 0, rationale: "", error: `${res.status} ${await res.text()}`.slice(0, 200) };
      }
      const j: any = await res.json();
      const raw = j.choices?.[0]?.message?.content ?? "";
      const { vote, confidence, rationale } = parseVote(raw);
      return { model, vote, confidence, rationale, raw };
    } catch (e: any) {
      return { model, vote: null, confidence: 0, rationale: "", error: String(e?.message ?? e).slice(0, 200) };
    }
  }

  /** Run the full panel in parallel and aggregate to a verdict. */
  async resolve(question: string, evidence: string, priorContext?: string): Promise<Verdict> {
    const votes = await Promise.all(this.cfg.models.map((m) => this.askOne(m, question, evidence, priorContext)));
    let votesTrue = 0, votesFalse = 0, abstain = 0;
    for (const v of votes) {
      if (v.vote === true) votesTrue++;
      else if (v.vote === false) votesFalse++;
      else abstain++;
    }
    const voting = votesTrue + votesFalse;
    const outcomeTrue = votesTrue > votesFalse; // ties resolve FALSE (conservative)
    const agreement = voting === 0 ? 0 : Math.max(votesTrue, votesFalse) / voting;
    return {
      question,
      outcomeTrue,
      votesTrue,
      votesFalse,
      abstain,
      agreement,
      votes,
      configPreimage: this.configPreimage(),
      decidedAt: Date.now(),
    };
  }
}
