"use client";

// LiveTribunal v2 — the persona-debate panel.
//
// Hits POST /api/resolve and renders the full VerdictBundle:
//   - debate transcript (round-by-round, both sides)
//   - jury first pass + final votes + dissent + disagreement rate
//   - guardrail judge ratification / override + bias flags + binding verdict
//
// The advocates and jurors are derived from a small archetype mix on the
// client; for a real case the owner-staked agents and their personas would be
// passed in from the parent. This component degrades gracefully if /api/resolve
// is not configured (no gateway key) — it surfaces the error inline.

import { useState } from "react";
import type { Battle } from "@/lib/types";

interface DebateArgument {
  side: "yes" | "no";
  claim: string;
  reasoning: string;
  rebuttal?: string;
}
interface DebateRound { round: number; arguments: DebateArgument[] }
interface JurorVote {
  handle: string;
  vote: boolean | null;
  confidence: number;
  rationale: string;
  revised?: boolean;
}
interface JuryResult {
  firstPass: JurorVote[];
  finalVotes: JurorVote[];
  outcome: boolean;
  votesTrue: number;
  votesFalse: number;
  abstain: number;
  dissent: number;
  disagreementRate: number;
}
interface GuardrailDecision {
  finalOutcome: boolean;
  ratifiedJury: boolean;
  overrideReason: string;
  biasFlags: string[];
  confidence: number;
  reasoning: string;
}
interface VerdictBundle {
  debate: { rounds: DebateRound[] };
  jury: JuryResult;
  guardrail: GuardrailDecision;
  finalOutcome: boolean;
  models: { advocate: string; jury: string; guardrail: string };
  configHashHex: string;
  decidedAt: number;
}

const DEFAULT_AGENTS = {
  affirmer: {
    handle: "Pragmatist-04",
    systemPrompt:
      'You are a Tribunal agent with the "Pragmatist" judicial lens. You judge by real-world outcomes and practical usability over formal completeness. Substantial performance that achieves the goal weighs heavily.',
  },
  denier: {
    handle: "Textualist-07",
    systemPrompt:
      'You are a Tribunal agent with the "Textualist" judicial lens. You reason strictly from the literal text of rules and specs. Intent is secondary to what is written; you resist reading in unstated leniency.',
  },
  jurors: [
    {
      handle: "Juror-Textualist-07",
      systemPrompt:
        'You are a Tribunal juror with the "Textualist" lens. The words on the page control. You resist reading in unstated leniency or implied materiality thresholds.',
    },
    {
      handle: "Juror-Pragmatist-04",
      systemPrompt:
        'You are a Tribunal juror with the "Pragmatist" lens. Substantial performance that achieves the core goal weighs heavily; minor omissions that do not break the use case are forgivable.',
    },
    {
      handle: "Juror-Risk-Hawk-02",
      systemPrompt:
        'You are a Tribunal juror with the "Risk-Hawk" lens. What could go wrong is what matters. Material control gaps decide cases.',
    },
  ],
};

function Pct({ x }: { x: number }) {
  return <span>{Math.round(x * 100)}%</span>;
}

function VoteBadge({ vote }: { vote: boolean | null }) {
  const label = vote === null ? "ABSTAIN" : vote ? "YES" : "NO";
  const tone =
    vote === null
      ? "text-text-faint border-text-faint/40"
      : vote
        ? "text-verdict-true border-verdict-true/50"
        : "text-verdict-false border-verdict-false/50";
  return <span className={`pill shrink-0 ${tone}`}>{label}</span>;
}

export function LiveTribunalV2({ battle }: { battle: Battle }) {
  const [bundle, setBundle] = useState<VerdictBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("");

  async function resolve() {
    setLoading(true);
    setError(null);
    setBundle(null);
    setPhase("debate");
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: battle.challenge,
          criteria: battle.criteria,
          evidence: battle.evidence,
          ...DEFAULT_AGENTS,
          rounds: 2,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "resolve failed");
      setBundle(data.bundle);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
      setPhase("");
    }
  }

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-600 text-text">The Bench (v2)</h2>
          <p className="font-mono text-[11px] text-text-faint">
            advocates argue · jury deliberates · guardrail rules
          </p>
        </div>
        <button onClick={resolve} disabled={loading} className="btn-justice">
          {loading ? "Convening…" : bundle ? "Re-judge" : "Convene the jury"}
        </button>
      </div>

      {loading && (
        <div className="hud-panel relative mb-4 overflow-hidden p-5">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-justice/40">
            <div className="h-full w-1/3 bg-justice animate-deliberate" />
          </div>
          <p className="text-sm text-text-muted">
            {phase === "debate" ? "Advocates are arguing both sides…" : "Deliberating…"}
          </p>
        </div>
      )}

      {error && (
        <div className="hud-panel mb-4 border-verdict-false/40 p-4 text-sm text-verdict-false">
          {error}
        </div>
      )}

      {bundle && (
        <div className="space-y-6">
          {/* Binding verdict */}
          <div
            className={`hud-panel p-6 text-center ${
              bundle.finalOutcome ? "shadow-glow-true" : "shadow-glow-false"
            }`}
          >
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-text-faint">
              Binding verdict (guardrail)
            </div>
            <div
              className={`my-1 font-display text-4xl font-900 ${
                bundle.finalOutcome ? "text-verdict-true" : "text-verdict-false"
              }`}
            >
              {bundle.finalOutcome ? "YES" : "NO"}
            </div>
            <div className="text-sm text-text-muted">
              jury {bundle.jury.votesTrue}–{bundle.jury.votesFalse}
              {bundle.jury.abstain ? ` (${bundle.jury.abstain} abstain)` : ""}
              {bundle.guardrail.ratifiedJury ? (
                <span className="ml-2">· guardrail ratified</span>
              ) : (
                <span className="ml-2 text-gold">· guardrail OVERRODE jury</span>
              )}
              <span className="ml-2 text-text-faint">
                · disagreement rate <Pct x={bundle.jury.disagreementRate} />
              </span>
            </div>
            {!bundle.guardrail.ratifiedJury && bundle.guardrail.overrideReason && (
              <p className="mx-auto mt-3 max-w-xl text-[12px] leading-relaxed text-gold">
                Override reason: {bundle.guardrail.overrideReason}
              </p>
            )}
            {bundle.guardrail.biasFlags.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {bundle.guardrail.biasFlags.map((f) => (
                  <span key={f} className="pill border-gold/50 text-gold">
                    ⚑ {f}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Debate transcript */}
          <div>
            <h3 className="mb-3 font-display text-base font-600 text-text">Debate transcript</h3>
            <div className="space-y-4">
              {bundle.debate.rounds.map((r) => (
                <div key={r.round}>
                  <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-text-faint">
                    Round {r.round}
                  </div>
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {r.arguments.map((a, i) => {
                      const yes = a.side === "yes";
                      return (
                        <div
                          key={`${r.round}-${i}`}
                          className="hud-panel p-4"
                          style={{
                            borderColor: yes
                              ? "rgba(52,211,153,0.3)"
                              : "rgba(244,63,94,0.3)",
                          }}
                        >
                          <div
                            className={`mb-1 font-mono text-[10px] uppercase tracking-wider ${
                              yes ? "text-verdict-true" : "text-verdict-false"
                            }`}
                          >
                            side · {yes ? "YES" : "NO"}
                          </div>
                          <p className="text-sm font-600 text-text">{a.claim}</p>
                          <p className="mt-1 text-[13px] leading-relaxed text-text-muted">
                            {a.reasoning}
                          </p>
                          {a.rebuttal && (
                            <p className="mt-2 border-l-2 border-text-faint/30 pl-2 text-[12px] leading-relaxed text-text-faint">
                              ↳ rebuttal: {a.rebuttal}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Jury — first pass vs final */}
          <div>
            <h3 className="mb-3 font-display text-base font-600 text-text">
              Jury deliberation
            </h3>
            <p className="mb-3 font-mono text-[11px] text-text-faint">
              first pass is independent (anchoring-resistant); final follows one round of
              cross-examination. dissent is preserved.
            </p>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <JurySection title="First pass" votes={bundle.jury.firstPass} />
              <JurySection title="Final" votes={bundle.jury.finalVotes} showRevised />
            </div>
          </div>

          {/* Guardrail reasoning */}
          <div className="hud-panel p-4">
            <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-text-faint">
              Guardrail reasoning ({bundle.models.guardrail}) · confidence{" "}
              <Pct x={bundle.guardrail.confidence} />
            </div>
            <p className="text-[13px] leading-relaxed text-text">{bundle.guardrail.reasoning}</p>
          </div>

          {/* Config hash */}
          <div className="text-center font-mono text-[10px] text-text-faint">
            resolver config hash · {bundle.configHashHex.slice(0, 16)}…{" "}
            <span className="text-text-muted">
              ({bundle.models.advocate} / {bundle.models.jury} / {bundle.models.guardrail})
            </span>
          </div>
        </div>
      )}
    </section>
  );
}

function JurySection({
  title,
  votes,
  showRevised = false,
}: {
  title: string;
  votes: JurorVote[];
  showRevised?: boolean;
}) {
  return (
    <div className="hud-panel p-4">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-text-faint">
        {title}
      </div>
      <div className="space-y-3">
        {votes.map((v, i) => (
          <div key={`${title}-${i}`} className="border-b border-steel/15 pb-3 last:border-b-0 last:pb-0">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="font-mono text-xs text-text">{v.handle}</span>
              <div className="flex items-center gap-2">
                {showRevised && v.revised && (
                  <span className="pill border-gold/50 text-gold">revised</span>
                )}
                <VoteBadge vote={v.vote} />
              </div>
            </div>
            <p className="text-[12px] leading-relaxed text-text-muted">{v.rationale}</p>
            <div className="mt-1 font-mono text-[10px] text-text-faint">
              confidence <Pct x={v.confidence} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
