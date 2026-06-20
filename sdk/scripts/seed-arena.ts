// Seed the arena's case law on Walrus.
//
//   cd sdk && npm run seed-arena
//
// Runs the live committee on the arena's settled/appealed cases and writes their
// verdict + case_law entries to Walrus as PUBLIC (auditable) memory. Prints the
// resulting quilt ids so the app's /api/recall seed list can point at relevant
// precedent — making the demo's "Dispute → recall precedent" pull a genuinely
// related prior ruling instead of an unrelated one.
//
// This is the off-chain half of the thesis: judgment that accumulates as typed,
// recallable case law on Walrus.

import { homedir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "../src/memory/env.js";
import { Committee } from "../src/memory/committee.js";
import { TribunalMemory } from "../src/memory/index.js";
import { WalrusStore } from "../src/memory/walrus.js";
import { resolveEmbedder } from "../src/memory/embeddings.js";

const env = { ...loadEnv(join(homedir(), ".hermes", ".env")), ...process.env };

const MODELS = (env.TRIBUNAL_COMMITTEE_MODELS ??
  "claude-haiku-4.5,claude-sonnet-4.5,minimax-m2.5").split(",").map((s) => s.trim());
const PROMPT =
  "Resolve the question strictly on the supplied evidence and authoritative sources. " +
  "Be neutral; do not speculate beyond the evidence.";
const SOURCES = "official-announcements, primary-reporting, on-chain-data";

// The arena's contestable cases worth turning into precedent. Mirror the text in
// app/src/lib/mock.ts so recall against the live battles scores high.
const CASES = [
  {
    tag: "milestone",
    question:
      "Did the grantee meet Milestone 2 of the DAO build grant, given the deliverable shipped at ~80% of the written spec?",
    evidence:
      "The spec listed 5 acceptance criteria. The grantee shipped 4 fully and 1 partially (an admin dashboard, delivered read-only without the promised export + role management). The grant agreement defines Milestone 2 as 'a usable moderation console for stewards.' Stewards confirm the console is in daily use. The export feature was later flagged as 'needed for reporting, not for moderating.' No deadline was missed.",
    caseLaw:
      "Case law: a milestone defined by INTENT ('a usable moderation console') is met when the core acceptance criteria are satisfied and the deliverable is in active use, even if a non-core named item is only partially delivered. Substantial performance of the milestone's purpose governs over literal completeness.",
  },
  {
    tag: "disclosure",
    question:
      "Was the protocol team's risk disclosure 'adequate and good-faith' before the token sale, given a known oracle dependency was mentioned only in a linked audit appendix?",
    evidence:
      "The sale page listed 'smart-contract risk' generically. The specific single-oracle dependency (a known single point of failure) appeared only on page 47 of a linked third-party audit PDF, not in the sale page's risk section. The team argues the audit was prominently linked. A buyer group argues burying a material risk in an appendix is not good-faith disclosure.",
    caseLaw:
      "Case law: a MATERIAL risk (e.g. a known single point of failure) must appear in the disclosure's risk section to be adequate and good-faith. Mere technical discoverability in a linked appendix does not satisfy the standard — placement tracks materiality.",
  },
  {
    tag: "governance",
    question:
      "Does Proposal #42 fall within the treasury committee's delegated authority, or does it require a full-DAO vote under the charter?",
    evidence:
      "The charter delegates 'routine operational spending up to 50k/quarter' to the committee. Proposal #42 is a 45k one-time payment to a market-maker for a 6-month liquidity arrangement. Under the cap numerically, but it's a new strategic relationship, not recurring opex. The charter does not define 'routine'.",
    caseLaw:
      "Case law: a spend under the delegated numeric cap still requires a full-DAO vote when it constitutes a NEW STRATEGIC commitment (e.g. a multi-month market-maker arrangement) rather than routine recurring operations. 'Routine' is read by nature of the commitment, not the amount alone.",
  },
];

async function main() {
  const kiroKey = env.KIRO_GATEWAY_API_KEY;
  if (!kiroKey) throw new Error("KIRO_GATEWAY_API_KEY not found");
  const baseUrl = env.KIRO_GATEWAY_BASE_URL ?? "http://127.0.0.1:8000";

  const committee = new Committee({ baseUrl, apiKey: kiroKey, models: MODELS, prompt: PROMPT, sources: SOURCES });
  const walrus = new WalrusStore();
  const embedder = resolveEmbedder(env);
  // Public case law — passthrough (readable on Walrus), so the arena can recall it.
  const ns = "walrus-ns://tribunal/arena-caselaw";
  const memory = new TribunalMemory(ns, walrus, embedder);

  console.log("=== Seeding arena case law on Walrus ===");
  console.log("committee:", MODELS.join(", "), "\nembedder :", embedder.name, "\nns       :", ns, "\n");

  const quiltIds: string[] = [];
  for (const c of CASES) {
    console.log(`CASE ${c.tag}: ${c.question.slice(0, 70)}…`);
    const v = await committee.resolve(c.question, c.evidence);
    console.log(`  verdict: ${v.outcomeTrue ? "YES" : "NO"} (true=${v.votesTrue} false=${v.votesFalse} abstain=${v.abstain}, agreement=${(v.agreement * 100).toFixed(0)}%)`);
    const w = await memory.remember([
      {
        id: `${c.tag}-verdict`,
        kind: "verdict",
        text: `Verdict on "${c.question}": ${v.outcomeTrue ? "YES (affirmed)" : "NO (denied)"} with ${(v.agreement * 100).toFixed(0)}% committee agreement${v.votesTrue > 0 && v.votesFalse > 0 ? ", split decision with dissent" : ""}.`,
        data: { outcomeTrue: v.outcomeTrue, votesTrue: v.votesTrue, votesFalse: v.votesFalse },
      },
      { id: `${c.tag}-caselaw`, kind: "case_law", text: c.caseLaw, data: { topic: c.tag } },
    ]);
    quiltIds.push(w.quiltId);
    console.log(`  ✓ case law -> Walrus quilt ${w.quiltId}\n`);
  }

  console.log("=== Done. Wire these quilt ids into app/src/app/api/recall/route.ts SEED_QUILTS: ===");
  console.log(JSON.stringify(quiltIds, null, 2));
}

main().catch((e) => {
  console.error("\n=== seed-arena FAILED ===");
  console.error(e);
  process.exit(1);
});
