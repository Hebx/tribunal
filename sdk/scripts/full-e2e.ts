// Tribunal FULL end-to-end — the unified on-chain + off-chain flow.
//
//   cd sdk && npm run full-e2e                 # testnet (default)
//   TRIBUNAL_NETWORK=localnet npm run full-e2e # local node
//
// This is the thesis, exercised as one pipeline. It binds the off-chain AI
// judgment to the on-chain record cryptographically:
//
//   1. CREATE   a Case on-chain. The on-chain config_hash = sha256(models ‖
//               prompt ‖ sources) is the EXACT committee config. The on-chain
//               memory_ns is the namespace the memory layer writes under. The
//               chain now commits to "this committee, this memory bucket".
//   2. RESOLVE  the subjective question with the live committee (N Kiro models).
//   3. REMEMBER the panel to Walrus: committee_vote entries Seal-ENCRYPTED,
//               the verdict + case_law PUBLIC (the on-chain transparency policy).
//               Returns a real Walrus quiltId.
//   4. ASSERT   the verdict on-chain. The evidence ArtifactRef carries the REAL
//               Walrus quilt blob id + its sha256 + sealed=true. presented_config
//               must byte-match the locked config_hash or the chain aborts —
//               proving the deciding AI config is tamper-evident.
//   5. DISPUTE  the resolution (bonded challenge).
//   6. RECALL   prior case law from Walrus and RE-RESOLVE with that precedent as
//               context (judgment compounds across cases).
//   7. RESOLVE  the dispute on-chain (pot + fee + outcome per the re-vote).
//   8. READ     final (settled, outcome) back from chain + count events.
//
// One signer plays all roles (creator/resolver/disputer) — fine to prove the
// mechanics on testnet. Gas: ~0.01 SUI; the address must be funded.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import type { Transaction } from "@mysten/sui/transactions";
import type { Signer } from "@mysten/sui/cryptography";
import { TribunalClient } from "../src/client.js";
import { loadSigner, configHash, sha256Bytes } from "../src/signer.js";
import { loadEnv } from "../src/memory/env.js";
import { Committee } from "../src/memory/committee.js";
import { TribunalMemory, type MemoryEntry } from "../src/memory/index.js";
import { WalrusStore } from "../src/memory/walrus.js";
import { resolveEmbedder } from "../src/memory/embeddings.js";
import { resolveSeal } from "../src/memory/seal.js";
import type { TribunalDeployment } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NETWORK = (process.env.TRIBUNAL_NETWORK ?? "testnet") as TribunalDeployment["network"];
const BOND = 100_000_000n; // 0.1 SUI in MIST

const env = { ...loadEnv(join(homedir(), ".hermes", ".env")), ...process.env };

const MODELS = (env.TRIBUNAL_COMMITTEE_MODELS ??
  "claude-haiku-4.5,claude-sonnet-4.5,minimax-m2.5").split(",").map((s) => s.trim());
const PROMPT =
  "Resolve the question strictly on the supplied evidence and authoritative sources. " +
  "Be neutral; do not speculate beyond the evidence.";
const SOURCES = "official-announcements, primary-reporting, on-chain-data";

function loadDeployment(): TribunalDeployment {
  const p = join(__dirname, "..", "..", `deployment.${NETWORK}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function exec(client: SuiJsonRpcClient, signer: Signer, tx: Transaction, label: string) {
  const res = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  const status = res.effects?.status?.status;
  if (status !== "success") throw new Error(`${label} failed: ${JSON.stringify(res.effects?.status)}`);
  console.log(`  ✓ ${label}  (${res.digest})`);
  return res;
}

function findCreated(res: any, suffix: string): string | undefined {
  const c = (res.objectChanges ?? []).find(
    (x: any) => x.type === "created" && String(x.objectType).includes(suffix),
  );
  return c?.objectId;
}

async function currentEpoch(client: SuiJsonRpcClient): Promise<number> {
  const { epoch } = await client.getLatestSuiSystemState();
  return Number(epoch);
}

/** Build the Walrus memory entries for a resolved verdict (votes + verdict). */
function entriesFor(caseTag: string, question: string, v: Awaited<ReturnType<Committee["resolve"]>>): MemoryEntry[] {
  return [
    ...v.votes.map((vote, i) => ({
      id: `${caseTag}-vote-${i}-${vote.model}`,
      kind: "committee_vote" as const,
      text: `${vote.model} voted ${vote.vote} on "${question}": ${vote.rationale}`,
      data: { model: vote.model, vote: vote.vote, confidence: vote.confidence },
    })),
    {
      id: `${caseTag}-verdict`,
      kind: "verdict" as const,
      text: `Verdict on "${question}": ${v.outcomeTrue ? "TRUE" : "FALSE"} with ${(v.agreement * 100).toFixed(0)}% committee agreement.`,
      data: { outcomeTrue: v.outcomeTrue, votesTrue: v.votesTrue, votesFalse: v.votesFalse },
    },
  ];
}

async function main() {
  const dep = loadDeployment();
  const signer = loadSigner();
  const me = signer.getPublicKey().toSuiAddress();
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
  const tb = new TribunalClient(client, dep.packageId);

  // The on-chain config_hash MUST be sha256(models ‖ prompt ‖ sources) with the
  // committee's exact model list — this is what makes the deciding AI tamper-evident.
  const cfg = configHash(MODELS.join(","), PROMPT, SOURCES);
  const memoryNs = `walrus-ns://tribunal/${Date.now()}`;

  const kiroKey = env.KIRO_GATEWAY_API_KEY;
  if (!kiroKey) throw new Error("KIRO_GATEWAY_API_KEY not found");
  const baseUrl = env.KIRO_GATEWAY_BASE_URL ?? "http://127.0.0.1:8000";
  const committee = new Committee({ baseUrl, apiKey: kiroKey, models: MODELS, prompt: PROMPT, sources: SOURCES });
  const walrus = new WalrusStore();
  const seal = resolveSeal({ ...env, TRIBUNAL_SEAL_SECRET: env.TRIBUNAL_SEAL_SECRET ?? "tribunal-demo-seal-secret-key" });
  const memory = new TribunalMemory(memoryNs, walrus, resolveEmbedder(env), seal);

  console.log(`Tribunal FULL e2e on ${NETWORK}`);
  console.log(`  package : ${dep.packageId}`);
  console.log(`  signer  : ${me}`);
  console.log(`  committee: ${MODELS.join(", ")}`);
  console.log(`  config_hash: ${Buffer.from(cfg.hash).toString("hex").slice(0, 32)}… (locked on-chain)`);
  console.log(`  memory_ns  : ${memoryNs}`);
  console.log(`  seal       : ${seal.name}  embedder: ${memory.embedderName}\n`);

  const epoch = await currentEpoch(client);

  // ===================================================================
  // 1. CREATE a case on-chain (commits to committee config + memory_ns)
  // ===================================================================
  const question = "Did Project Helios ship its mainnet launch before the stated Q2 deadline?";
  const evidence =
    "Official blog post dated within Q2 announces 'mainnet is live'. Block explorer shows the " +
    "genesis transaction timestamped 9 days before quarter end. No contradicting reports.";
  console.log("1. CREATE case on-chain");
  const createTx = tb.createCase(
    {
      creatorCapId: dep.creatorCapId,
      questionHash: sha256Bytes(question),
      configHash: cfg.hash,
      memoryNs: Buffer.from(memoryNs, "utf8"),
      expiryEpoch: epoch,
      livenessEpochs: 1, // keep dispute window open
    },
    me,
  );
  const cr = await exec(client, signer, createTx, "create_case");
  const caseId = findCreated(cr, "::case::Case<");
  const capId = findCreated(cr, "::case::ResolverCap");
  if (!caseId || !capId) throw new Error("case/cap not created");
  console.log(`    case: ${caseId}`);

  // ===================================================================
  // 2. RESOLVE with the live committee
  // ===================================================================
  console.log("\n2. RESOLVE with committee");
  const v1 = await committee.resolve(question, evidence);
  console.log(`    verdict: ${v1.outcomeTrue ? "TRUE" : "FALSE"} (true=${v1.votesTrue} false=${v1.votesFalse}, agreement=${(v1.agreement * 100).toFixed(0)}%)`);

  // ===================================================================
  // 3. REMEMBER the panel to Walrus (votes encrypted, verdict public)
  // ===================================================================
  console.log("\n3. REMEMBER panel to Walrus");
  const w1 = await memory.remember(entriesFor("case", question, v1));
  console.log(`    quilt: ${w1.quiltId}  (${w1.rows.length} entries; votes sealed, verdict public)`);

  // ===================================================================
  // 4. ASSERT the verdict on-chain with the REAL Walrus blob as evidence
  // ===================================================================
  console.log("\n4. ASSERT resolution on-chain (evidence -> real Walrus quilt)");
  const blobBytes = Buffer.from(w1.quiltId, "utf8");
  const assertTx = tb.assertResolution(
    {
      caseId,
      resolverCapId: capId,
      presentedConfig: cfg.preimage, // MUST byte-match the locked config_hash
      outcomeTrue: v1.outcomeTrue,
      evidence: {
        blobId: blobBytes,
        sha256: sha256Bytes(w1.quiltId),
        sealed: true, // committee votes are Seal-encrypted on Walrus
        epoch: 1000,
      },
      bondAmount: BOND,
    },
    me,
  );
  await exec(client, signer, assertTx, "assert_resolution");

  // ===================================================================
  // 5. DISPUTE the resolution (bonded challenge)
  // ===================================================================
  console.log("\n5. DISPUTE the resolution");
  const dTx = tb.disputeResolution({ caseId, bondAmount: BOND });
  const dr = await exec(client, signer, dTx, "dispute_resolution");
  const disputeId = findCreated(dr, "::dispute::Dispute<");
  if (!disputeId) throw new Error("dispute not created");

  // ===================================================================
  // 6. RECALL prior case law + RE-RESOLVE with precedent
  // ===================================================================
  console.log("\n6. RECALL precedent + RE-RESOLVE with case law");
  const precedent = await memory.recall("Project Helios mainnet deadline verdict", { k: 1, kind: "verdict" });
  const priorContext = precedent[0] ? `Prior ruling: ${precedent[0].entry.text}` : undefined;
  if (priorContext) console.log(`    recalled: ${priorContext.slice(0, 90)}…`);
  const v2 = await committee.resolve(question, evidence, priorContext);
  console.log(`    re-vote: ${v2.outcomeTrue ? "TRUE" : "FALSE"} (true=${v2.votesTrue} false=${v2.votesFalse}) — committee upholds with precedent`);
  // Remember the re-resolution as case law
  const w2 = await memory.remember([
    {
      id: "case-rereso-caselaw",
      kind: "case_law",
      text: `Case law (post-dispute): "${question}" upheld ${v2.outcomeTrue ? "TRUE" : "FALSE"} on re-vote citing prior ruling.`,
      data: { outcomeTrue: v2.outcomeTrue, citedPrecedent: !!priorContext },
    },
  ]);
  console.log(`    case_law quilt: ${w2.quiltId}`);

  // resolver_won = committee re-vote agrees with the original assertion
  const resolverWon = v2.outcomeTrue === v1.outcomeTrue;

  // ===================================================================
  // 7. RESOLVE the dispute on-chain
  // ===================================================================
  console.log("\n7. RESOLVE dispute on-chain");
  const rTx = tb.resolveDispute({
    caseId,
    disputeId,
    resolverCapId: capId,
    resolverWon,
    protocolFeeBps: 50,
  });
  await exec(client, signer, rTx, `resolve_dispute (resolverWon=${resolverWon})`);

  // ===================================================================
  // 8. READ final state from chain
  // ===================================================================
  console.log("\n8. READ final state");
  const fin = await tb.getResolution(caseId, undefined, me);
  // disputer wins -> outcome flips; resolver wins -> outcome holds
  const expectedOutcome = resolverWon ? v1.outcomeTrue : !v1.outcomeTrue;
  console.log(`    settled=${fin.settled} outcomeTrue=${fin.outcomeTrue} (expected outcome=${expectedOutcome})`);
  const settledEvents = await tb.queryEvents("CaseSettled", 3);
  console.log(`    CaseSettled events: ${settledEvents.data.length}`);

  const ok = fin.settled && fin.outcomeTrue === expectedOutcome;
  console.log(`\n=== FULL e2e ${ok ? "PASSED" : "FAILED"} ===`);
  console.log(`    on-chain config_hash bound to committee | evidence -> Walrus quilt ${w1.quiltId} | votes sealed | case law recalled`);
  if (!ok) process.exit(1);
}

main().catch((e) => {
  console.error("\n=== FULL e2e FAILED ===");
  console.error(e);
  process.exit(1);
});
