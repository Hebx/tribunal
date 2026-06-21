// Server-side "precedent the jury recalled" panel.
//
// Calls the same recall function the /precedent page uses, but seeded with this
// specific case's question + criteria so the top hits are the precedent most
// relevant to THIS ruling. Rendered on the battle page so a visitor can see
// what the jury would be anchored on before the verdict is cast — or what
// precedent the settled verdict was consistent with after the fact.
//
// Server component — runs at request time on Vercel, caches per case for
// 5 minutes. No client JS needed; if recall fails we render nothing.

import { recall } from "@/lib/server/recall";
import { FullHash } from "@/components/Hash";
import { explorerObject } from "@/lib/chain";
import type { Battle } from "@/lib/types";

// Match `/api/recall`. Keep in lockstep — when seed-arena reseeds, update both.
const SEED_QUILTS = [
  "f_KqulylakARqv6Dk1V00IJGMSvhpI7JgJnA1S31Xg0", // zk-soundness-bounty (0xf7b15c…06cf)
  "pcwId8Wi5MqhnbAlwiP_GcFrxZwjGHwJGKidy8_cgXQ", // stake-flow-schema (0xfcda6e…6dcb)
];

const KIND_TONE: Record<string, string> = {
  verdict: "text-verdict-true border-verdict-true/40",
  case_law: "text-justice border-justice/40",
  committee_vote: "text-text-muted border-steel/40",
};

export async function PrecedentRecalled({ battle }: { battle: Battle }) {
  // Compose a query that mixes the question with the resolution standard
  // (criteria) — gives the embedder the legal angle alongside the factual one.
  const query = `${battle.challenge}\n\n${battle.criteria ?? ""}`.trim();

  let hits: Awaited<ReturnType<typeof recall>> = [];
  try {
    hits = await recall(query, SEED_QUILTS, 4);
  } catch {
    // best-effort; the precedent panel is provenance enhancement, not critical UX
    return null;
  }

  // Filter out the case's own ruling — recall on /precedent should self-cite,
  // but on the battle page itself "look up your own verdict" is noise. Keep
  // hits from OTHER cases (the truly recalled precedent).
  const otherCaseHits = hits.filter((h) => !h.caseId || h.caseId !== battle.caseId);
  // Also keep one self-hit at the end labelled "this case's own ruling" so
  // the recall surface still shows the case's own typed memory exists.
  const ownHits = hits.filter((h) => h.caseId === battle.caseId);
  const top = otherCaseHits.slice(0, 3);

  if (top.length === 0 && ownHits.length === 0) return null;

  return (
    <div className="hud-panel mb-6 p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
            Precedent the jury recalled
          </div>
          <p className="mt-1 text-[13px] text-text-muted">
            Semantic recall from Walrus — typed verdicts &amp; case law from prior settled cases.
            Each hit links back to its on-chain case object.
          </p>
        </div>
        <span className="font-mono text-[10px] text-text-faint">top {top.length}</span>
      </div>

      <div className="space-y-3">
        {top.map((h, i) => (
          <article key={`${h.quiltId}-${i}`} className="rounded-xl border border-steel/30 p-4">
            <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className={`pill ${KIND_TONE[h.kind] ?? "border-steel/40 text-text-muted"}`}>{h.kind}</span>
              <span className="font-mono text-[11px] text-text-faint">match {h.score.toFixed(3)}</span>
            </header>
            <p className="text-sm leading-relaxed text-text">{h.text}</p>
            <footer className="mt-3 grid gap-1.5 font-mono text-[10px] text-text-faint">
              {h.caseId && (
                <a href={explorerObject(h.caseId)} target="_blank" rel="noreferrer" className="truncate hover:text-justice">
                  on-chain case {h.caseId} ↗
                </a>
              )}
              <span className="truncate">walrus quilt {h.quiltId}</span>
            </footer>
          </article>
        ))}
      </div>

      {ownHits.length > 0 && (
        <details className="mt-4 rounded-xl border border-steel/20 px-4 py-2 text-[13px]">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-text-faint hover:text-text-muted">
            this case&apos;s own ruling on Walrus ({ownHits.length})
          </summary>
          <div className="mt-3 space-y-3">
            {ownHits.map((h, i) => (
              <article key={`own-${h.quiltId}-${i}`} className="rounded-lg border border-steel/30 p-3">
                <span className={`pill mb-2 ${KIND_TONE[h.kind] ?? "border-steel/40 text-text-muted"}`}>{h.kind}</span>
                <p className="mt-1 text-[13px] leading-relaxed text-text-muted">{h.text}</p>
              </article>
            ))}
          </div>
        </details>
      )}

      {battle.evidenceQuiltId && (
        <div className="mt-4 border-t border-steel/20 pt-3">
          <FullHash label="this case's case-law quilt" value={battle.evidenceQuiltId} />
        </div>
      )}
    </div>
  );
}
