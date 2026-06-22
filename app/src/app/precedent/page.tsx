import { CaseLawBrowser, type CaseScope } from "@/components/CaseLawBrowser";

export const metadata = {
  title: "Case Law — Tribunal Arena",
  description:
    "Semantic recall over the tribunal's accumulated, typed precedent on Walrus, scoped per case.",
};

// Per-case scopes. Each entry maps a settled v3 case to its own Walrus quilt
// and a suggested query that ranks its verdict + case_law above the drift row.
//
// Keep in lockstep with app/src/lib/mock.ts evidenceQuiltId fields and
// app/src/app/api/recall/route.ts SEED_QUILTS.
const SCOPES: CaseScope[] = [
  {
    id: "zk-soundness-bounty",
    title: "zk-rollup audit bounty — soundness without exploit",
    blurb:
      "A $1M zk audit bounty pays for soundness bugs. An auditor found a missing range-check on a 254-bit witness with no reachable end-to-end exploit. Does the bounty pay?",
    quiltId: "f_KqulylakARqv6Dk1V00IJGMSvhpI7JgJnA1S31Xg0",
    caseId: "0xf7b15c1b3045644a0a11e4f34612a163010464baa29ec07de56c2271b52206cf",
    suggestion: "zk soundness missing range-check unreachable exploit Halo2",
  },
  {
    id: "stake-flow-schema",
    title: "First-staker advocacy + 3× weight settlement",
    blurb:
      "Does the v3 schema settle correctly when the first stake on each side locks the advocate slot at 3× weight and claim math drains the losing pool?",
    quiltId: "pcwId8Wi5MqhnbAlwiP_GcFrxZwjGHwJGKidy8_cgXQ",
    caseId: "0xfcda6e93ff4a6283bfb599522b839ad0aa0d722753aafe88542cc8a157966dcb",
    suggestion: "first staker advocate slot 3x weight claim losing pool",
  },
];

export default function PrecedentPage() {
  return (
    <div className="animate-fade-up py-2">
      <div className="mb-6">
        <span className="pill mb-3 border-justice/40 text-justice">the differentiator</span>
        <h1 className="font-display text-3xl font-700 leading-tight text-text">Case Law</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-text-muted">
          Every ruling the tribunal makes is written to Walrus as{" "}
          <span className="text-text">typed</span> memory — not chat logs.{" "}
          <span className="text-verdict-true">Verdicts</span> and{" "}
          <span className="text-justice">case law</span> are public and auditable; the
          deliberation behind them is sealed until a case settles. A new case can recall this
          precedent and is pushed to rule consistently — or be overturned.
        </p>
      </div>

      <CaseLawBrowser scopes={SCOPES} />
    </div>
  );
}
