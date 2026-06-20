// Throwaway: prove app/src/lib/tx.ts builders execute on testnet using the
// deployer keystore (the headless browser has no wallet). Mirrors sdk e2e exec.
// Run: cd app && node --import tsx scripts/verify-tx.mts

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { buildCreateCase, buildAssertResolution, buildDispute, configHash, sha256Bytes, findCreated } from "../src/lib/tx";

function loadKeypair(): Ed25519Keypair {
  const ks = JSON.parse(readFileSync(join(homedir(), ".sui", "sui_config", "sui.keystore"), "utf8"));
  const bytes = Buffer.from(ks[0], "base64");
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(bytes.subarray(1)));
}

async function exec(client: SuiClient, signer: Ed25519Keypair, tx: any, label: string) {
  const res = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  const status = res.effects?.status?.status;
  if (status !== "success") throw new Error(`${label} FAILED: ${JSON.stringify(res.effects?.status)}`);
  console.log(`  ✓ ${label}  ${res.digest}`);
  return res;
}

async function main() {
  const signer = loadKeypair();
  const me = signer.getPublicKey().toSuiAddress();
  const client = new SuiClient({ url: getFullnodeUrl("testnet") });
  console.log("signer:", me);

  const { epoch } = await client.getLatestSuiSystemState();
  const ep = Number(epoch);

  // committee config that matches /api/judge
  const models = "claude-haiku-4.5,claude-sonnet-4.5,minimax-m2.5";
  const prompt = "Resolve the question strictly on the supplied evidence and authoritative sources. Be neutral; do not speculate beyond the evidence.";
  const sources = "official-announcements, primary-reporting, on-chain-data";
  const cfg = await configHash(models, prompt, sources);
  const ns = `walrus-ns://tribunal/verify-${Date.now()}`;

  console.log("create_case…");
  const createTx = buildCreateCase({
    questionHash: await sha256Bytes("verify question"),
    configHash: cfg.hash,
    memoryNs: new TextEncoder().encode(ns),
    expiryEpoch: ep,
    livenessEpochs: 1,
    resolverCapRecipient: me,
  });
  const cr = await exec(client, signer, createTx, "create_case");
  const caseId = findCreated(cr, "::case::Case<");
  const capId = findCreated(cr, "::case::ResolverCap");
  console.log("    case:", caseId, "\n    cap :", capId);
  if (!caseId || !capId) throw new Error("case/cap not created");

  console.log("assert_resolution…");
  const assertTx = buildAssertResolution({
    caseId, resolverCapId: capId,
    presentedConfig: cfg.preimage, // MUST hash-match config_hash
    outcomeTrue: true,
    evidence: { blobId: new TextEncoder().encode("verify-quilt"), sha256: await sha256Bytes("verify-quilt"), sealed: true, epoch: 1000 },
    bondAmount: 100_000_000n,
  });
  await exec(client, signer, assertTx, "assert_resolution");

  console.log("dispute_resolution…");
  const dTx = buildDispute(caseId, 100_000_000n);
  await exec(client, signer, dTx, "dispute_resolution");

  console.log("\n=== ALL BUILDERS VERIFIED ON TESTNET ===");
}

main().catch((e) => { console.error("FAILED:", e); process.exit(1); });
