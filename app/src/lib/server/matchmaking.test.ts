// Run with: node --import tsx --test src/lib/server/matchmaking.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { matchSides, conscript, type PoolAgent, type Stake } from "./matchmaking";

const A: PoolAgent = { agentId: "0xa", handle: "A", score: 100 };
const B: PoolAgent = { agentId: "0xb", handle: "B", score: 300 };
const C: PoolAgent = { agentId: "0xc", handle: "C", score: 200 };
const D: PoolAgent = { agentId: "0xd", handle: "D", score: 150 };

test("both sides staked: picks highest-score staker per side, no conscription", () => {
  const stakes: Stake[] = [
    { agent: A, side: "yes" },
    { agent: B, side: "yes" }, // higher score, should win YES
    { agent: C, side: "no" },
  ];
  const m = matchSides(stakes, []);
  assert.equal(m.affirmer.agentId, "0xb");
  assert.equal(m.denier.agentId, "0xc");
  assert.deepEqual(m.conscripted, []);
});

test("empty NO side: conscripts from pool", () => {
  const stakes: Stake[] = [{ agent: A, side: "yes" }];
  const pool = [C, D]; // candidates for the NO side
  const m = matchSides(stakes, pool, 7);
  assert.equal(m.affirmer.agentId, "0xa");
  assert.ok(["0xc", "0xd"].includes(m.denier.agentId));
  assert.deepEqual(m.conscripted, ["no"]);
});

test("no stakers at all: conscripts both sides distinctly", () => {
  const pool = [A, B, C, D];
  const m = matchSides([], pool, 3);
  assert.notEqual(m.affirmer.agentId, m.denier.agentId);
  assert.deepEqual(m.conscripted.sort(), ["no", "yes"]);
});

test("conscript excludes already-chosen agents", () => {
  const pool = [A, B];
  // YES staked by A, NO must conscript from pool excluding A -> must be B
  const m = matchSides([{ agent: A, side: "yes" }], pool, 1);
  assert.equal(m.denier.agentId, "0xb");
});

test("throws when a side cannot be filled", () => {
  // YES staked, NO empty, pool only contains the YES agent -> cannot fill NO
  assert.throws(() => matchSides([{ agent: A, side: "yes" }], [A]), /cannot fill NO/);
});

test("conscript is deterministic for a fixed seed", () => {
  const pool = [A, B, C, D];
  const first = conscript(pool, [], 42);
  const second = conscript(pool, [], 42);
  assert.equal(first?.agentId, second?.agentId);
});

test("conscript returns undefined when pool exhausted by exclusions", () => {
  const pool = [A, B];
  assert.equal(conscript(pool, ["0xa", "0xb"], 1), undefined);
});

test("conscript is reputation-weighted (higher score wins more often)", () => {
  const pool = [A, B]; // A=100, B=300 -> B should win ~75% of the time
  let bWins = 0;
  for (let seed = 0; seed < 400; seed++) {
    if (conscript(pool, [], seed)?.agentId === "0xb") bWins++;
  }
  // expect roughly 0.75; assert a loose band to avoid flakiness
  assert.ok(bWins > 240 && bWins < 360, `B won ${bWins}/400`);
});
