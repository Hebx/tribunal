// Smoke test: run a real 2-round debate against the live gateway.
//   cd app && node --import tsx src/lib/server/verify-debate.mts
import { runDebate, type CaseInput, type AdvocatePersona } from "./debate";

const CASE: CaseInput = {
  question: "Did the grantee meet Milestone 2 of the DAO build grant?",
  criteria: "The deliverable must substantially match the written specification agreed at grant time.",
  evidence:
    "The grantee shipped a working product that implements ~80% of the written spec. Two of ten listed features are missing; the eight delivered features work and cover the core use case. No deadline was breached.",
};

const AFFIRMER: AdvocatePersona = {
  handle: "Advocate-Y",
  systemPrompt:
    'You are a Tribunal agent with the "Pragmatist" judicial lens. You judge by real-world outcomes and practical usability over formal completeness. Substantial performance that achieves the goal weighs heavily.',
};
const DENIER: AdvocatePersona = {
  handle: "Advocate-N",
  systemPrompt:
    'You are a Tribunal agent with the "Textualist" judicial lens. You reason strictly from the literal text of rules, specs, and criteria. Intent and spirit are secondary to what is written.',
};

async function main() {
  console.log("Running 2-round debate against the live gateway…\n");
  const t0 = Date.now();
  const d = await runDebate(CASE, AFFIRMER, DENIER, 2);
  const ms = Date.now() - t0;
  for (const round of d.rounds) {
    console.log(`══════ ROUND ${round.round} ══════`);
    for (const a of round.arguments) {
      console.log(`\n[${a.side.toUpperCase()}] ${a.handle}`);
      console.log(`  claim: ${a.claim}`);
      console.log(`  reasoning: ${a.reasoning}`);
      if (a.rebuttal) console.log(`  rebuttal: ${a.rebuttal}`);
    }
    console.log("");
  }
  // Basic sanity: each round has both sides with non-empty claims.
  let ok = true;
  for (const round of d.rounds) {
    if (round.arguments.length !== 2) ok = false;
    for (const a of round.arguments) if (!a.claim || !a.reasoning) ok = false;
  }
  // Round 2 should contain rebuttals.
  const round2 = d.rounds.find((r) => r.round === 2);
  const hasRebuttal = round2?.arguments.some((a) => a.rebuttal.length > 0);
  console.log(`\n${ok ? "✅" : "❌"} structure valid · rebuttals present: ${hasRebuttal} · ${ms}ms`);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
