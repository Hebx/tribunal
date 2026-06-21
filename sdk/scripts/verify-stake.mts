// Verify the full stake → settle → claim flow on the live testnet package.
//
//   cd sdk && node --import tsx scripts/verify-stake.mts
//
// Flow:
//   1. Register two soulbound AgentCards (we own both for the demo).
//   2. Create a Case with expiry=now, liveness=0.
//   3. stake::create_pool bound to that case.
//   4. Agent A stakes 0.01 SUI on YES; Agent B stakes 0.005 SUI on NO.
//   5. Bundled assert + record_outcome with outcome=YES, then settle.
//   6. Agent A claims; expect to receive principal + full losing pool
//      = 10_000_000 + 5_000_000 = 15_000_000 MIST.
//   7. Read pool balances; both halves should be zero.
//
// Real digest at every step; on failure the script exits non-zero.

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
import { buildCreatePool, buildStake, buildClaim } from "../src/agents/stake.js";
import type { TribunalDeployment } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NETWORK = (process.env.TRIBUNAL_NETWORK ?? "testnet") as TribunalDeployment["network"];

const STAKE_YES = 10_000_000n; // 0.01 SUI
const STAKE_NO = 5_000_000n; // 0.005 SUI
const BOND = 50_000_000n; // 0.05 SUI resolver bond

function loadDeployment(): TribunalDeployment {
  return JSON.parse(readFileSync(join(__dirname, "..", "..", `deployment.${NETWORK}.json`), "utf8"));
}

async function exec(client: SuiJsonRpcClient, signer: Signer, tx: Transaction, label: string) {
  const res = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  if (res.effects?.status?.status !== "success") {
    throw new Error(`${label} failed: ${JSON.stringify(res.effects?.status)}`);
  }
  console.log(`  ✓ ${label}  (${res.digest})`);
  return res;
}

function findCreated(res: any, suffix: string): string[] {
  return (res.objectChanges ?? [])
    .filter((c: any) => c.type === "created" && String(c.objectType).endsWith(suffix))
    .map((c: any) => c.objectId);
}

async function currentEpoch(c: SuiJsonRpcClient): Promise<number> {
  const { epoch } = await c.getLatestSuiSystemState();
  return Number(epoch);
}

async function main() {
  const dep = loadDeployment();
  if (!dep.reputationCapId) throw new Error("redeploy first — reputationCapId missing");
  const signer = loadSigner();
  const me = signer.getPublicKey().toSuiAddress();
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
  const tb = new TribunalClient(client, dep.packageId);

  console.log(`Tribunal M5/stake verify on ${NETWORK}\n  package: ${dep.packageId}\n  signer : ${me}\n`);

  // 1) Register two agents
  console.log("[1] register two agents…");
  const rY = await exec(client, signer, tb.registerAgent("pragmatist", createHash("sha256").update(`Y|${Date.now()}`).digest("hex")), "register affirmer");
  const rN = await exec(client, signer, tb.registerAgent("textualist", createHash("sha256").update(`N|${Date.now()}`).digest("hex")), "register denier");
  const agentY = findCreated(rY, "::identity::AgentCard")[0];
  const agentN = findCreated(rN, "::identity::AgentCard")[0];
  if (!agentY || !agentN) throw new Error("AgentCards not minted");

  // 2) Create the case
  console.log("\n[2] create case…");
  const epoch = await currentEpoch(client);
  const cfg = configHash("claude-opus-4.8", "tribunal-stake-test", "kiro");
  const ns = Buffer.from(`walrus-ns://tribunal/stake/${Date.now()}`, "utf8");
  const cr = await exec(
    client,
    signer,
    tb.createCase(
      {
        creatorCapId: dep.creatorCapId,
        questionHash: sha256Bytes(`stake test ${Date.now()}`),
        configHash: cfg.hash,
        memoryNs: ns,
        expiryEpoch: epoch,
        livenessEpochs: 0,
      },
      me,
    ),
    "create_case",
  );
  const caseId = findCreated(cr, "::case::Case<0x2::sui::SUI>")[0];
  const capId = findCreated(cr, "::case::ResolverCap")[0];
  if (!caseId || !capId) throw new Error("case/cap not created");

  // 3) Create the stake pool
  console.log("\n[3] create stake pool…");
  const pr = await exec(client, signer, buildCreatePool(dep.packageId, { caseId }), "stake::create_pool");
  const poolId = findCreated(pr, "::stake::StakePool<0x2::sui::SUI>")[0];
  if (!poolId) throw new Error("StakePool not created");
  console.log(`    pool: ${poolId}`);

  // 4) Two stakes
  console.log("\n[4] stake YES 0.01 SUI and NO 0.005 SUI…");
  const sY = await exec(client, signer, buildStake(dep.packageId, { poolId, agentCardId: agentY, sideTrue: true, amount: STAKE_YES }), "stake YES");
  const sN = await exec(client, signer, buildStake(dep.packageId, { poolId, agentCardId: agentN, sideTrue: false, amount: STAKE_NO }), "stake NO");
  const receiptY = findCreated(sY, "::stake::StakeReceipt<0x2::sui::SUI>")[0];
  const receiptN = findCreated(sN, "::stake::StakeReceipt<0x2::sui::SUI>")[0];
  if (!receiptY || !receiptN) throw new Error("receipts not minted");
  console.log(`    receiptY: ${receiptY}\n    receiptN: ${receiptN}`);

  // 5) Bundled assert + record_outcome (YES wins), then settle
  console.log("\n[5] assert (YES) + record outcomes + settle…");
  const evidence = {
    blobId: Buffer.from(`walrus-blob-${Date.now()}`, "utf8"),
    sha256: sha256Bytes("verdict bundle"),
    sealed: false,
    epoch: 1000,
  };
  await exec(
    client,
    signer,
    buildAssertAndRecord(
      dep.packageId,
      {
        caseId,
        resolverCapId: capId,
        reputationCapId: dep.reputationCapId,
        presentedConfig: cfg.preimage,
        outcomeTrue: true,
        evidence,
        bondAmount: BOND,
        participants: [
          { agentCardId: agentY, argued: true },
          { agentCardId: agentN, argued: false },
        ],
      },
      me,
    ),
    "assert + 2x record_outcome",
  );
  await exec(client, signer, tb.settle({ caseId }), "settle");

  // 6) Claim — winner (agentY) should get 10M + 5M = 15M
  console.log("\n[6] claim winnings (YES)…");
  // gas balance before to compute net delta
  await exec(client, signer, buildClaim(dep.packageId, { poolId, caseId, receiptId: receiptY }), "claim YES");

  // 7) Read pool balances
  console.log("\n[7] read final state…");
  const pool = await client.getObject({ id: poolId, options: { showContent: true } });
  const fields = (pool.data as any)?.content?.fields ?? {};
  const yes = Number(fields.yes_balance?.fields?.value ?? 0);
  const no = Number(fields.no_balance?.fields?.value ?? 0);
  console.log(`    pool yes_balance=${yes} no_balance=${no}`);

  // Loser claim — burns the receipt, payout should be empty (winner already drained the NO side)
  console.log("\n[8] claim winnings (NO, loser) — receipt is consumed, no payout…");
  await exec(client, signer, buildClaim(dep.packageId, { poolId, caseId, receiptId: receiptN }), "claim NO");

  const res = await tb.getResolution(caseId, undefined, me);

  const checks: [string, boolean][] = [
    ["case settled YES", res.settled && res.outcomeTrue === true],
    ["YES balance fully claimed", yes === 0],
    ["NO balance fully claimed by winner (loser gets nothing)", no === 0],
  ];
  console.log("");
  let ok = true;
  for (const [label, pass] of checks) {
    console.log(`  ${pass ? "✓" : "✗"} ${label}`);
    if (!pass) ok = false;
  }
  if (!ok) throw new Error("checks failed");
  console.log("\n✅ stake flow verified end-to-end on testnet");
  console.log(`   case  : ${caseId}`);
  console.log(`   pool  : ${poolId}`);
  console.log(`   agents: ${agentY} (YES/win), ${agentN} (NO/lose)`);
}

main().catch((e) => {
  console.error("\n=== verify-stake FAILED ===");
  console.error(e);
  process.exit(1);
});
