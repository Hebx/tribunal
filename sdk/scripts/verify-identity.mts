// Verify the v2 identity module on the active network: mint a soulbound
// AgentCard, read it back, record a win outcome with the ReputationCap, and
// confirm the score increased. Mirrors verify-tx flow; uses the CLI keystore.
//
//   cd sdk && node --import tsx scripts/verify-identity.mts
//
// Reads ../deployment.testnet.json for packageId + reputationCapId.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { loadSigner } from "../src/signer.js";
import { TribunalClient } from "../src/client.js";
import type { TribunalDeployment } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NETWORK = (process.env.TRIBUNAL_NETWORK ?? "testnet") as TribunalDeployment["network"];

function loadDeployment(): TribunalDeployment {
  const p = join(__dirname, "..", "..", `deployment.${NETWORK}.json`);
  return JSON.parse(readFileSync(p, "utf8"));
}

function fieldsOf(data: any): any {
  return data?.content?.fields ?? {};
}

async function exec(client: SuiJsonRpcClient, signer: any, tx: any, label: string) {
  const res = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  const status = res.effects?.status?.status;
  if (status !== "success") {
    throw new Error(`${label} failed: ${JSON.stringify(res.effects?.status)}`);
  }
  console.log(`  ${label}: ${res.digest} (${status})`);
  return res;
}

async function main() {
  const dep = loadDeployment();
  if (!dep.reputationCapId) {
    throw new Error("deployment has no reputationCapId — redeploy with the v2 package first");
  }
  const signer = loadSigner();
  const address = signer.getPublicKey().toSuiAddress();
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
  const tribunal = new TribunalClient(client, dep.packageId);

  console.log(`Network ${NETWORK}  signer ${address}`);
  console.log(`Package ${dep.packageId}`);

  // 1) register_agent -> soulbound AgentCard
  const personaHash = createHash("sha256").update("textualist|core|verify", "utf8").digest("hex");
  console.log("\n[1] register_agent (mint AgentCard)…");
  const regRes = await exec(client, signer, tribunal.registerAgent("textualist", personaHash), "register_agent");
  const created = (regRes.objectChanges ?? []).find(
    (c: any) => c.type === "created" && typeof c.objectType === "string" && c.objectType.endsWith("::identity::AgentCard"),
  ) as { objectId: string } | undefined;
  if (!created) throw new Error("AgentCard not found in object changes");
  const cardId = created.objectId;
  console.log(`  AgentCard: ${cardId}`);

  // 2) read back baseline
  const card0 = await tribunal.getAgentCard(cardId);
  const f0 = fieldsOf(card0);
  console.log(`  baseline score=${f0.score} owner=${f0.owner} archetype=${Buffer.from(f0.archetype_id ?? []).toString()}`);

  // 3) record_outcome (win) — needs the next epoch is NOT required for first outcome
  console.log("\n[2] record_outcome (win)…");
  await exec(client, signer, tribunal.recordOutcome(dep.reputationCapId, cardId, true, false), "record_outcome");

  // 4) read back updated score
  const card1 = await tribunal.getAgentCard(cardId);
  const f1 = fieldsOf(card1);
  console.log(`  after win: score=${f1.score} wins=${f1.wins} streak=${f1.current_streak}`);

  const baseline = Number(f0.score);
  const after = Number(f1.score);
  if (after <= baseline) throw new Error(`score did not increase: ${baseline} -> ${after}`);
  console.log(`\n✅ identity verified on ${NETWORK}: score ${baseline} -> ${after}, AgentCard ${cardId}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
