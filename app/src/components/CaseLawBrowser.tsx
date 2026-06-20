"use client";

import { useState } from "react";
import type { CaseLawHit } from "@/lib/types";

const KIND_TONE: Record<string, string> = {
  verdict: "text-verdict-true border-verdict-true/40",
  case_law: "text-justice border-justice/40",
  committee_vote: "text-text-muted border-steel/40",
};

const SUGGESTIONS = [
  "milestone delivered at 80% of spec",
  "risk disclosure adequacy",
  "governance delegated authority",
];

export function CaseLawBrowser() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CaseLawHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function search(q: string) {
    const term = q.trim();
    if (!term) return;
    setQuery(term);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/recall", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: term, k: 8 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "recall failed");
      setHits(data.hits ?? []);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          search(query);
        }}
        className="hud-panel mb-4 flex items-center gap-2 p-2"
      >
        <span className="pl-2 font-mono text-justice">⚖</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the tribunal's prior rulings…"
          className="flex-1 bg-transparent px-1 py-2 text-sm text-text placeholder:text-text-faint focus:outline-none"
        />
        <button type="submit" disabled={loading} className="btn-justice">
          {loading ? "Recalling…" : "Recall"}
        </button>
      </form>

      <div className="mb-6 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => search(s)} className="chip-mono hover:border-justice/60 hover:text-justice">
            {s}
          </button>
        ))}
      </div>

      {error && (
        <div className="hud-panel mb-4 border-verdict-false/40 p-4 text-sm text-verdict-false">{error}</div>
      )}

      {hits && hits.length === 0 && !loading && (
        <p className="text-sm text-text-muted">No matching precedent yet. The tribunal&apos;s case law grows with every settled ruling.</p>
      )}

      <div className="space-y-3">
        {(hits ?? []).map((h, i) => (
          <div key={`${h.quiltId}-${i}`} className="hud-panel animate-fade-up p-4" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className={`pill ${KIND_TONE[h.kind] ?? "border-steel/40 text-text-muted"}`}>{h.kind}</span>
              <span className="font-mono text-[11px] text-text-faint">match {h.score.toFixed(3)}</span>
            </div>
            <p className="text-sm leading-relaxed text-text">{h.text}</p>
            <div className="mt-2.5 font-mono text-[10px] text-text-faint">
              recalled from Walrus · quilt {h.quiltId.slice(0, 16)}…
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
