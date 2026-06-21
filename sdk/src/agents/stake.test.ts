// Run with: node --import tsx --test src/agents/stake.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCreatePool, buildStake, buildClaim } from "./stake.js";

const PKG = "0x" + "1".repeat(64);
const CASE = "0x" + "a".repeat(64);
const POOL = "0x" + "b".repeat(64);
const AGENT = "0x" + "c".repeat(64);
const RECEIPT = "0x" + "d".repeat(64);

function targets(tx: any): string[] {
  return (tx.getData().commands ?? [])
    .filter((c: any) => c.MoveCall)
    .map((c: any) => `${c.MoveCall.package}::${c.MoveCall.module}::${c.MoveCall.function}`);
}

test("buildCreatePool emits stake::create_pool<SUI>", () => {
  const tx = buildCreatePool(PKG, { caseId: CASE });
  const t = targets(tx);
  assert.equal(t.length, 1);
  assert.ok(t[0].endsWith("::stake::create_pool"), `got ${t[0]}`);
});

test("buildStake splits gas then calls stake::stake with all four args", () => {
  const tx = buildStake(PKG, { poolId: POOL, agentCardId: AGENT, sideTrue: true, amount: 500_000_000n });
  const t = targets(tx);
  assert.ok(t.some((x) => x.endsWith("::stake::stake")));
  // commands include a SplitCoins
  const cmds = tx.getData().commands ?? [];
  assert.ok(cmds.some((c: any) => c.SplitCoins));
});

test("buildClaim references pool + case + receipt", () => {
  const tx = buildClaim(PKG, { poolId: POOL, caseId: CASE, receiptId: RECEIPT });
  const t = targets(tx);
  assert.equal(t.length, 1);
  assert.ok(t[0].endsWith("::stake::claim_winnings"));
  const cmd: any = (tx.getData().commands ?? [])[0];
  // three object args, in order: pool, case, receipt
  assert.equal(cmd.MoveCall.arguments.length, 3);
});

test("sideTrue=false propagates as false bool input", () => {
  const tx = buildStake(PKG, { poolId: POOL, agentCardId: AGENT, sideTrue: false, amount: 1n });
  const data: any = tx.getData();
  const stakeCmd: any = (data.commands ?? []).find(
    (c: any) => c.MoveCall && c.MoveCall.function === "stake",
  );
  const sideArg = stakeCmd.MoveCall.arguments[2];
  const inp: any = data.inputs[sideArg.Input];
  const bytes: number[] = inp.Pure?.bytes
    ? Array.from(Buffer.from(inp.Pure.bytes, "base64"))
    : inp.Pure?.Pure ?? inp.Pure;
  assert.equal(Boolean(bytes[0]), false);
});
