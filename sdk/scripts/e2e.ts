// End-to-end Tribunal lifecycle against a live network, using the deployed
// package. Proves the full on-chain protocol with one signer playing all roles
// (creator/resolver/disputer) — fine for a testnet demo of the mechanics.
//
//   cd sdk && npm run e2e            # reads ../deployment.testnet.json
//
// Flow 1 (disputed): create -> assert(true) -> dispute -> resolve(disputer wins)
//                    -> outcome flips to false.
// Flow 2 (happy):    create -> assert(false) -> wait liveness -> settle.
//
// Epoch-based liveness: testnet epochs are long, so Flow 2 uses liveness=0 so
// settle is callable immediately (asserted_at + 0 <= now). Flow 1 uses
// liveness>=1 so the dispute window is open when we challenge.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import type { Transaction } from "@mysten/sui/transactions";
import type { Signer } from "@mysten/sui/cryptography";
import { TribunalClient } from "../src/client.js";
import { loadSigner, configHash, sha256Bytes } from "../src/signer.js";
import type { TribunalDeployment } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NETWORK = (process.env.TRIBUNAL_NETWORK ?? "testnet") as TribunalDeployment["network"];
const BOND = 100_000_000n; // 0.1 SUI in MIST

function loadDeployment(): TribunalDeployment {
  const p = join(__dirname, "..", "..", `deployment.${NETWORK}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

async function exec(
  client: SuiJsonRpcClient,
  signer: Signer,
  tx: Transaction,
  label: string,
) {
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

async function main() {
  const dep = loadDeployment();
  const signer = loadSigner();
  const me = signer.getPublicKey().toSuiAddress();
  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });
  const tb = new TribunalClient(client, dep.packageId);
  console.log(`Tribunal e2e on ${NETWORK}\n  package: ${dep.packageId}\n  signer : ${me}\n`);

  const epoch = await currentEpoch(client);
  const cfg = configHash("claude-opus-4.8", "resolve-subjective-v1", "reuters,ap,onchain");

  // ---------- Flow 1: disputed, outcome flips ----------
  console.log("Flow 1 — disputed resolution (disputer wins, outcome flips):");
  const create1 = tb.createCase(
    {
      creatorCapId: dep.creatorCapId,
      questionHash: sha256Bytes("Did event X happen by date Y? | criteria: official confirmation"),
      configHash: cfg.hash,
      memoryNs: Buffer.from(`walrus-ns://tribunal/${Date.now()}-1`, "utf8"),
      expiryEpoch: epoch, // resolvable now
      livenessEpochs: 1, // window open for the dispute
    },
    me,
  );
  const r1 = await exec(client, signer, create1, "create_case #1");
  const case1 = findCreated(r1, "::case::Case<");
  const cap1 = findCreated(r1, "::case::ResolverCap");
  if (!case1 || !cap1) throw new Error("case1/cap1 not created");
  console.log(`    case: ${case1}\n    cap : ${cap1}`);

  const assert1 = tb.assertResolution(
    {
      caseId: case1,
      resolverCapId: cap1,
      presentedConfig: cfg.preimage,
      outcomeTrue: true, // resolver says TRUE
      evidence: {
        blobId: Buffer.from("walrus-blob-demo-1", "utf8"),
        sha256: sha256Bytes("evidence bundle 1"),
        sealed: false,
        epoch: 1000,
      },
      bondAmount: BOND,
    },
    me,
  );
  await exec(client, signer, assert1, "assert_resolution #1 (outcome=true)");

  const dispute1 = tb.disputeResolution({ caseId: case1, bondAmount: BOND });
  const rd1 = await exec(client, signer, dispute1, "dispute_resolution #1");
  const disputeId = findCreated(rd1, "::dispute::Dispute<");
  if (!disputeId) throw new Error("dispute object not created");
  console.log(`    dispute: ${disputeId}`);

  const resolve1 = tb.resolveDispute({
    caseId: case1,
    disputeId,
    resolverCapId: cap1,
    resolverWon: false, // disputer wins -> outcome flips to false
    protocolFeeBps: 50,
  });
  await exec(client, signer, resolve1, "resolve_dispute #1 (disputer wins)");

  const res1 = await tb.getResolution(case1, undefined, me);
  console.log(`    final: settled=${res1.settled} outcomeTrue=${res1.outcomeTrue} (expected settled=true outcomeTrue=false)`);
  if (!res1.settled || res1.outcomeTrue !== false) {
    throw new Error("Flow 1 assertion failed: expected settled+false after overturn");
  }

  // ---------- Flow 2: undisputed happy path ----------
  console.log("\nFlow 2 — undisputed resolution (settle):");
  const epoch2 = await currentEpoch(client);
  const create2 = tb.createCase(
    {
      creatorCapId: dep.creatorCapId,
      questionHash: sha256Bytes("Undisputed question | criteria: clear"),
      configHash: cfg.hash,
      memoryNs: Buffer.from(`walrus-ns://tribunal/${Date.now()}-2`, "utf8"),
      expiryEpoch: epoch2,
      livenessEpochs: 0, // settle immediately after assert
    },
    me,
  );
  const r2 = await exec(client, signer, create2, "create_case #2");
  const case2 = findCreated(r2, "::case::Case<");
  const cap2 = findCreated(r2, "::case::ResolverCap");
  if (!case2 || !cap2) throw new Error("case2/cap2 not created");

  const assert2 = tb.assertResolution(
    {
      caseId: case2,
      resolverCapId: cap2,
      presentedConfig: cfg.preimage,
      outcomeTrue: false,
      evidence: {
        blobId: Buffer.from("walrus-blob-demo-2", "utf8"),
        sha256: sha256Bytes("evidence bundle 2"),
        sealed: false,
        epoch: 1000,
      },
      bondAmount: BOND,
    },
    me,
  );
  await exec(client, signer, assert2, "assert_resolution #2 (outcome=false)");

  const settle2 = tb.settle({ caseId: case2 });
  await exec(client, signer, settle2, "settle #2");

  const res2 = await tb.getResolution(case2, undefined, me);
  console.log(`    final: settled=${res2.settled} outcomeTrue=${res2.outcomeTrue} (expected settled=true outcomeTrue=false)`);
  if (!res2.settled || res2.outcomeTrue !== false) {
    throw new Error("Flow 2 assertion failed");
  }

  // ---------- event readback ----------
  const settledEvents = await tb.queryEvents("CaseSettled", 5);
  console.log(`\nCaseSettled events (recent): ${settledEvents.data.length}`);

  console.log("\n=== e2e PASSED ===");
}

main().catch((e) => {
  console.error("\n=== e2e FAILED ===");
  console.error(e);
  process.exit(1);
});
