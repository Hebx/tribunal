"use client";

// Per-case Case Law browser.
//
// Renders one card per known case, populated with that case's typed Walrus
// entries (verdict, case_law, committee_vote). A free-text filter narrows
// within the case's own entries — never bleeds across cases. The chip below
// each card is a per-case "recall like this" preset that scrolls to the top
// match within that case's quilt.

import { useEffect, useMemo, useState } from "react";
import type { CaseLawHit } from "@/lib/types";

export interface CaseScope {
  /** Stable card id used in keys + scrolling. */
  id: string;
  /** Human title shown on the card. */
  title: string;
  /** One-line summary of what the case decided. */
  blurb: string;
  /** Walrus quilt that holds this case's typed memory. */
  quiltId: string;
  /** On-chain case object id (for SuiScan deep links). */
  caseId: string;
  /** Pre-suggested query that ranks this case's own entries high. */
  suggestion: string;
}

const KIND_TONE: Record<string, string> = {
  verdict: "text-verdict-true border-verdict-true/40",
  case_law: "text-justice border-justice/40",
  committee_vote: "text-text-muted border-steel/40",
};

const KIND_LABEL: Record<string, string> = {
  verdict: "Binding verdict",
  case_law: "Case law",
  committee_vote: "Re-run drift",
};

const EXPLORER = "https://testnet.suivision.xyz/object";

/** Recall against one case's quilt — never pools across cases. */
async function recallForCase(quiltId: string, query: string): Promise<CaseLawHit[]> {
  const res = await fetch("/api/recall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, k: 8, quiltIds: [quiltId] }),
  });
  if (!res.ok) throw new Error(`recall failed: ${res.status}`);
  const data = await res.json();
  return (data.hits ?? []) as CaseLawHit[];
}

function CaseCard({ scope }: { scope: CaseScope }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<CaseLawHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load this case's typed entries on first render, using the preset
  // suggestion so the verdict + case_law rank above the drift row.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    recallForCase(scope.quiltId, scope.suggestion)
      .then((rows) => {
        if (!cancelled) setHits(rows);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e?.message ?? e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope.quiltId, scope.suggestion]);

  async function runSearch(q: string) {
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await recallForCase(scope.quiltId, term);
      setHits(rows);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section id={`case-${scope.id}`} className="hud-panel p-5">
      <header className="mb-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="pill border-justice/40 text-justice">case · {scope.id}</span>
          <a
            href={`${EXPLORER}/${scope.caseId}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-[10px] text-text-faint hover:text-justice"
          >
            {scope.caseId.slice(0, 12)}… ↗
          </a>
        </div>
        <h3 className="font-display text-lg font-700 text-text">{scope.title}</h3>
        <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{scope.blurb}</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
        className="mb-3 flex items-center gap-2 rounded-xl border border-steel/30 p-2"
      >
        <span className="pl-2 font-mono text-justice">⚖</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Search within this case's memory…`}
          className="flex-1 bg-transparent px-1 py-1.5 text-sm text-text placeholder:text-text-faint focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading}
          className="btn-justice px-3 py-1.5 text-xs"
        >
          {loading ? "…" : "Recall"}
        </button>
      </form>

      <div className="mb-3">
        <button
          onClick={() => {
            setQuery(scope.suggestion);
            runSearch(scope.suggestion);
          }}
          className="chip-mono hover:border-justice/60 hover:text-justice"
          disabled={loading}
        >
          {scope.suggestion}
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-verdict-false/40 p-3 text-sm text-verdict-false">
          {error}
        </div>
      )}

      {!loading && hits && hits.length === 0 && (
        <p className="text-sm text-text-muted">No entries match. Try a different query.</p>
      )}

      <div className="space-y-3">
        {(hits ?? []).map((h, i) => (
          <article
            key={`${h.quiltId}-${i}`}
            className="rounded-xl border border-steel/30 p-3 animate-fade-up"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <header className="mb-2 flex items-center justify-between gap-3">
              <span
                className={`pill ${KIND_TONE[h.kind] ?? "border-steel/40 text-text-muted"}`}
              >
                {KIND_LABEL[h.kind] ?? h.kind}
              </span>
              <span className="font-mono text-[11px] text-text-faint">
                match {h.score.toFixed(3)}
              </span>
            </header>
            <p className="text-sm leading-relaxed text-text">{h.text}</p>
            <footer className="mt-2 truncate font-mono text-[10px] text-text-faint">
              walrus quilt {h.quiltId}
            </footer>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CaseLawBrowser({ scopes }: { scopes: CaseScope[] }) {
  const cards = useMemo(() => scopes, [scopes]);

  return (
    <div>
      <div className="hud-panel mb-6 p-4 text-[13px] leading-relaxed text-text-muted">
        Each card below is one settled case. The browser is{" "}
        <span className="text-text">scoped per case</span> — searches never bleed across
        cases. Pick a case and recall within its typed Walrus memory.
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {cards.map((s) => (
          <CaseCard key={s.id} scope={s} />
        ))}
      </div>
    </div>
  );
}
