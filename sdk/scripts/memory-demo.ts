// M3c demo — the Walrus-track thesis, end to end, against LIVE testnet Walrus.
//
//   cd sdk && npm run memory-demo
//
// Story:
//   1. A subjective case is posed. A committee of N local models (Kiro gateway)
//      each votes TRUE/FALSE with rationale -> aggregate verdict.
//   2. The full panel (each vote + the verdict) is REMEMBERED to Walrus as a
//      Quilt, namespaced to the case's on-chain memory_ns. This is the
//      verifiable, persistent, auditable memory trail.
//   3. RECALL: a semantic query pulls the most relevant prior judgment back from
//      Walrus (embedded index over quilt patches).
//   4. RESTORE: we throw away the in-memory index and rebuild it FROM WALRUS
//      ALONE, proving Walrus is the source of truth and the index is a cache.
//
// No external LLM key (committee = local Kiro models). No WAL token (public
// testnet publisher sponsors storage). Embeddings via Gemini if keyed, else a
// deterministic local fallback.

import { homedir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "../src/memory/env.js";
import { Committee } from "../src/memory/committee.js";
import { TribunalMemory } from "../src/memory/index.js";
import { WalrusStore } from "../src/memory/walrus.js";
import { resolveEmbedder } from "../src/memory/embeddings.js";
import { configHash } from "../src/signer.js";

const env = { ...loadEnv(join(homedir(), ".hermes", ".env")), ...process.env };

const MODELS = (env.TRIBUNAL_COMMITTEE_MODELS ??
  "claude-haiku-4.5,claude-sonnet-4.5,minimax-m2.5").split(",").map((s) => s.trim());

const PROMPT =
  "Resolve the question strictly on the supplied evidence and authoritative sources. " +
  "Be neutral; do not speculate beyond the evidence.";
const SOURCES = "official-announcements, primary-reporting, on-chain-data";

async function main() {
  const kiroKey = env.KIRO_GATEWAY_API_KEY;
  if (!kiroKey) throw new Error("KIRO_GATEWAY_API_KEY not found in ~/.hermes/.env");
  const baseUrl = env.KIRO_GATEWAY_BASE_URL ?? "http://127.0.0.1:8000";

  // memory_ns would be read from the on-chain Case; for the demo we derive a
  // stable namespace and show the config_hash lock alongside it.
  const memoryNs = `walrus-ns://tribunal/demo-${Date.now()}`;
  const cfg = configHash(MODELS.join(","), PROMPT, SOURCES);
  console.log("=== Tribunal M3c — verifiable memory on Walrus ===");
  console.log("committee   :", MODELS.join(", "));
  console.log("config_hash :", Buffer.from(cfg.hash).toString("hex").slice(0, 32), "…(locked on-chain)");
  console.log("memory_ns   :", memoryNs);

  const embedder = resolveEmbedder(env);
  console.log("embedder    :", embedder.name, "\n");

  const committee = new Committee({ baseUrl, apiKey: kiroKey, models: MODELS, prompt: PROMPT, sources: SOURCES });
  const walrus = new WalrusStore();
  const memory = new TribunalMemory(memoryNs, walrus, embedder);

  // ---- Case 1 ----
  const q1 = "Did Project Helios ship its mainnet launch before the stated Q2 deadline?";
  const e1 =
    "Evidence: Official blog post dated within Q2 announces 'mainnet is live'. " +
    "Block explorer shows the genesis transaction timestamped 9 days before quarter end. " +
    "No contradicting reports.";
  console.log("CASE 1:", q1);
  const v1 = await committee.resolve(q1, e1);
  console.log(`  verdict: ${v1.outcomeTrue ? "TRUE" : "FALSE"}  (true=${v1.votesTrue} false=${v1.votesFalse} abstain=${v1.abstain}, agreement=${(v1.agreement * 100).toFixed(0)}%)`);
  for (const v of v1.votes) {
    console.log(`    - ${v.model}: ${v.vote === null ? "ABSTAIN" : v.vote ? "TRUE" : "FALSE"} (${(v.confidence * 100).toFixed(0)}%) ${v.error ? "[err: " + v.error + "]" : "— " + v.rationale}`);
  }

  // remember the panel + verdict
  const entries1 = [
    ...v1.votes.map((v, i) => ({
      id: `case1-vote-${i}-${v.model}`,
      kind: "committee_vote" as const,
      text: `${v.model} voted ${v.vote} on "${q1}": ${v.rationale}`,
      data: { model: v.model, vote: v.vote, confidence: v.confidence },
    })),
    {
      id: "case1-verdict",
      kind: "verdict" as const,
      text: `Verdict on "${q1}": ${v1.outcomeTrue ? "TRUE" : "FALSE"} with ${(v1.agreement * 100).toFixed(0)}% committee agreement. Project Helios mainnet launch deadline question.`,
      data: { outcomeTrue: v1.outcomeTrue, votesTrue: v1.votesTrue, votesFalse: v1.votesFalse },
    },
  ];
  const w1 = await memory.remember(entries1);
  console.log(`  ✓ remembered ${entries1.length} entries -> Walrus quilt ${w1.quiltId}`);

  // ---- Case 2 (different topic, to make recall meaningful) ----
  const q2 = "Was the DAO treasury audit completed by an independent firm?";
  const e2 =
    "Evidence: A signed PDF report from a named third-party security firm is linked. " +
    "The firm is not affiliated with the DAO core team. Report covers all treasury contracts.";
  console.log("\nCASE 2:", q2);
  const v2 = await committee.resolve(q2, e2);
  console.log(`  verdict: ${v2.outcomeTrue ? "TRUE" : "FALSE"}  (true=${v2.votesTrue} false=${v2.votesFalse} abstain=${v2.abstain})`);
  const entries2 = [
    {
      id: "case2-verdict",
      kind: "verdict" as const,
      text: `Verdict on "${q2}": ${v2.outcomeTrue ? "TRUE" : "FALSE"}. Independent third-party DAO treasury audit question.`,
      data: { outcomeTrue: v2.outcomeTrue },
    },
  ];
  const w2 = await memory.remember(entries2);
  console.log(`  ✓ remembered ${entries2.length} entry -> Walrus quilt ${w2.quiltId}`);

  // ---- RECALL ----
  console.log("\n=== RECALL (semantic query over Walrus-backed memory) ===");
  const query = "What did the committee decide about the mainnet launch timing?";
  const hits = await memory.recall(query, { k: 2 });
  console.log(`query: "${query}"`);
  for (const h of hits) {
    console.log(`  [${h.score.toFixed(3)}] (${h.entry.kind}) ${h.entry.text.slice(0, 90)}…`);
  }
  const top = hits[0];
  const recallOk = !!top && top.entry.text.toLowerCase().includes("helios");
  console.log(`  recall ${recallOk ? "OK — top hit is the Helios verdict" : "WEAK — top hit not the expected verdict"}`);

  // ---- RESTORE (rebuild index FROM WALRUS ALONE) ----
  console.log("\n=== RESTORE (rebuild index from Walrus, index is just a cache) ===");
  const before = memory.size;
  const restored = await memory.restore([w1.quiltId, w2.quiltId]);
  console.log(`  index size before: ${before}  ->  wiped + restored from Walrus: ${restored}`);
  const hits2 = await memory.recall(query, { k: 1 });
  const restoreOk = !!hits2[0] && hits2[0].entry.text.toLowerCase().includes("helios");
  console.log(`  post-restore recall ${restoreOk ? "OK — same top hit, served purely from Walrus" : "FAILED"}`);

  console.log("\n=== M3c demo " + (recallOk && restoreOk ? "PASSED" : "completed (check recall quality)") + " ===");
  if (!recallOk || !restoreOk) process.exit(1);
}

main().catch((e) => {
  console.error("\n=== M3c demo FAILED ===");
  console.error(e);
  process.exit(1);
});
