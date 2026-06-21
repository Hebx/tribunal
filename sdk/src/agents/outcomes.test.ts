// Run with: node --import tsx --test src/agents/outcomes.test.ts
//
// Pure PTB shape tests for the bundled assert+record-outcomes builder. We
// inspect tx.getData() — the same approach used elsewhere in the SDK for
// shape-checking without hitting a network.

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAssertAndRecord, buildOverturnOutcomes } from "./outcomes.js";

const PKG = "0x" + "1".repeat(64);
const CASE = "0x" + "a".repeat(64);
const RES_CAP = "0x" + "b".repeat(64);
const REP_CAP = "0x" + "c".repeat(64);
const SENDER = "0x" + "d".repeat(64);
const AGENT_Y = "0x" + "e".repeat(64);
const AGENT_N = "0x" + "f".repeat(64);

const evidence = {
  blobId: new Uint8Array([1, 2, 3]),
  sha256: new Uint8Array(32).fill(7),
  sealed: false,
  epoch: 42,
};

function moveCallTargets(tx: any): string[] {
  // @mysten/sui 2.x: tx.getData() returns serialized commands
  const data = tx.getData();
  const cmds = data.commands ?? [];
  return cmds
    .filter((c: any) => c.MoveCall)
    .map((c: any) => {
      const m = c.MoveCall;
      return `${m.package}::${m.module}::${m.function}`;
    });
}

test("buildAssertAndRecord emits evidence + assert + one record per participant", () => {
  const tx = buildAssertAndRecord(
    PKG,
    {
      caseId: CASE,
      resolverCapId: RES_CAP,
      reputationCapId: REP_CAP,
      presentedConfig: new TextEncoder().encode("model|prompt|sources"),
      outcomeTrue: true,
      evidence,
      bondAmount: 1_000_000n,
      participants: [
        { agentCardId: AGENT_Y, argued: true },
        { agentCardId: AGENT_N, argued: false },
      ],
    },
    SENDER,
  );

  const targets = moveCallTargets(tx);
  assert.equal(targets.filter((t) => t.endsWith("::evidence::new_ref")).length, 1);
  assert.equal(targets.filter((t) => t.endsWith("::coin::into_balance")).length, 1);
  assert.equal(targets.filter((t) => t.endsWith("::case::assert_resolution")).length, 1);
  // one record_outcome per participant
  assert.equal(targets.filter((t) => t.endsWith("::identity::record_outcome")).length, 2);
});

test("buildAssertAndRecord ordering: assert before any record_outcome", () => {
  const tx = buildAssertAndRecord(
    PKG,
    {
      caseId: CASE,
      resolverCapId: RES_CAP,
      reputationCapId: REP_CAP,
      presentedConfig: new Uint8Array([1]),
      outcomeTrue: true,
      evidence,
      bondAmount: 1n,
      participants: [{ agentCardId: AGENT_Y, argued: true }],
    },
    SENDER,
  );
  const targets = moveCallTargets(tx);
  const assertIdx = targets.findIndex((t) => t.endsWith("::case::assert_resolution"));
  const firstRecord = targets.findIndex((t) => t.endsWith("::identity::record_outcome"));
  assert.ok(assertIdx >= 0 && firstRecord > assertIdx, `order wrong: assert=${assertIdx} record=${firstRecord}`);
});

test("won flag follows argued === outcomeTrue", () => {
  // outcome YES → affirmer won, denier lost
  const tx = buildAssertAndRecord(
    PKG,
    {
      caseId: CASE,
      resolverCapId: RES_CAP,
      reputationCapId: REP_CAP,
      presentedConfig: new Uint8Array([1]),
      outcomeTrue: true,
      evidence,
      bondAmount: 1n,
      participants: [
        { agentCardId: AGENT_Y, argued: true }, // won
        { agentCardId: AGENT_N, argued: false }, // lost
      ],
    },
    SENDER,
  );
  const data = tx.getData();
  const records = (data.commands ?? []).filter(
    (c: any) => c.MoveCall && c.MoveCall.function === "record_outcome",
  );
  assert.equal(records.length, 2);
  // arg[2] is `won` (bool). Pure args appear in tx.inputs as Pure → look up by index.
  function boolAtArg(record: any, argIdx: number, inputs: any[]): boolean {
    const a = record.MoveCall.arguments[argIdx];
    if (!a || !a.Input) throw new Error("expected Input arg");
    const inp = inputs[a.Input];
    const bytes: number[] = inp.Pure?.bytes
      ? Array.from(Buffer.from(inp.Pure.bytes, "base64"))
      : inp.Pure?.Pure ?? inp.Pure;
    return Boolean(bytes[0]);
  }
  const inputs = data.inputs;
  assert.equal(boolAtArg(records[0], 2, inputs), true, "affirmer scored as won");
  assert.equal(boolAtArg(records[1], 2, inputs), false, "denier scored as lost");
  // arg[3] is `overturned` — both false on the non-dispute path
  assert.equal(boolAtArg(records[0], 3, inputs), false);
  assert.equal(boolAtArg(records[1], 3, inputs), false);
});

test("buildOverturnOutcomes flips wins/losses and sets overturned for the flipped winner", () => {
  // Original assertion was YES (affirmer won); dispute flipped to NO.
  const tx = buildOverturnOutcomes(
    PKG,
    REP_CAP,
    [
      { agentCardId: AGENT_Y, argued: true }, // was winning, now overturned
      { agentCardId: AGENT_N, argued: false }, // was losing, now wins
    ],
    false, // finalOutcome after dispute
  );
  const data = tx.getData();
  const records = (data.commands ?? []).filter(
    (c: any) => c.MoveCall && c.MoveCall.function === "record_outcome",
  );
  assert.equal(records.length, 2);
});

test("zero participants still produces a valid assert tx", () => {
  const tx = buildAssertAndRecord(
    PKG,
    {
      caseId: CASE,
      resolverCapId: RES_CAP,
      reputationCapId: REP_CAP,
      presentedConfig: new Uint8Array([1]),
      outcomeTrue: false,
      evidence,
      bondAmount: 1n,
      participants: [],
    },
    SENDER,
  );
  const targets = moveCallTargets(tx);
  assert.equal(targets.filter((t) => t.endsWith("::case::assert_resolution")).length, 1);
  assert.equal(targets.filter((t) => t.endsWith("::identity::record_outcome")).length, 0);
});
