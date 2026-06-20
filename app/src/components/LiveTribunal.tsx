"use client";

import { useState } from "react";
import type { Battle, Verdict } from "@/lib/types";

function ConfidenceBar({ value, vote }: { value: number; vote: boolean | null }) {
  const color = vote === true ? "bg-verdict-true" : vote === false ? "bg-verdict-false" : "bg-text-faint";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink">
      <div className={`h-full ${color}`} style={{ width: `${Math.round(value * 100)}%` }} />
    </div>
  );
}

function JudgeCard({ vote }: { vote: Verdict["votes"][number] }) {
  const label = vote.vote === null ? "ABSTAIN" : vote.vote ? "AFFIRM" : "DENY";
  const tone =
    vote.vote === null ? "text-text-faint" : vote.vote ? "text-verdict-true" : "text-verdict-false";
  return (
    <div className="hud-panel animate-fade-up p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-text-muted">{vote.model}</span>
        <span className={`font-display text-sm font-700 ${tone}`}>{label}</span>
      </div>
      <ConfidenceBar value={vote.confidence} vote={vote.vote} />
      <p className="mt-2.5 text-[13px] leading-relaxed text-text-muted">
        {vote.error ? <span className="text-verdict-false">error: {vote.error}</span> : vote.rationale}
      </p>
      {!vote.error && (
        <div className="mt-2 font-mono text-[10px] text-text-faint">
          confidence {Math.round(vote.confidence * 100)}%
        </div>
      )}
    </div>
  );
}

export function LiveTribunal({ battle }: { battle: Battle }) {
  const [verdict, setVerdict] = useState<Verdict | null>(battle.verdict ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function summon() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: battle.challenge, evidence: battle.evidence }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "judge failed");
      setVerdict(data.verdict);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-600 text-text">The Tribunal</h2>
        <button onClick={summon} disabled={loading} className="btn-justice">
          {loading ? "Deliberating…" : verdict ? "Re-summon Tribunal" : "Summon Tribunal"}
        </button>
      </div>

      {loading && (
        <div className="hud-panel relative mb-4 overflow-hidden p-5">
          <div className="absolute inset-x-0 top-0 h-0.5 bg-justice/40">
            <div className="h-full w-1/3 bg-justice animate-deliberate" />
          </div>
          <p className="text-sm text-text-muted">
            The committee is reviewing the evidence. Each judge votes independently…
          </p>
        </div>
      )}

      {error && (
        <div className="hud-panel mb-4 border-verdict-false/40 p-4 text-sm text-verdict-false">
          {error}
        </div>
      )}

      {verdict && (
        <>
          {/* Verdict banner */}
          <div
            className={`hud-panel mb-5 p-6 text-center ${
              verdict.outcomeTrue ? "shadow-glow-true" : "shadow-glow-false"
            }`}
          >
            <div className="font-mono text-[11px] uppercase tracking-[0.3em] text-text-faint">
              Verdict
            </div>
            <div
              className={`my-1 font-display text-4xl font-900 ${
                verdict.outcomeTrue ? "text-verdict-true" : "text-verdict-false"
              }`}
            >
              {verdict.outcomeTrue ? "AFFIRMED" : "DENIED"}
            </div>
            <div className="text-sm text-text-muted">
              {verdict.votesTrue}–{verdict.votesFalse}
              {verdict.abstain ? ` (${verdict.abstain} abstain)` : ""} · {Math.round(verdict.agreement * 100)}% agreement
            </div>
          </div>

          {/* Judge panel */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {verdict.votes.map((v) => (
              <JudgeCard key={v.model} vote={v} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
