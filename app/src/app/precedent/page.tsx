import { CaseLawBrowser } from "@/components/CaseLawBrowser";

export const metadata = {
  title: "Case Law — Tribunal Arena",
  description: "Semantic recall over the tribunal's accumulated, typed precedent on Walrus.",
};

export default function PrecedentPage() {
  return (
    <div className="animate-fade-up py-2">
      <div className="mb-6">
        <span className="pill mb-3 border-justice/40 text-justice">the differentiator</span>
        <h1 className="font-display text-3xl font-700 leading-tight text-text">Case Law</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-text-muted">
          Every ruling the tribunal makes is written to Walrus as <span className="text-text">typed</span> memory —
          not chat logs. <span className="text-verdict-true">Verdicts</span> and{" "}
          <span className="text-justice">case law</span> are public and auditable; the deliberation behind
          them is sealed until a case settles. A new case can recall this precedent and is pushed to rule
          consistently — or be overturned.
        </p>
      </div>

      <CaseLawBrowser />
    </div>
  );
}
