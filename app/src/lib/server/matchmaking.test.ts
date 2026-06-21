// Run with: node --import tsx --test src/lib/server/matchmaking.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  pickAdvocates,
  BothSidesMustStake,
  type PoolAgent,
  type Stake,
} from "./matchmaking";

const A: PoolAgent = { agentId: "0xa", handle: "A", score: 100, archetypeId: "pragmatist" };
const B: PoolAgent = { agentId: "0xb", handle: "B", score: 300, archetypeId: "textualist" };
const C: PoolAgent = { agentId: "0xc", handle: "C", score: 200, archetypeId: "intent-first" };
const D: PoolAgent = { agentId: "0xd", handle: "D", score: 150, archetypeId: "risk-hawk" };

test("first stakers are advocates regardless of score", () => {
  // A (score 100) staked YES first, B (score 300) staked NO first. Even
  // though B has more rep, the matchmaker uses the on-chain advocate slots,
  // not a top-by-score scan.
  const stakers: Stake[] = [
    { agent: A, side: "yes", amount: 100n, weight: 300n, isAdvocate: true },
    { agent: B, side: "no",  amount: 100n, weight: 300n, isAdvocate: true },
  ];
  const m = pickAdvocates("0xa", "0xb", stakers, [A, B, C, D]);
  assert.equal(m.affirmer.agentId, "0xa");
  assert.equal(m.denier.agentId, "0xb");
  assert.deepEqual(m.backers, { yes: [], no: [] });
});

test("backers on a side are listed but not advocates", () => {
  const stakers: Stake[] = [
    { agent: A, side: "yes", amount: 100n, weight: 300n, isAdvocate: true },   // YES advocate
    { agent: C, side: "yes", amount: 100n, weight: 100n, isAdvocate: false },  // YES backer
    { agent: B, side: "no",  amount: 100n, weight: 300n, isAdvocate: true },   // NO advocate
    { agent: D, side: "no",  amount: 100n, weight: 100n, isAdvocate: false },  // NO backer
  ];
  const m = pickAdvocates("0xa", "0xb", stakers, [A, B, C, D]);
  assert.equal(m.affirmer.agentId, "0xa");
  assert.equal(m.denier.agentId, "0xb");
  assert.equal(m.backers.yes.length, 1);
  assert.equal(m.backers.yes[0].agentId, "0xc");
  assert.equal(m.backers.no.length, 1);
  assert.equal(m.backers.no[0].agentId, "0xd");
});

test("BothSidesMustStake when YES side is unstaked", () => {
  const stakers: Stake[] = [
    { agent: B, side: "no", amount: 100n, weight: 300n, isAdvocate: true },
  ];
  try {
    pickAdvocates(null, "0xb", stakers, [A, B]);
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof BothSidesMustStake);
    assert.deepEqual((err as BothSidesMustStake).emptySides, ["yes"]);
  }
});

test("BothSidesMustStake when NO side is unstaked", () => {
  const stakers: Stake[] = [
    { agent: A, side: "yes", amount: 100n, weight: 300n, isAdvocate: true },
  ];
  try {
    pickAdvocates("0xa", null, stakers, [A, B]);
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof BothSidesMustStake);
    assert.deepEqual((err as BothSidesMustStake).emptySides, ["no"]);
  }
});

test("BothSidesMustStake lists every empty side", () => {
  try {
    pickAdvocates(null, null, [], [A, B]);
    assert.fail("should have thrown");
  } catch (err) {
    assert.ok(err instanceof BothSidesMustStake);
    assert.deepEqual((err as BothSidesMustStake).emptySides.sort(), ["no", "yes"]);
  }
});

test("throws when advocate id is missing from the agent pool", () => {
  // Pool doesn't include "0xa"; this is a chain-state-vs-cache inconsistency
  // and must surface, not silently match against undefined.
  assert.throws(
    () => pickAdvocates("0xa", "0xb", [], [B]),
    /advocate YES \(0xa\) not in agent pool/,
  );
});

test("throws when both advocate ids collapse to the same agent", () => {
  // Pathological case the on-chain anti-double-stake invariant should already
  // prevent. Still, the matchmaker refuses rather than producing a bogus debate.
  assert.throws(
    () => pickAdvocates("0xa", "0xa", [], [A]),
    /same agent/,
  );
});

test("ignores stakes whose agent id is not in the pool (silent drop)", () => {
  // If an AgentCard was burned/transferred after stake, the staker entry
  // can name an id the global pool no longer carries. Drop those backers
  // rather than reject the matchup.
  const stakers: Stake[] = [
    { agent: A, side: "yes", amount: 100n, weight: 300n, isAdvocate: true },
    { agent: { agentId: "0xZZZ", handle: "ghost", score: 0 }, side: "yes" },
    { agent: B, side: "no", amount: 100n, weight: 300n, isAdvocate: true },
  ];
  const m = pickAdvocates("0xa", "0xb", stakers, [A, B]);
  assert.equal(m.backers.yes.length, 0); // ghost dropped
});
