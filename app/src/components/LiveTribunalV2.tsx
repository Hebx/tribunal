"use client";

// LiveTribunal v2 — the persona-debate panel (v3 stake-gated).
//
// Hits POST /api/resolve with `{ caseId, rounds }`. The server resolves the
// matchup, jury, and personas from on-chain state — this component no longer
// ships any system prompts. Renders the full VerdictBundle:
//   - debate transcript (round-by-round, both sides)
//   - jury first pass + final votes + dissent + disagreement rate
//   - guardrail judge ratification / override + bias flags + binding verdict
//
// Error handling:
//   - 409 BothSidesMustStake → inline call-to-action pointing at the stake
//     panel (scrolls into view) — the case is gated until both sides have an
//     advocate.
//   - 404 NoCaseInput / no pool → surfaces the server's message verbatim.
//   - Other failures degrade gracefully (no gateway key, model error, etc.).

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
  personaTrapsRejected: string[];
}
interface VerdictBundle {
  debate: { rounds: DebateRound[] };
  jury: JuryResult;
  guardrail: GuardrailDecision;
  finalOutcome: boolean;
  models: { advocate: string; jury: string; guardrail: string };
  configHashHex: string;
  guardrailConfigHash: string;
  decidedAt: number;
}

/** Scroll the stake panel into view; called when the gated 409 lands. */
function scrollToStakePanel() {
  if (typeof document === "undefined") return;
  const el = document.getElementById("stake-in-panel");
  if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
}

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
  const [gated, setGated] = useState<{ emptySides: ("yes" | "no")[] } | null>(null);
  const [phase, setPhase] = useState<string>("");

  async function resolve() {
    if (!battle.caseId) {
      setError("This battle has no on-chain caseId — cannot resolve.");
      return;
    }
    setLoading(true);
    setError(null);
    setBundle(null);
    setGated(null);
    setPhase("debate");
    try {
      const res = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: battle.caseId, rounds: 2 }),
      });
      const data = await res.json();
      if (res.status === 409 && data?.code === "BothSidesMustStake") {
        setGated({ emptySides: data.emptySides ?? [] });
        return;
      }
      if (!res.ok) throw new Error(data?.error ?? `resolve failed (HTTP ${res.status})`);
      setBundle(data.bundle);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
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

      {gated && (
        <div className="hud-panel mb-4 border-gold/50 p-5">
          <div className="mb-2 font-mono text-[11px] uppercase tracking-wider text-gold">
            ⚑ stake required
          </div>
          <p className="mb-3 text-sm text-text">
            Both sides need a staked agent before this case can be judged.{" "}
            <span className="text-text-muted">
              Missing: {gated.emptySides.map((s) => s.toUpperCase()).join(" + ")}
            </span>
          </p>
          <button onClick={scrollToStakePanel} className="btn-justice">
            Stake first ↗
          </button>
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
            {bundle.guardrail.personaTrapsRejected.length > 0 && (
              <div className="mt-3 text-left">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-text-faint">
                  Persona traps rejected
                </div>
                <ul className="space-y-1 text-[11px] text-text-muted">
                  {bundle.guardrail.personaTrapsRejected.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-gold">↳</span>
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
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

          {/* Config hashes */}
          <div className="space-y-1 text-center font-mono text-[10px] text-text-faint">
            <div>
              resolver config hash · {bundle.configHashHex.slice(0, 16)}…{" "}
              <span className="text-text-muted">
                ({bundle.models.advocate} / {bundle.models.jury} / {bundle.models.guardrail})
              </span>
            </div>
            <div>guardrail prompt hash · {bundle.guardrailConfigHash.slice(0, 16)}…</div>
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
