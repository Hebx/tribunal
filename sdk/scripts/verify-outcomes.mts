// Verify the bundled assert+record_outcome PTB end-to-end on testnet.
//
//   cd sdk && node --import tsx scripts/verify-outcomes.mts
//
// Flow:
//   1. Mint two soulbound AgentCards (affirmer + denier) under the signer.
//      (In production both sides are separate owners; we play both roles here
//      because the resolver flow doesn't care who owns the cards.)
//   2. Create a Case with a fresh memory_ns, expiry=now, liveness=0.
//   3. Build ONE PTB: evidence::new_ref + split bond + case::assert_resolution
//      + identity::record_outcome (affirmer won) + identity::record_outcome
//      (denier lost). Sign + execute. Real digest.
//   4. Read back both AgentCards; assert the affirmer's score went up and the
//      denier's score went down, and the case is now Asserted (settle-ready).
//
// On success, prints the verdict-anchor digest and the score deltas. Records
// to gitignored DEPLOYMENTS-internal notes — not the public README.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import type { Signer } from "@mysten/sui/cryptography";
import type { Transaction } from "@mysten/sui/transactions";
import { TribunalClient } from "../src/client.js";
import { loadSigner, sha256Bytes, configHash } from "../src/signer.js";
import { buildAssertAndRecord } from "../src/agents/outcomes.js";
import type { TribunalDeployment } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NETWORK = (process.env.TRIBUNAL_NETWORK ?? "testnet") as TribunalDeployment["network"];
const BOND = 50_000_000n; // 0.05 SUI in MIST — keep modest, two debates per session

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
  if (status !== "success") {
    throw new Error(`${label} failed: ${JSON.stringify(res.effects?.status)}`);
  }
  console.log(`  ✓ ${label}  (${res.digest})`);
  return res;
}

function findCreatedAll(res: any, suffix: string): string[] {
  return (res.objectChanges ?? [])
    .filter((c: any) => c.type === "created" && String(c.objectType).endsWith(suffix))
    .map((c: any) => c.objectId);
}

function fieldsOf(data: any): any {
  return data?.content?.fields ?? {};
}

async function currentEpoch(client: SuiJsonRpcClient): Promise<number> {
  const { epoch } = await client.getLatestSuiSystemState();
  return Number(epoch);
}

async function main() {
  const dep = loadDeployment();
  if (!dep.reputationCapId) {
    throw new Error("deployment missing reputationCapId — redeploy with the v2 package first");
  }
  const signer = loadSigner();
  const me = signer.getPublicKey().toSuiAddress();
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
  const tb = new TribunalClient(client, dep.packageId);

  console.log(`Tribunal M4.2 verify on ${NETWORK}\n  package: ${dep.packageId}\n  signer : ${me}\n`);

  // 1) Mint two soulbound AgentCards (affirmer + denier).
  console.log("[1] register two persona agents…");
  const personaY = createHash("sha256").update(`pragmatist|${Date.now()}-Y`, "utf8").digest("hex");
  const personaN = createHash("sha256").update(`textualist|${Date.now()}-N`, "utf8").digest("hex");
  const r1 = await exec(client, signer, tb.registerAgent("pragmatist", personaY), "register_agent (affirmer)");
  const r2 = await exec(client, signer, tb.registerAgent("textualist", personaN), "register_agent (denier)");
  const agentY = findCreatedAll(r1, "::identity::AgentCard")[0];
  const agentN = findCreatedAll(r2, "::identity::AgentCard")[0];
  if (!agentY || !agentN) throw new Error("AgentCards not created");
  console.log(`    affirmer card: ${agentY}\n    denier   card: ${agentN}`);

  // 2) Create a fresh case.
  console.log("\n[2] create case…");
  const epoch = await currentEpoch(client);
  const cfg = configHash("claude-opus-4.8", "tribunal-v2-resolve", "kiro-gateway");
  const createTx = tb.createCase(
    {
      creatorCapId: dep.creatorCapId,
      questionHash: sha256Bytes(
        `Did the grantee meet Milestone 2? | criteria: substantial match | ts=${Date.now()}`,
      ),
      configHash: cfg.hash,
      memoryNs: Buffer.from(`walrus-ns://tribunal/v2/${Date.now()}`, "utf8"),
      expiryEpoch: epoch,
      livenessEpochs: 0,
    },
    me,
  );
  const rc = await exec(client, signer, createTx, "create_case");
  const caseId = findCreatedAll(rc, "::case::Case<0x2::sui::SUI>")[0];
  const capId = findCreatedAll(rc, "::case::ResolverCap")[0];
  if (!caseId || !capId) throw new Error("case/cap not created");
  console.log(`    case: ${caseId}\n    cap : ${capId}`);

  // Read baseline scores
  const before = {
    affirmer: Number(fieldsOf(await tb.getAgentCard(agentY)).score),
    denier: Number(fieldsOf(await tb.getAgentCard(agentN)).score),
  };
  console.log(`    baseline: affirmer=${before.affirmer} denier=${before.denier}`);

  // 3) BUNDLED PTB: assert + record outcomes.
  console.log("\n[3] bundled assert+record (one PTB, atomic)…");
  const bundled = buildAssertAndRecord(
    dep.packageId,
    {
      caseId,
      resolverCapId: capId,
      reputationCapId: dep.reputationCapId,
      presentedConfig: cfg.preimage,
      outcomeTrue: true, // YES wins
      evidence: {
        blobId: Buffer.from(`walrus-blob-v2-${Date.now()}`, "utf8"),
        sha256: sha256Bytes("verdict bundle digest"),
        sealed: false,
        epoch: 1000,
      },
      bondAmount: BOND,
      participants: [
        { agentCardId: agentY, argued: true }, // affirmer wins
        { agentCardId: agentN, argued: false }, // denier loses
      ],
    },
    me,
  );
  const bundledRes = await exec(client, signer, bundled, "assert_resolution + 2x record_outcome");
  const bundledDigest = bundledRes.digest;

  // 4) Read back and assert deltas.
  console.log("\n[4] readback…");
  const after = {
    affirmer: Number(fieldsOf(await tb.getAgentCard(agentY)).score),
    denier: Number(fieldsOf(await tb.getAgentCard(agentN)).score),
  };
  console.log(`    after   : affirmer=${after.affirmer} denier=${after.denier}`);

  const res = await tb.getResolution(caseId, undefined, me);
  console.log(`    case state: settled=${res.settled} outcomeTrue=${res.outcomeTrue}`);

  // Assertions.
  const checks: [string, boolean][] = [
    ["affirmer score increased", after.affirmer > before.affirmer],
    ["denier score decreased", after.denier < before.denier],
    ["case is asserted with YES outcome", res.outcomeTrue === true],
    // settle hasn't been called yet, but liveness=0 means it could be
  ];
  console.log("");
  let ok = true;
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? "✓" : "✗"} ${label}`);
    if (!pass) ok = false;
  }
  if (!ok) throw new Error("one or more checks failed");
  console.log(`\n✅ M4.2 verified — verdict anchored + outcomes recorded atomically.`);
  console.log(`   bundled digest: ${bundledDigest}`);
  console.log(`   case:           ${caseId}`);
  console.log(`   agents:         ${agentY} (won), ${agentN} (lost)`);
}

main().catch((e) => {
  console.error("\n=== verify-outcomes FAILED ===");
  console.error(e);
  process.exit(1);
});
