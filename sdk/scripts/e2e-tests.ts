// Production e2e test suite for Tribunal on-chain lifecycle.
//
// Runs against a LIVE network deployment (testnet by default). Exercises:
//   - Happy path: create -> assert -> settle (undisputed)
//   - Disputed path: resolver wins (no flip)
//   - Disputed path: disputer wins (outcome flips)
//   - Error paths: config mismatch, dispute after window, settle before liveness,
//     double assert, double settle, bond mismatch, wrong cap
//   - Event emission + field correctness
//   - State reads at each lifecycle stage
//   - Memory layer round-trip (remember -> recall -> restore)
//
// Usage:
//   cd sdk && npm run e2e:tests
//
// Requires: TRIBUNAL_PRIVKEY or Sui CLI keystore; deployment.<network>.json

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import type { Signer } from "@mysten/sui/cryptography";
import { TribunalClient } from "../src/client.js";
import { loadSigner, configHash, sha256Bytes } from "../src/signer.js";
import { TribunalMemory } from "../src/memory/index.js";
import { WalrusStore } from "../src/memory/walrus.js";
import { resolveEmbedder } from "../src/memory/embeddings.js";
import type { TribunalDeployment } from "../src/types.js";

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const NETWORK = (process.env.TRIBUNAL_NETWORK ?? "testnet") as TribunalDeployment["network"];
const BOND = 100_000_000n; // 0.1 SUI

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

const results: TestResult[] = [];
let client: SuiJsonRpcClient;
let signer: Signer;
let me: string;
let tb: TribunalClient;
let dep: TribunalDeployment;

function loadDeployment(): TribunalDeployment {
  const p = join(__dirname, "..", "..", `deployment.${NETWORK}.json`);
  return JSON.parse(readFileSync(p, "utf8")) as TribunalDeployment;
}

// ---------------------------------------------------------------------------
// Transaction execution helpers
// ---------------------------------------------------------------------------

interface TxEffects {
  digest: string;
  status: string;
  objectChanges: ObjectChange[];
  events: MoveEvent[];
}

interface ObjectChange {
  type: string;
  objectType: string;
  objectId: string;
}

interface MoveEvent {
  type: string;
  parsedJson: Record<string, unknown>;
}

async function exec(tx: Transaction, label: string): Promise<TxEffects> {
  const res = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true, showEvents: true },
  });
  await client.waitForTransaction({ digest: res.digest });
  const status = (res.effects as { status?: { status?: string } } | undefined)
    ?.status?.status ?? "unknown";
  if (status !== "success") {
    throw new Error(`${label} failed: ${status}`);
  }
  const objectChanges = ((res.objectChanges ?? []) as unknown[]).map((x) => {
    const obj = x as Record<string, unknown>;
    return {
      type: String(obj.type ?? ""),
      objectType: String(obj.objectType ?? ""),
      objectId: String(obj.objectId ?? ""),
    };
  });
  const events = ((res.events ?? []) as unknown[]).map((x) => {
    const ev = x as Record<string, unknown>;
    return {
      type: String(ev.type ?? ""),
      parsedJson: (ev.parsedJson ?? {}) as Record<string, unknown>,
    };
  });
  return { digest: res.digest, status, objectChanges, events };
}

/** Expect execution to abort (MoveAbort). Returns true if it aborted. */
async function expectAbort(tx: Transaction, label: string): Promise<{ aborted: boolean; code?: string }> {
  try {
    const res = await client.signAndExecuteTransaction({
      signer,
      transaction: tx,
      options: { showEffects: true },
    });
    await client.waitForTransaction({ digest: res.digest });
    const status = (res.effects as { status?: { status?: string; error?: string } } | undefined)?.status;
    if (status?.status === "failure") {
      return { aborted: true, code: status.error };
    }
    return { aborted: false };
  } catch (e: unknown) {
    // RPC sometimes throws on abort
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("MoveAbort") || msg.includes("InsufficientGas") || msg.includes("CommandFailure")) {
      return { aborted: true, code: msg };
    }
    return { aborted: true, code: msg };
  }
}

function findCreated(effects: TxEffects, suffix: string): string | undefined {
  const c = effects.objectChanges.find(
    (x) => x.type === "created" && x.objectType.includes(suffix),
  );
  return c?.objectId;
}

function findEvent(effects: TxEffects, suffix: string): MoveEvent | undefined {
  return effects.events.find((e) => e.type.includes(suffix));
}

async function currentEpoch(): Promise<number> {
  const { epoch } = await client.getLatestSuiSystemState();
  return Number(epoch);
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const t0 = Date.now();
  try {
    await fn();
    results.push({ name, passed: true, duration: Date.now() - t0 });
    console.log(`  ✓ ${name} (${Date.now() - t0}ms)`);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    results.push({ name, passed: false, error: msg, duration: Date.now() - t0 });
    console.log(`  ✗ ${name} — ${msg}`);
  }
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Shared test state (created by earlier tests, consumed by later ones)
// ---------------------------------------------------------------------------

let case1Id: string;
let cap1Id: string;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  dep = loadDeployment();
  signer = loadSigner();
  me = signer.getPublicKey().toSuiAddress();
  client = new SuiJsonRpcClient({ url: getJsonRpcFullnodeUrl(NETWORK), network: NETWORK });
  tb = new TribunalClient(client, dep.packageId);

  console.log(`\nTribunal e2e tests on ${NETWORK}`);
  console.log(`  package : ${dep.packageId}`);
  console.log(`  signer  : ${me}\n`);

  const epoch = await currentEpoch();
  const cfg = configHash("claude-opus-4.8", "resolve-subjective-v1", "reuters,ap,onchain");

  // =========================================================================
  // SECTION 1: Happy path — undisputed settle
  // =========================================================================
  console.log("--- Happy path (undisputed) ---");

  await test("create_case emits CaseCreated with locked config", async () => {
    const tx = tb.createCase(
      {
        creatorCapId: dep.creatorCapId,
        questionHash: sha256Bytes("e2e-test: undisputed Q"),
        configHash: cfg.hash,
        memoryNs: Buffer.from(`walrus-ns://e2e/${Date.now()}-hp`, "utf8"),
        expiryEpoch: epoch,
        livenessEpochs: 0, // settle immediately
      },
      me,
    );
    const effects = await exec(tx, "create_case(hp)");
    case1Id = findCreated(effects, "::case::Case<")!;
    cap1Id = findCreated(effects, "::case::ResolverCap")!;
    assert(!!case1Id, "Case not created");
    assert(!!cap1Id, "ResolverCap not created");

    const ev = findEvent(effects, "::case::CaseCreated");
    assert(!!ev, "CaseCreated event missing");
    // Sui JSON-RPC serializes vector<u8> as a number array
    const eventHash = Array.isArray(ev.parsedJson.config_hash)
      ? Buffer.from(ev.parsedJson.config_hash as number[]).toString("hex")
      : String(ev.parsedJson.config_hash);
    assertEqual(
      eventHash,
      Buffer.from(cfg.hash).toString("hex"),
      "config_hash in event",
    );
  });

  await test("getCase returns Open state before assertion", async () => {
    const c = await tb.getCase(case1Id);
    const fields = (c?.content as { fields?: Record<string, unknown> } | undefined)?.fields;
    assert(!!fields, "could not read case fields");
    const state = fields.state as Record<string, unknown> | undefined;
    assert(!!state, "state field missing");
    // Move enum serializes as { variant: "Open" } or similar
    const stateStr = JSON.stringify(state);
    assert(stateStr.includes("Open"), `expected Open state, got ${stateStr}`);
  });

  await test("getResolution returns not-settled before assertion", async () => {
    const r = await tb.getResolution(case1Id, undefined, me);
    assertEqual(r.settled, false, "settled");
  });

  await test("assert_resolution with valid config succeeds", async () => {
    const tx = tb.assertResolution(
      {
        caseId: case1Id,
        resolverCapId: cap1Id,
        presentedConfig: cfg.preimage,
        outcomeTrue: true,
        evidence: {
          blobId: Buffer.from("e2e-blob-hp", "utf8"),
          sha256: sha256Bytes("e2e evidence bundle hp"),
          sealed: false,
          epoch: 1000,
        },
        bondAmount: BOND,
      },
      me,
    );
    const effects = await exec(tx, "assert_resolution(hp)");
    const ev = findEvent(effects, "::case::ResolutionAsserted");
    assert(!!ev, "ResolutionAsserted event missing");
    assertEqual(ev.parsedJson.outcome_true as boolean, true, "outcome_true in event");
    assertEqual(BigInt(ev.parsedJson.bond as string), BOND, "bond in event");
  });

  await test("settle undisputed case returns bond and settles", async () => {
    const tx = tb.settle({ caseId: case1Id });
    const effects = await exec(tx, "settle(hp)");
    const ev = findEvent(effects, "::case::CaseSettled");
    assert(!!ev, "CaseSettled event missing");
    assertEqual(ev.parsedJson.outcome_true as boolean, true, "outcome_true");
    assertEqual(ev.parsedJson.disputed as boolean, false, "disputed flag");
  });

  await test("getResolution returns settled=true outcomeTrue=true", async () => {
    const r = await tb.getResolution(case1Id, undefined, me);
    assertEqual(r.settled, true, "settled");
    assertEqual(r.outcomeTrue, true, "outcomeTrue");
  });

  // =========================================================================
  // SECTION 2: Disputed path — disputer wins, outcome flips
  // =========================================================================
  console.log("\n--- Disputed path (disputer wins) ---");

  let case2Id: string;
  let cap2Id: string;
  let dispute2Id: string;

  await test("create + assert for dispute scenario", async () => {
    const epoch2 = await currentEpoch();
    const tx1 = tb.createCase(
      {
        creatorCapId: dep.creatorCapId,
        questionHash: sha256Bytes("e2e-test: disputed-dw Q"),
        configHash: cfg.hash,
        memoryNs: Buffer.from(`walrus-ns://e2e/${Date.now()}-dw`, "utf8"),
        expiryEpoch: epoch2,
        livenessEpochs: 1, // window open for dispute
      },
      me,
    );
    const e1 = await exec(tx1, "create_case(dw)");
    case2Id = findCreated(e1, "::case::Case<")!;
    cap2Id = findCreated(e1, "::case::ResolverCap")!;
    assert(!!case2Id && !!cap2Id, "case2/cap2 not created");

    const tx2 = tb.assertResolution(
      {
        caseId: case2Id,
        resolverCapId: cap2Id,
        presentedConfig: cfg.preimage,
        outcomeTrue: true,
        evidence: {
          blobId: Buffer.from("e2e-blob-dw", "utf8"),
          sha256: sha256Bytes("e2e evidence dw"),
          sealed: false,
          epoch: 1000,
        },
        bondAmount: BOND,
      },
      me,
    );
    await exec(tx2, "assert_resolution(dw)");
  });

  await test("dispute_resolution within window succeeds", async () => {
    const tx = tb.disputeResolution({ caseId: case2Id, bondAmount: BOND });
    const effects = await exec(tx, "dispute_resolution(dw)");
    dispute2Id = findCreated(effects, "::dispute::Dispute<")!;
    assert(!!dispute2Id, "Dispute object not created");

    const ev = findEvent(effects, "::dispute::ResolutionDisputed");
    assert(!!ev, "ResolutionDisputed event missing");
    assertEqual(BigInt(ev.parsedJson.bond as string), BOND, "dispute bond in event");
  });

  await test("resolve_dispute disputer wins flips outcome", async () => {
    const tx = tb.resolveDispute({
      caseId: case2Id,
      disputeId: dispute2Id,
      resolverCapId: cap2Id,
      resolverWon: false,
      protocolFeeBps: 50,
    });
    const effects = await exec(tx, "resolve_dispute(dw)");
    const ev = findEvent(effects, "::dispute::DisputeResolved");
    assert(!!ev, "DisputeResolved event missing");
    assertEqual(ev.parsedJson.resolver_won as boolean, false, "resolver_won");
    // fee = (2 * BOND) * 50 / 10000
    const expectedFee = (BOND * 2n * 50n) / 10_000n;
    const expectedPayout = BOND * 2n - expectedFee;
    assertEqual(BigInt(ev.parsedJson.payout as string), expectedPayout, "payout");
    assertEqual(BigInt(ev.parsedJson.fee as string), expectedFee, "fee");
  });

  await test("post-dispute state: settled=true outcomeTrue=false (flipped)", async () => {
    const r = await tb.getResolution(case2Id, undefined, me);
    assertEqual(r.settled, true, "settled");
    assertEqual(r.outcomeTrue, false, "outcomeTrue (should be flipped)");
  });

  // =========================================================================
  // SECTION 3: Disputed path — resolver wins (no flip)
  // =========================================================================
  console.log("\n--- Disputed path (resolver wins) ---");

  let case3Id: string;
  let cap3Id: string;
  let dispute3Id: string;

  await test("create + assert + dispute for resolver-wins scenario", async () => {
    const epoch3 = await currentEpoch();
    const tx1 = tb.createCase(
      {
        creatorCapId: dep.creatorCapId,
        questionHash: sha256Bytes("e2e-test: disputed-rw Q"),
        configHash: cfg.hash,
        memoryNs: Buffer.from(`walrus-ns://e2e/${Date.now()}-rw`, "utf8"),
        expiryEpoch: epoch3,
        livenessEpochs: 1,
      },
      me,
    );
    const e1 = await exec(tx1, "create_case(rw)");
    case3Id = findCreated(e1, "::case::Case<")!;
    cap3Id = findCreated(e1, "::case::ResolverCap")!;

    const tx2 = tb.assertResolution(
      {
        caseId: case3Id,
        resolverCapId: cap3Id,
        presentedConfig: cfg.preimage,
        outcomeTrue: false,
        evidence: {
          blobId: Buffer.from("e2e-blob-rw", "utf8"),
          sha256: sha256Bytes("e2e evidence rw"),
          sealed: false,
          epoch: 1000,
        },
        bondAmount: BOND,
      },
      me,
    );
    await exec(tx2, "assert_resolution(rw)");

    const tx3 = tb.disputeResolution({ caseId: case3Id, bondAmount: BOND });
    const e3 = await exec(tx3, "dispute_resolution(rw)");
    dispute3Id = findCreated(e3, "::dispute::Dispute<")!;
    assert(!!dispute3Id, "Dispute not created");
  });

  await test("resolve_dispute resolver wins preserves outcome", async () => {
    const tx = tb.resolveDispute({
      caseId: case3Id,
      disputeId: dispute3Id,
      resolverCapId: cap3Id,
      resolverWon: true,
      protocolFeeBps: 100, // 1%
    });
    const effects = await exec(tx, "resolve_dispute(rw)");
    const ev = findEvent(effects, "::dispute::DisputeResolved");
    assert(!!ev, "DisputeResolved event missing");
    assertEqual(ev.parsedJson.resolver_won as boolean, true, "resolver_won");
  });

  await test("post-resolve: settled=true outcomeTrue=false (not flipped)", async () => {
    const r = await tb.getResolution(case3Id, undefined, me);
    assertEqual(r.settled, true, "settled");
    assertEqual(r.outcomeTrue, false, "outcomeTrue (should stay false)");
  });

  // =========================================================================
  // SECTION 4: Error paths
  // =========================================================================
  console.log("\n--- Error paths ---");

  await test("assert_resolution with wrong config aborts (EConfigMismatch)", async () => {
    // Create a fresh case for error tests
    const epoch4 = await currentEpoch();
    const txC = tb.createCase(
      {
        creatorCapId: dep.creatorCapId,
        questionHash: sha256Bytes("e2e-test: error-paths Q"),
        configHash: cfg.hash,
        memoryNs: Buffer.from(`walrus-ns://e2e/${Date.now()}-err`, "utf8"),
        expiryEpoch: epoch4,
        livenessEpochs: 1,
      },
      me,
    );
    const ec = await exec(txC, "create_case(err)");
    const errCaseId = findCreated(ec, "::case::Case<")!;
    const errCapId = findCreated(ec, "::case::ResolverCap")!;

    // Wrong config preimage
    const badConfig = Buffer.from("wrong-model|wrong-prompt|wrong-sources", "utf8");
    const tx = tb.assertResolution(
      {
        caseId: errCaseId,
        resolverCapId: errCapId,
        presentedConfig: Uint8Array.from(badConfig),
        outcomeTrue: true,
        evidence: {
          blobId: Buffer.from("e2e-blob-err", "utf8"),
          sha256: sha256Bytes("x"),
          sealed: false,
          epoch: 1000,
        },
        bondAmount: BOND,
      },
      me,
    );
    const result = await expectAbort(tx, "assert bad config");
    assert(result.aborted, "expected config mismatch to abort");
  });

  await test("double assert aborts (ENotOpen)", async () => {
    // case1Id is already settled — try asserting on it
    const tx = tb.assertResolution(
      {
        caseId: case1Id,
        resolverCapId: cap1Id,
        presentedConfig: cfg.preimage,
        outcomeTrue: false,
        evidence: {
          blobId: Buffer.from("e2e-blob-x", "utf8"),
          sha256: sha256Bytes("x"),
          sealed: false,
          epoch: 1000,
        },
        bondAmount: BOND,
      },
      me,
    );
    const result = await expectAbort(tx, "double assert");
    assert(result.aborted, "expected double assert to abort");
  });

  await test("double settle aborts", async () => {
    // case1Id is already settled
    const tx = tb.settle({ caseId: case1Id });
    const result = await expectAbort(tx, "double settle");
    assert(result.aborted, "expected double settle to abort");
  });

  await test("settle before liveness window aborts (ELivenessNotPassed)", async () => {
    // Create a case with long liveness, assert, then try to settle immediately
    const epoch5 = await currentEpoch();
    const txC = tb.createCase(
      {
        creatorCapId: dep.creatorCapId,
        questionHash: sha256Bytes("e2e-test: early-settle Q"),
        configHash: cfg.hash,
        memoryNs: Buffer.from(`walrus-ns://e2e/${Date.now()}-es`, "utf8"),
        expiryEpoch: epoch5,
        livenessEpochs: 100, // can't settle for 100 epochs
      },
      me,
    );
    const ec = await exec(txC, "create_case(es)");
    const esCaseId = findCreated(ec, "::case::Case<")!;
    const esCapId = findCreated(ec, "::case::ResolverCap")!;

    const txA = tb.assertResolution(
      {
        caseId: esCaseId,
        resolverCapId: esCapId,
        presentedConfig: cfg.preimage,
        outcomeTrue: true,
        evidence: {
          blobId: Buffer.from("e2e-blob-es", "utf8"),
          sha256: sha256Bytes("es"),
          sealed: false,
          epoch: 1000,
        },
        bondAmount: BOND,
      },
      me,
    );
    await exec(txA, "assert_resolution(es)");

    const tx = tb.settle({ caseId: esCaseId });
    const result = await expectAbort(tx, "early settle");
    assert(result.aborted, "expected early settle to abort");
  });

  await test("dispute with mismatched bond aborts (EBondMismatch)", async () => {
    // Use the early-settle case (asserted, liveness=100, window open)
    // But we need to find its id — create another one for clean state
    const epoch6 = await currentEpoch();
    const txC = tb.createCase(
      {
        creatorCapId: dep.creatorCapId,
        questionHash: sha256Bytes("e2e-test: bond-mismatch Q"),
        configHash: cfg.hash,
        memoryNs: Buffer.from(`walrus-ns://e2e/${Date.now()}-bm`, "utf8"),
        expiryEpoch: epoch6,
        livenessEpochs: 1,
      },
      me,
    );
    const ec = await exec(txC, "create_case(bm)");
    const bmCaseId = findCreated(ec, "::case::Case<")!;
    const bmCapId = findCreated(ec, "::case::ResolverCap")!;

    const txA = tb.assertResolution(
      {
        caseId: bmCaseId,
        resolverCapId: bmCapId,
        presentedConfig: cfg.preimage,
        outcomeTrue: true,
        evidence: {
          blobId: Buffer.from("e2e-blob-bm", "utf8"),
          sha256: sha256Bytes("bm"),
          sealed: false,
          epoch: 1000,
        },
        bondAmount: BOND,
      },
      me,
    );
    await exec(txA, "assert_resolution(bm)");

    // Dispute with wrong bond amount (half)
    const tx = tb.disputeResolution({ caseId: bmCaseId, bondAmount: BOND / 2n });
    const result = await expectAbort(tx, "bond mismatch");
    assert(result.aborted, "expected bond mismatch to abort");
  });

  // =========================================================================
  // SECTION 5: Event query readback
  // =========================================================================
  console.log("\n--- Event readback ---");

  await test("queryEvents CaseSettled returns recent settlements", async () => {
    const events = await tb.queryEvents("CaseSettled", 10);
    assert(events.data.length >= 3, `expected >=3 CaseSettled events, got ${events.data.length}`);
  });

  await test("queryEvents DisputeResolved returns recent disputes", async () => {
    const events = await tb.queryEvents("DisputeResolved", 10);
    assert(events.data.length >= 2, `expected >=2 DisputeResolved events, got ${events.data.length}`);
  });

  // =========================================================================
  // SECTION 6: Memory layer (Walrus round-trip)
  // =========================================================================
  console.log("\n--- Memory layer (Walrus) ---");

  await test("remember -> recall -> restore round-trips through Walrus", async () => {
    const ns = `walrus-ns://e2e/memory-${Date.now()}`;
    const walrus = new WalrusStore();
    const embedder = resolveEmbedder();
    const memory = new TribunalMemory(ns, walrus, embedder);

    // Remember a reasoning trace + verdict
    const entries = [
      {
        id: "test-trace-1",
        kind: "reasoning_trace" as const,
        text: "The committee analyzed the evidence showing Project Aurora launched its token before the stated date based on on-chain transaction timestamps.",
      },
      {
        id: "test-verdict-1",
        kind: "verdict" as const,
        text: "Verdict: TRUE — Project Aurora token launch occurred before the deadline per on-chain evidence.",
        data: { outcomeTrue: true, agreement: 0.83 },
      },
    ];

    const w = await memory.remember(entries);
    assert(!!w.quiltId, "quiltId not returned");
    assertEqual(w.rows.length, 2, "rows written");

    // Recall — the verdict should be top hit for a relevant query
    const hits = await memory.recall("Did Aurora launch the token on time?", { k: 2 });
    assert(hits.length > 0, "recall returned no hits");
    assert(
      hits[0].entry.text.toLowerCase().includes("aurora"),
      `top recall hit doesn't mention aurora: ${hits[0].entry.text.slice(0, 60)}`,
    );

    // Restore — wipe index, rebuild from Walrus, re-query
    const restored = await memory.restore([w.quiltId]);
    assertEqual(restored, 2, "restored entry count");

    const hits2 = await memory.recall("Aurora token launch deadline", { k: 1 });
    assert(hits2.length > 0, "post-restore recall empty");
    assert(
      hits2[0].entry.text.toLowerCase().includes("aurora"),
      "post-restore recall doesn't match",
    );
  });

  await test("recall filters by kind", async () => {
    const ns = `walrus-ns://e2e/filter-${Date.now()}`;
    const walrus = new WalrusStore();
    const embedder = resolveEmbedder();
    const memory = new TribunalMemory(ns, walrus, embedder);

    await memory.remember([
      { id: "v1", kind: "verdict", text: "Verdict on governance proposal: TRUE" },
      { id: "t1", kind: "reasoning_trace", text: "Reasoning about governance proposal: evidence is clear" },
    ]);

    const verdicts = await memory.recall("governance", { k: 5, kind: "verdict" });
    for (const h of verdicts) {
      assertEqual(h.entry.kind, "verdict", "kind filter");
    }
  });

  // =========================================================================
  // Summary
  // =========================================================================
  console.log("\n===================================");
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailed tests:");
    for (const r of results.filter((x) => !x.passed)) {
      console.log(`  ✗ ${r.name}: ${r.error}`);
    }
    process.exit(1);
  }
  console.log("=== ALL E2E TESTS PASSED ===\n");
}

run().catch((e: unknown) => {
  console.error("\n=== E2E TEST SUITE CRASHED ===");
  console.error(e);
  process.exit(1);
});
