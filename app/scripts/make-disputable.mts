// One-shot: create + assert a fresh case on testnet to serve as the arena's
// LIVE disputable case (asserted, undisputed, liveness window open). Prints the
// case id to wire into app/src/lib/mock.ts. Run from app/.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { buildCreateCase, buildAssertResolution, configHash, sha256Bytes, findCreated } from "../src/lib/tx";

function loadKeypair(): Ed25519Keypair {
  const ks = JSON.parse(readFileSync(join(homedir(), ".sui", "sui_config", "sui.keystore"), "utf8"));
  const bytes = Buffer.from(ks[0], "base64");
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(bytes.subarray(1)));
}

async function exec(client: SuiClient, signer: Ed25519Keypair, tx: any, label: string) {
  const res = await client.signAndExecuteTransaction({
    signer, transaction: tx, options: { showEffects: true, showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  if (res.effects?.status?.status !== "success") throw new Error(`${label}: ${JSON.stringify(res.effects?.status)}`);
  console.log(`  ✓ ${label}  ${res.digest}`);
  return res;
}

async function main() {
  const signer = loadKeypair();
  const me = signer.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  const { epoch } = await client.getLatestSuiSystemState();

  const models = "claude-haiku-4.5,claude-sonnet-4.5,minimax-m2.5";
  const prompt = "Resolve the question strictly on the supplied evidence and authoritative sources. Be neutral; do not speculate beyond the evidence.";
  const sources = "official-announcements, primary-reporting, on-chain-data";
  const cfg = await configHash(models, prompt, sources);
  const ns = `walrus-ns://tribunal/governance-${Date.now()}`;

  // Long liveness so the dispute window stays open for the demo.
  const createTx = buildCreateCase({
    questionHash: await sha256Bytes("governance proposal 42 delegated authority"),
    configHash: cfg.hash,
    memoryNs: new TextEncoder().encode(ns),
    expiryEpoch: Number(epoch),
    livenessEpochs: 100,
    resolverCapRecipient: me,
  });
  const cr = await exec(client, signer, createTx, "create_case");
  const caseId = findCreated(cr, "::case::Case<");
  const capId = findCreated(cr, "::case::ResolverCap");
  if (!caseId || !capId) throw new Error("not created");

  const assertTx = buildAssertResolution({
    caseId, resolverCapId: capId, presentedConfig: cfg.preimage,
    outcomeTrue: false, // governance: needs full vote (NO to committee authority)
    evidence: { blobId: new TextEncoder().encode(ns), sha256: await sha256Bytes(ns), sealed: true, epoch: 1000 },
    bondAmount: 100_000_000n,
  });
  await exec(client, signer, assertTx, "assert_resolution");

  console.log("\n=== Disputable demo case ready ===");
  console.log("caseId:", caseId);
  console.log("Wire into mock.ts governance battle: caseId + status 'ruled'");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
