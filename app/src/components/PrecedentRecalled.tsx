// Server-side "Typed Walrus memory for this case" panel.
//
// Surfaces the typed entries this case wrote to Walrus — verdict, case_law,
// committee re-run — anchored back to its own on-chain caseId. We DELIBERATELY
// scope to this case's own quilt (battle.evidenceQuiltId) so the panel does
// not bleed in another case's verdict. Cross-case precedent lookup belongs on
// /precedent, not on a single battle page.
//
// Server component — runs at request time on Vercel. If recall fails we render
// nothing; the panel is provenance enhancement, not critical UX.

import { recall } from "@/lib/server/recall";
import { FullHash } from "@/components/Hash";
import { explorerObject } from "@/lib/chain";
import type { Battle } from "@/lib/types";

const KIND_TONE: Record<string, string> = {
  verdict: "text-verdict-true border-verdict-true/40",
  case_law: "text-justice border-justice/40",
  committee_vote: "text-text-muted border-steel/40",
};

const KIND_LABEL: Record<string, string> = {
  verdict: "Binding verdict",
  case_law: "Case law",
  committee_vote: "Re-run committee (drift transparency)",
};

export async function PrecedentRecalled({ battle }: { battle: Battle }) {
  // No quilt persisted yet -> render nothing.
  if (!battle.evidenceQuiltId) return null;

  // Compose a query that mixes the question with the resolution standard
  // so the verdict + case_law rank above the (off-topic) committee_vote.
  const query = `${battle.challenge}\n\n${battle.criteria ?? ""}`.trim();

  let hits: Awaited<ReturnType<typeof recall>> = [];
  try {
    // Scope recall to this case's own quilt — no cross-case bleed.
    hits = await recall(query, [battle.evidenceQuiltId], 8);
  } catch {
    return null;
  }

  // Defensive filter: in case the quilt anchor row mis-labels caseId, drop
  // anything that explicitly belongs to a DIFFERENT on-chain case.
  const ownHits = hits.filter((h) => !h.caseId || h.caseId === battle.caseId);
  if (ownHits.length === 0) return null;

  return (
    <div className="hud-panel mb-6 p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
            This case&apos;s typed Walrus memory
          </div>
          <p className="mt-1 text-[13px] text-text-muted">
            Every entry below was written to one Walrus Quilt by this case&apos;s
            jury &amp; guardrail, anchored to the on-chain case object. Sealed
            entries (debate transcript, jury deliberation) decrypt only once the
            case has settled — visible to a reader with the right
            <code className="mx-1 rounded bg-steel/15 px-1 py-px font-mono text-[11px]">seal_approve</code>
            predicate.
          </p>
        </div>
        <span className="font-mono text-[10px] text-text-faint">{ownHits.length} typed</span>
      </div>

      <div className="space-y-3">
        {ownHits.map((h, i) => (
          <article key={`${h.quiltId}-${i}`} className="rounded-xl border border-steel/30 p-4">
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className={`pill ${KIND_TONE[h.kind] ?? "border-steel/40 text-text-muted"}`}>
                {KIND_LABEL[h.kind] ?? h.kind}
              </span>
              <span className="font-mono text-[11px] text-text-faint">match {h.score.toFixed(3)}</span>
            </header>
            <p className="text-sm leading-relaxed text-text">{h.text}</p>
            <footer className="mt-3 grid gap-1.5 font-mono text-[10px] text-text-faint">
              {h.caseId && (
                <a
                  href={explorerObject(h.caseId)}
                  target="_blank"
                  rel="noreferrer"
                  className="truncate hover:text-justice"
                >
                  on-chain case {h.caseId} ↗
                </a>
              )}
              <span className="truncate">walrus quilt {h.quiltId}</span>
            </footer>
          </article>
        ))}
      </div>

      <div className="mt-4 border-t border-steel/20 pt-3">
        <FullHash label="this case's case-law quilt" value={battle.evidenceQuiltId} />
        <p className="mt-3 text-[12px] text-text-muted">
          Want to see how the next case recalls THIS one as precedent?{" "}
          <a href="/precedent" className="text-justice hover:underline">
            Open Case Law →
          </a>
        </p>
      </div>
    </div>
  );
}
