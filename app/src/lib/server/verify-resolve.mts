// Live end-to-end resolution against the real Kiro gateway.
//   cd app && node --import tsx src/lib/server/verify-resolve.mts
//
// Proves the full v2 pipeline runs end-to-end AND that the persona jury can
// actually split on a genuinely contestable case (non-zero disagreementRate).
// If the jury is always unanimous, persona divergence is too weak — that's a
// real signal to strengthen the archetypes, so we fail loudly on a 0-split.

import { resolveCase, type ResolveAgents } from "./resolve";
import type { CaseInput } from "./debate";

// A deliberately contestable case: 80% delivery, missing features, no deadline
// breach — Textualists and Pragmatists should genuinely disagree.
const CASE: CaseInput = {
  question: "Did the grantee meet Milestone 2 of the DAO build grant?",
  criteria:
    "The deliverable must substantially match the written specification agreed at grant time.",
  evidence:
    "The grantee shipped a working product implementing 8 of the 10 specified features. " +
    "The 2 missing features are a CSV export and an admin audit log. The 8 delivered features " +
    "work and cover the core user journey. No deadline was breached. The original spec listed " +
    "all 10 features without marking any as optional.",
};

const lens = (name: string, core: string) =>
  `You are a Tribunal agent with the "${name}" judicial lens. ${core}`;

const AGENTS: ResolveAgents = {
  affirmer: {
    handle: "Advocate-Y",
    systemPrompt: lens(
      "Pragmatist",
      "You judge by real-world outcomes and practical usability over formal completeness. Substantial performance that achieves the goal weighs heavily.",
    ),
  },
  denier: {
    handle: "Advocate-N",
    systemPrompt: lens(
      "Textualist",
      "You reason strictly from the literal text of rules and specs. Intent is secondary to what is written; you resist reading in unstated leniency.",
    ),
  },
  jurors: [
    {
      handle: "Juror-Textualist",
      systemPrompt: lens(
        "Textualist",
        "The words on the page control. The spec listed ten features; eight is not ten. You resist reading in unstated leniency or an implied materiality threshold.",
      ),
    },
    {
      handle: "Juror-Pragmatist",
      systemPrompt: lens(
        "Pragmatist",
        "Does it work in practice? Substantial performance that achieves the core goal weighs heavily; minor omissions that don't break the use case are forgivable.",
      ),
    },
    {
      handle: "Juror-Risk-Hawk",
      systemPrompt: lens(
        "Risk-Hawk",
        "What could go wrong is what matters. A missing audit log is a material control gap, not a cosmetic omission. You are skeptical of 'good enough'.",
      ),
    },
  ],
};

function bool(b: boolean): string {
  return b ? "YES/TRUE" : "NO/FALSE";
}

async function main() {
  console.log("Running full resolution pipeline against the live gateway…\n");
  const t0 = Date.now();
  const b = await resolveCase(CASE, AGENTS, { rounds: 2 });
  const ms = Date.now() - t0;

  console.log("══════ DEBATE ══════");
  for (const round of b.debate.rounds) {
    console.log(`\n--- Round ${round.round} ---`);
    for (const a of round.arguments) {
      console.log(`[${a.side.toUpperCase()}] ${a.claim}`);
      console.log(`   ${a.reasoning}`);
      if (a.rebuttal) console.log(`   ↳ rebuttal: ${a.rebuttal}`);
    }
  }

  console.log("\n══════ JURY — FIRST PASS (independent) ══════");
  for (const v of b.jury.firstPass) {
    console.log(`[${bool(v.vote === true)}] ${v.handle} (conf ${v.confidence.toFixed(2)}): ${v.rationale}`);
  }
  console.log("\n══════ JURY — FINAL (after deliberation) ══════");
  for (const v of b.jury.finalVotes) {
    console.log(`[${v.vote === true ? "YES" : v.vote === false ? "NO" : "ABSTAIN"}] ${v.handle}${v.revised ? " [revised]" : ""} (conf ${v.confidence.toFixed(2)}): ${v.rationale}`);
  }
  console.log(
    `\nJury outcome: ${bool(b.jury.outcome)} · ${b.jury.votesTrue} YES / ${b.jury.votesFalse} NO / ${b.jury.abstain} abstain · ` +
      `dissent: ${b.jury.dissent} · disagreementRate: ${b.jury.disagreementRate.toFixed(2)}`,
  );

  console.log("\n══════ GUARDRAIL JUDGE (opus-4.8) ══════");
  console.log(`Final verdict: ${bool(b.guardrail.finalOutcome)}`);
  console.log(`Ratified jury: ${b.guardrail.ratifiedJury}`);
  if (!b.guardrail.ratifiedJury) console.log(`Override reason: ${b.guardrail.overrideReason}`);
  console.log(`Bias flags: ${b.guardrail.biasFlags.join(", ") || "(none)"}`);
  console.log(`Confidence: ${b.guardrail.confidence.toFixed(2)}`);
  console.log(`Reasoning: ${b.guardrail.reasoning}`);

  console.log(`\nModels: advocate=${b.models.advocate} jury=${b.models.jury} guardrail=${b.models.guardrail}`);
  console.log(`Config hash: ${b.configHashHex}`);
  console.log(`\nBINDING VERDICT: ${bool(b.finalOutcome)} · ${ms}ms`);

  // Assertions — the proof.
  const checks: [string, boolean][] = [
    ["pipeline produced a binding boolean verdict", typeof b.finalOutcome === "boolean"],
    ["debate ran 2 rounds, both sides each", b.debate.rounds.length === 2 && b.debate.rounds.every((r) => r.arguments.length === 2)],
    ["3 jurors voted (first pass + final)", b.jury.firstPass.length === 3 && b.jury.finalVotes.length === 3],
    ["binding verdict follows the guardrail", b.finalOutcome === b.guardrail.finalOutcome],
    ["config hash is a 64-hex digest", /^[0-9a-f]{64}$/.test(b.configHashHex)],
    ["an override (if any) carries a reason", b.guardrail.ratifiedJury || b.guardrail.overrideReason.length > 0],
    ["JURY ACTUALLY SPLIT on a contestable case (disagreementRate > 0)", b.jury.disagreementRate > 0],
  ];
  console.log("\n══════ CHECKS ══════");
  let allOk = true;
  for (const [label, ok] of checks) {
    console.log(`${ok ? "✅" : "❌"} ${label}`);
    if (!ok) allOk = false;
  }
  if (!allOk) {
    console.error("\n❌ one or more checks failed");
    process.exit(1);
  }
  console.log("\n✅ full pipeline verified end-to-end on the live gateway");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
