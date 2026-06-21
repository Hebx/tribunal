// Tribunal v3 end-to-end verifier.
//
//   cd sdk && node --import tsx scripts/verify-v3-flow.mts
//
// Three things have to hold for v3 to be real, not aspirational. This script
// exercises each against the LIVE testnet package and a LIVE Walrus publisher:
//
//   1. First-staker advocacy — the first YES wallet and the first NO wallet to
//      stake become advocates, and that selection is immutable.
//   2. 3x weighted claim share — advocates get a 3.00x share of the losing
//      pool, backers get 1.00x. At equal stake the advocate's payout (net of
//      principal) is exactly 3x the backer's.
//   3. Typed-Quilt audit trail — every verdict persists 6 typed entries on
//      Walrus (debate / jury / guardrail / verdict / case_law / provenance).
//      The resolver returns even if Walrus is unreachable; this script asserts
//      Walrus IS reachable and all 6 entries land.
//
// On-chain (Sui testnet) is the hard part — needs a funded signer. Walrus
// persistence is the cheap part — uses the SDK directly with a deterministic
// hash-embedder so no API keys required.
//
// Flow:
//   [1] register 3 AgentCards (YES_ADV, YES_BACKER, NO_ADV) under one signer
//       (in production these would be three separate wallets; the protocol
//       doesn't care).
//   [2] create a Case with expiry=now / liveness=0 (settles immediately).
//   [3] stake::create_pool bound to the case.
//   [4] stake YES_ADV(0.01) first → captures YES advocate slot.
//       stake YES_BACKER(0.01) second → backer on YES.
//       stake NO_ADV(0.02) → captures NO advocate slot.
//   [5] bundled assert(YES) + record_outcome × 3 → reputation moves with the
//       verdict, not after.
//   [6] settle → claims unlocked.
//   [7] YES_ADV claim → balance delta MUST equal:
//         principal(0.01) + (3 × 0.01 / 4 × 0.02) = 0.01 + 0.015 = 0.025
//       YES_BACKER claim → balance delta MUST equal:
//         principal(0.01) + (1 × 0.01 / 4 × 0.02) = 0.01 + 0.005 = 0.015
//       => YES_ADV.payout_minus_principal = 3 × YES_BACKER.payout_minus_principal.
//   [8] persist a synthesized v3 VerdictBundle to Walrus and ASSERT all 6
//       typed patches landed (debate / jury / guardrail / verdict / case_law /
//       provenance).
//
// Real digest at every step. Real quilt id at the end. Exits non-zero on any
// missed invariant.

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
import { TribunalMemory } from "../src/memory/index.js";
import { WalrusStore } from "../src/memory/walrus.js";
import { HashEmbedder } from "../src/memory/embeddings.js";
import {
  persistVerdictBundle,
  type VerdictBundleLike,
} from "../src/memory/verdict.js";
import type { TribunalDeployment } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NETWORK = (process.env.TRIBUNAL_NETWORK ?? "testnet") as TribunalDeployment["network"];

// Stake sizes chosen so advocate and backer principals are EQUAL on the YES
// side — that's what makes the 3x assertion crisp. NO_ADV is sized so the
// losing pool is large enough to make both YES payouts non-trivial.
const STAKE_YES_ADV = 10_000_000n; // 0.01 SUI — first YES staker, becomes advocate
const STAKE_YES_BACKER = 10_000_000n; // 0.01 SUI — second YES staker, backer
const STAKE_NO_ADV = 20_000_000n; // 0.02 SUI — sole NO staker (advocate by default)
const BOND = 50_000_000n;

function loadDeployment(): TribunalDeployment {
  return JSON.parse(readFileSync(join(__dirname, "..", "..", `deployment.${NETWORK}.json`), "utf8"));
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
    options: { showEffects: true, showObjectChanges: true, showEvents: true, showBalanceChanges: true },
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

function fieldsOf(data: any): any {
  return data?.content?.fields ?? {};
}

function netSuiDelta(res: any, addr: string): bigint {
  // Net SUI balance delta on this address from the tx — payout minus gas.
  const row = (res.balanceChanges ?? []).find(
    (b: any) =>
      b.coinType === "0x2::sui::SUI" &&
      (b.owner?.AddressOwner === addr || b.owner === addr),
  );
  return row ? BigInt(row.amount) : 0n;
}

async function currentEpoch(c: SuiJsonRpcClient): Promise<number> {
  const { epoch } = await c.getLatestSuiSystemState();
  return Number(epoch);
}

async function readPoolState(client: SuiJsonRpcClient, poolId: string) {
  const obj = await client.getObject({ id: poolId, options: { showContent: true } });
  const f = fieldsOf(obj.data);
  return {
    advocateYes: f.advocate_yes?.fields?.id ?? f.advocate_yes ?? null,
    advocateNo: f.advocate_no?.fields?.id ?? f.advocate_no ?? null,
    yesWeighted: Number(f.yes_weighted_total ?? 0),
    noWeighted: Number(f.no_weighted_total ?? 0),
    yesBalance: Number(f.yes_balance?.fields?.value ?? 0),
    noBalance: Number(f.no_balance?.fields?.value ?? 0),
  };
}

async function main() {
  const checks: [string, boolean, string?][] = [];
  const record = (label: string, pass: boolean, detail?: string) => {
    checks.push([label, pass, detail]);
    console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  };

  const dep = loadDeployment();
  if (!dep.reputationCapId) throw new Error("redeploy first — reputationCapId missing");
  const signer = loadSigner();
  const me = signer.getPublicKey().toSuiAddress();
  const client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
  const tb = new TribunalClient(client, dep.packageId);

  console.log(`Tribunal v3 verify on ${NETWORK}\n  package: ${dep.packageId}\n  signer : ${me}\n`);

  // [1] register 3 AgentCards
  console.log("[1] register 3 AgentCards (YES_ADV, YES_BACKER, NO_ADV)…");
  const t = Date.now();
  const personaYa = createHash("sha256").update(`pragmatist|YA|${t}`).digest("hex");
  const personaYb = createHash("sha256").update(`risk-hawk|YB|${t}`).digest("hex");
  const personaNa = createHash("sha256").update(`textualist|NA|${t}`).digest("hex");
  const ra = await exec(client, signer, tb.registerAgent("pragmatist", personaYa), "register YES_ADV");
  const rb = await exec(client, signer, tb.registerAgent("risk-hawk", personaYb), "register YES_BACKER");
  const rn = await exec(client, signer, tb.registerAgent("textualist", personaNa), "register NO_ADV");
  const cardYa = findCreated(ra, "::identity::AgentCard")[0];
  const cardYb = findCreated(rb, "::identity::AgentCard")[0];
  const cardNa = findCreated(rn, "::identity::AgentCard")[0];
  if (!cardYa || !cardYb || !cardNa) throw new Error("AgentCards not minted");

  // [2] create case
  console.log("\n[2] create case (expiry=now, liveness=0)…");
  const epoch = await currentEpoch(client);
  const cfg = configHash("claude-opus-4.8", "tribunal-v3-resolve", "kiro-gateway");
  const ns = Buffer.from(`walrus-ns://tribunal/v3-verify/${t}`, "utf8");
  const cr = await exec(
    client,
    signer,
    tb.createCase(
      {
        creatorCapId: dep.creatorCapId,
        questionHash: sha256Bytes(`v3 verify ${t}`),
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

  // [3] create pool
  console.log("\n[3] create stake pool…");
  const pr = await exec(client, signer, buildCreatePool(dep.packageId, { caseId }), "stake::create_pool");
  const poolId = findCreated(pr, "::stake::StakePool<0x2::sui::SUI>")[0];
  if (!poolId) throw new Error("StakePool not created");

  // [4] stakes — in this exact order so first-YES is YES_ADV
  console.log("\n[4] stakes: YES_ADV(0.01) → YES_BACKER(0.01) → NO_ADV(0.02)…");
  const sYa = await exec(
    client,
    signer,
    buildStake(dep.packageId, { poolId, agentCardId: cardYa, sideTrue: true, amount: STAKE_YES_ADV }),
    "stake YES_ADV",
  );
  const sYb = await exec(
    client,
    signer,
    buildStake(dep.packageId, { poolId, agentCardId: cardYb, sideTrue: true, amount: STAKE_YES_BACKER }),
    "stake YES_BACKER",
  );
  const sNa = await exec(
    client,
    signer,
    buildStake(dep.packageId, { poolId, agentCardId: cardNa, sideTrue: false, amount: STAKE_NO_ADV }),
    "stake NO_ADV",
  );
  const receiptYa = findCreated(sYa, "::stake::StakeReceipt<0x2::sui::SUI>")[0];
  const receiptYb = findCreated(sYb, "::stake::StakeReceipt<0x2::sui::SUI>")[0];
  const receiptNa = findCreated(sNa, "::stake::StakeReceipt<0x2::sui::SUI>")[0];
  if (!receiptYa || !receiptYb || !receiptNa) throw new Error("receipts not minted");

  // Assert pool state: advocate slots locked to the first stakers; weighted
  // totals reflect 3x on each advocate's principal.
  console.log("\n[4b] verify advocate slots + weighted totals…");
  const pool = await readPoolState(client, poolId);
  const advYesIsYa = String(pool.advocateYes ?? "").toLowerCase() === cardYa.toLowerCase();
  const advNoIsNa = String(pool.advocateNo ?? "").toLowerCase() === cardNa.toLowerCase();
  // YES weighted = 3 × 0.01 + 1 × 0.01 = 0.04 SUI = 40_000_000
  // NO  weighted = 3 × 0.02              = 0.06 SUI = 60_000_000
  const yesWeightedOk = pool.yesWeighted === Number(STAKE_YES_ADV * 3n + STAKE_YES_BACKER);
  const noWeightedOk = pool.noWeighted === Number(STAKE_NO_ADV * 3n);
  record("first YES staker became YES advocate", advYesIsYa, pool.advocateYes ?? "null");
  record("first NO staker became NO advocate", advNoIsNa, pool.advocateNo ?? "null");
  record("YES weighted = 3×adv + backer", yesWeightedOk, `${pool.yesWeighted}`);
  record("NO  weighted = 3×adv", noWeightedOk, `${pool.noWeighted}`);

  // [5] bundled assert(YES) + record_outcome × 3
  console.log("\n[5] bundled assert + record_outcome × 3 (YES wins)…");
  const evidenceBlob = `walrus-blob-v3-${t}`;
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
        evidence: {
          blobId: Buffer.from(evidenceBlob, "utf8"),
          sha256: sha256Bytes("v3 verdict bundle"),
          sealed: false,
          epoch: 1000,
        },
        bondAmount: BOND,
        participants: [
          { agentCardId: cardYa, argued: true },
          { agentCardId: cardYb, argued: true },
          { agentCardId: cardNa, argued: false },
        ],
      },
      me,
    ),
    "assert + 3x record_outcome",
  );

  // [6] settle
  console.log("\n[6] settle…");
  await exec(client, signer, tb.settle({ caseId }), "settle");

  // [7] claims — measure net SUI delta on each (signer's balance changes
  // capture both payout AND gas; we ignore gas here because we only need
  // a relative comparison and gas costs are roughly equal across the two
  // claim txs)
  console.log("\n[7] claims (YES_ADV → YES_BACKER → NO_ADV)…");
  const claimYa = await exec(
    client,
    signer,
    buildClaim(dep.packageId, { poolId, caseId, receiptId: receiptYa }),
    "claim YES_ADV",
  );
  const claimYb = await exec(
    client,
    signer,
    buildClaim(dep.packageId, { poolId, caseId, receiptId: receiptYb }),
    "claim YES_BACKER",
  );
  const claimNa = await exec(
    client,
    signer,
    buildClaim(dep.packageId, { poolId, caseId, receiptId: receiptNa }),
    "claim NO_ADV (loser, no payout)",
  );

  // Balance delta = payout - gas. Strip gas by adding back gasUsed.
  const gas = (res: any) => {
    const g = res.effects?.gasUsed;
    if (!g) return 0n;
    return (
      BigInt(g.computationCost ?? 0) +
      BigInt(g.storageCost ?? 0) -
      BigInt(g.storageRebate ?? 0)
    );
  };
  const payoutYa = netSuiDelta(claimYa, me) + gas(claimYa);
  const payoutYb = netSuiDelta(claimYb, me) + gas(claimYb);
  const payoutNa = netSuiDelta(claimNa, me) + gas(claimNa);

  // Expected math (YES wins, NO pool of 0.02 distributed by weight):
  //   YES_ADV gross    = 0.01 (principal) + 3 × 0.01 / 0.04 × 0.02 = 0.01 + 0.015 = 0.025
  //   YES_BACKER gross = 0.01 (principal) + 1 × 0.01 / 0.04 × 0.02 = 0.01 + 0.005 = 0.015
  //   NO_ADV  gross    = 0 (loser, receipt consumed)
  const expectedAdv = STAKE_YES_ADV + (3n * STAKE_YES_ADV * STAKE_NO_ADV) / (3n * STAKE_YES_ADV + STAKE_YES_BACKER);
  const expectedBacker = STAKE_YES_BACKER + (1n * STAKE_YES_BACKER * STAKE_NO_ADV) / (3n * STAKE_YES_ADV + STAKE_YES_BACKER);

  console.log(`\n[7b] payouts (gross, gas stripped):`);
  console.log(`     YES_ADV    : ${payoutYa}  (expected ${expectedAdv})`);
  console.log(`     YES_BACKER : ${payoutYb}  (expected ${expectedBacker})`);
  console.log(`     NO_ADV     : ${payoutNa}  (expected 0)`);

  record("YES_ADV payout matches 3x-weighted formula", payoutYa === expectedAdv);
  record("YES_BACKER payout matches 1x-weighted formula", payoutYb === expectedBacker);
  record("NO_ADV (loser) payout is zero", payoutNa === 0n);

  // The headline invariant: advocate's bonus (payout-principal) is exactly 3x backer's bonus.
  const advBonus = payoutYa - STAKE_YES_ADV;
  const backerBonus = payoutYb - STAKE_YES_BACKER;
  record(
    "advocate bonus = 3x backer bonus at equal stake",
    advBonus === backerBonus * 3n,
    `adv=${advBonus} backer=${backerBonus}`,
  );

  // Pool drained
  const finalPool = await readPoolState(client, poolId);
  record("YES pool fully drained", finalPool.yesBalance === 0, `yes_balance=${finalPool.yesBalance}`);
  record("NO  pool fully drained", finalPool.noBalance === 0, `no_balance=${finalPool.noBalance}`);

  // [8] persist a v3 bundle to Walrus and assert all 6 typed patches landed.
  console.log("\n[8] persist v3 VerdictBundle to Walrus (6 typed entries)…");
  const namespace = `walrus-ns://tribunal/case/${caseId}`;
  const memory = new TribunalMemory(namespace, new WalrusStore(), new HashEmbedder());

  const bundle: VerdictBundleLike = {
    case: {
      question: "v3-verify synthesized case",
      criteria: "exact integer payout matches 3x-weighted formula at equal stake",
      evidence: `tx digests for case ${caseId}`,
    },
    debate: {
      rounds: [
        {
          round: 1,
          arguments: [
            { side: "yes", claim: "YES stands", reasoning: "ya-r1" },
            { side: "no", claim: "NO stands", reasoning: "na-r1" },
          ],
        },
      ],
    },
    jury: {
      firstPass: [
        { handle: "juror-1", vote: true, confidence: 0.7, rationale: "..." },
        { handle: "juror-2", vote: true, confidence: 0.6, rationale: "..." },
        { handle: "juror-3", vote: false, confidence: 0.5, rationale: "..." },
      ],
      finalVotes: [
        { handle: "juror-1", vote: true, confidence: 0.75, rationale: "..." },
        { handle: "juror-2", vote: true, confidence: 0.65, rationale: "..." },
        { handle: "juror-3", vote: false, confidence: 0.55, rationale: "..." },
      ],
      outcome: true,
      votesTrue: 2,
      votesFalse: 1,
      abstain: 0,
      dissent: 1,
      disagreementRate: 0.33,
    },
    guardrail: {
      finalOutcome: true,
      ratifiedJury: true,
      overrideReason: "",
      biasFlags: [],
      confidence: 0.8,
      reasoning: "ratifies jury — bonus arithmetic checks out",
      personaTrapsRejected: [],
      configHash: cfg.hash.toString(),
    },
    finalOutcome: true,
    models: {
      advocate: "claude-haiku-4.5",
      jury: "claude-sonnet-4.6",
      guardrail: "claude-opus-4.8",
    },
    configHashHex: cfg.hash.toString(),
    decidedAt: Date.now(),
    guardrailConfigHash: createHash("sha256").update("v3-guardrail-prompt").digest("hex"),
    provenance: {
      caseId,
      advocates: {
        yes: { agentCardId: cardYa, archetypeId: "pragmatist", isFirstStaker: true, weight: 3 },
        no: { agentCardId: cardNa, archetypeId: "textualist", isFirstStaker: true, weight: 3 },
      },
      backers: [
        { agentCardId: cardYb, side: "yes", archetypeId: "risk-hawk", weight: 1 },
      ],
      jurors: [
        { handle: "juror-1", archetypeId: "risk-hawk", seed: "seed-1" },
        { handle: "juror-2", archetypeId: "consequentialist", seed: "seed-2" },
        { handle: "juror-3", archetypeId: "textualist", seed: "seed-3" },
      ],
      models: {
        advocate: "claude-haiku-4.5",
        jury: "claude-sonnet-4.6",
        guardrail: "claude-opus-4.8",
      },
      gatewayTemperatures: { advocate: 0.6, jury: 0.4, guardrail: 0.2 },
      configHashHex: cfg.hash.toString(),
      guardrailConfigHash: createHash("sha256").update("v3-guardrail-prompt").digest("hex"),
      decidedAt: Date.now(),
      resolverCommit: process.env.GIT_SHA ?? "unknown",
    },
  };

  let walrusOk = true;
  let quiltId = "";
  let patches: Record<string, string> = {};
  try {
    const persisted = await persistVerdictBundle(memory, caseId, bundle);
    quiltId = persisted.quiltId;
    patches = persisted.patches;
  } catch (e) {
    walrusOk = false;
    console.log(`  ✗ walrus persist failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  record("walrus publisher reachable, quilt written", walrusOk, quiltId);
  for (const kind of ["debate", "jury", "guardrail", "verdict", "case_law", "provenance"]) {
    record(`audit-trail entry present: ${kind}`, Boolean(patches[kind]), patches[kind]);
  }

  console.log("\n=== summary ===");
  const failed = checks.filter(([, pass]) => !pass);
  if (failed.length) {
    console.log(`\n${failed.length} check(s) failed:`);
    for (const [label, , detail] of failed) console.log(`  - ${label}${detail ? ` (${detail})` : ""}`);
    process.exit(1);
  }

  console.log(`\n✅ v3 verified end-to-end on ${NETWORK}`);
  console.log(`   case        : ${caseId}`);
  console.log(`   pool        : ${poolId}`);
  console.log(`   YES_ADV     : ${cardYa}  (advocate, 0.01 SUI)`);
  console.log(`   YES_BACKER  : ${cardYb}  (backer,   0.01 SUI)`);
  console.log(`   NO_ADV      : ${cardNa}  (advocate, 0.02 SUI)`);
  console.log(`   walrus quilt: ${quiltId}`);
  console.log(`   patches     : ${Object.keys(patches).join(", ")}`);
}

main().catch((e) => {
  console.error("\n=== verify-v3-flow FAILED ===");
  console.error(e);
  process.exit(1);
});
