"use client";

import { useState } from "react";
import type { Battle, Verdict } from "@/lib/types";
import { isSplit, dissenters } from "@/lib/types";

function ConfidenceBar({ value, vote }: { value: number; vote: boolean | null }) {
  const color = vote === true ? "bg-verdict-true" : vote === false ? "bg-verdict-false" : "bg-text-faint";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink">
      <div className={`h-full ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function JudgeCard({ vote, dissenting }: { vote: Verdict["votes"][number]; dissenting: boolean }) {
  const label = vote.vote === null ? "ABSTAIN" : vote.vote ? "YES" : "NO";
  const tone = vote.vote === null ? "text-text-faint" : vote.vote ? "text-verdict-true" : "text-verdict-false";
  return (
    <div className={`hud-panel animate-fade-up p-4 ${dissenting ? "border-gold/50" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-text-muted">{vote.model}</span>
        <span className={`font-display text-sm font-700 ${tone}`}>{label}</span>
      </div>
      <ConfidenceBar value={vote.confidence} vote={vote.vote} />
      <p className="mt-2.5 text-[13px] leading-relaxed text-text-muted">
        {vote.error ? <span className="text-verdict-false">error: {vote.error}</span> : vote.rationale}
      </p>
      <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-text-faint">
        <span>{vote.error ? "" : `confidence ${Math.round(vote.confidence * 100)}%`}</span>
        {dissenting && <span className="text-gold">⚑ dissent</span>}
      </div>
    </div>
  );
}

export function LiveTribunal({ battle }: { battle: Battle }) {
  const [verdict, setVerdict] = useState<Verdict | null>(battle.verdict ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [citedPrecedent, setCitedPrecedent] = useState<string | null>(null);
  const [reconvened, setReconvened] = useState(false);

  // Reconvene = re-run the bench AS IF disputed: recall prior case law from
  // Walrus and feed it to the committee as precedent. This is the moment that
  // separates Tribunal from a prediction market AND from generic chat memory.
  async function summon(withPrecedent: boolean) {
    setLoading(true);
    setError(null);
    try {
      let priorContext: string | undefined;
      if (withPrecedent) {
        const r = await fetch("/api/recall", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: battle.challenge, k: 1 }),
        });
        const rd = await r.json();
        if (r.ok && rd.hits?.[0]) {
          priorContext = `Prior ruling [${rd.hits[0].kind}]: ${rd.hits[0].text}`;
          setCitedPrecedent(`${rd.hits[0].text} · score ${rd.hits[0].score.toFixed(2)}`);
        }
      }
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: battle.challenge, evidence: battle.evidence, priorContext }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "judge failed");
      setVerdict(data.verdict);
      setReconvened(withPrecedent);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  const split = verdict ? isSplit(verdict) : false;
  const dissentSet = new Set(verdict ? dissenters(verdict).map((d) => d.model) : []);

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-600 text-text">The Bench</h2>
          <p className="font-mono text-[11px] text-text-faint">
            an independent committee — not one model, not one oracle
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => summon(false)} disabled={loading} className="btn-ghost">
            {loading && !reconvened ? "Deliberating…" : verdict ? "Re-judge" : "Convene the panel"}
          </button>
          <button onClick={() => summon(true)} disabled={loading} className="btn-justice" title="Re-run as a dispute: recall prior case law and judge with precedent">
            {loading && reconvened ? "Reconvening…" : "Dispute → recall precedent"}
          </button>
        </div>
      </div>

      {loading && (
        <div className="hud-panel relative mb-4 overflow-hidden p-5">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-justice/40">
            <div className="h-full w-1/3 bg-justice animate-deliberate" />
          </div>
          <p className="text-sm text-text-muted">
            {reconvened
              ? "Recalling prior rulings from Walrus, then re-deliberating with precedent…"
              : "The committee is reviewing the evidence. Each judge votes independently…"}
          </p>
        </div>
      )}

      {error && (
        <div className="hud-panel mb-4 border-verdict-false/40 p-4 text-sm text-verdict-false">{error}</div>
      )}

      {citedPrecedent && (
        <div className="hud-panel mb-4 border-justice/40 p-4">
          <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-justice">
            ⚖ Precedent recalled from Walrus
          </div>
          <p className="text-[13px] leading-relaxed text-text">{citedPrecedent}</p>
        </div>
      )}

      {verdict && (
        <>
          <div className={`hud-panel mb-5 p-6 text-center ${verdict.outcomeTrue ? "shadow-glow-true" : "shadow-glow-false"}`}>
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-text-faint">Ruling</div>
            <div className={`my-1 font-display text-4xl font-900 ${verdict.outcomeTrue ? "text-verdict-true" : "text-verdict-false"}`}>
              {verdict.outcomeTrue ? "YES" : "NO"}
            </div>
            <div className="text-sm text-text-muted">
              {verdict.votesTrue}–{verdict.votesFalse}
              {verdict.abstain ? ` (${verdict.abstain} abstain)` : ""}
              {split ? (
                <span className="ml-2 text-gold">· split decision, dissent recorded</span>
              ) : (
                <span className="ml-2">· unanimous</span>
              )}
            </div>
            {split && (
              <p className="mx-auto mt-3 max-w-xl text-[12px] leading-relaxed text-text-faint">
                A reasonable panel disagreed — which is exactly why judgment here needs a committee
                and a dispute path, not a single verdict.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {verdict.votes.map((v) => (
              <JudgeCard key={v.model} vote={v} dissenting={dissentSet.has(v.model)} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
