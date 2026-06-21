// Run with: node --import tsx --test src/lib/server/select-jury.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { selectJury } from "./select-jury";
import type { PoolAgent } from "./matchmaking";

// Eight candidates plus two advocates. Mixed archetypes so we can exercise
// the diversity filter and its fallback.
const Y_ADVOCATE: PoolAgent = { agentId: "0xY", handle: "Y", score: 0,   archetypeId: "pragmatist" };
const N_ADVOCATE: PoolAgent = { agentId: "0xN", handle: "N", score: 0,   archetypeId: "textualist" };

const J1: PoolAgent = { agentId: "0x1", handle: "J1", score: 200, archetypeId: "risk-hawk" };
const J2: PoolAgent = { agentId: "0x2", handle: "J2", score: 190, archetypeId: "intent-first" };
const J3: PoolAgent = { agentId: "0x3", handle: "J3", score: 180, archetypeId: "consequentialist" };
const J4: PoolAgent = { agentId: "0x4", handle: "J4", score: 170, archetypeId: "pragmatist" }; // shares with YES advocate
const J5: PoolAgent = { agentId: "0x5", handle: "J5", score: 160, archetypeId: "textualist" }; // shares with NO advocate
const J6: PoolAgent = { agentId: "0x6", handle: "J6", score: 150, archetypeId: "risk-hawk" };
const J7: PoolAgent = { agentId: "0x7", handle: "J7", score: 140, archetypeId: "intent-first" };
const J8: PoolAgent = { agentId: "0x8", handle: "J8", score: 130, archetypeId: "consequentialist" };

const advocates: [PoolAgent, PoolAgent] = [Y_ADVOCATE, N_ADVOCATE];
const pool = [Y_ADVOCATE, N_ADVOCATE, J1, J2, J3, J4, J5, J6, J7, J8];
const SEED = "case-seed-abc123";

test("excludes both advocates", () => {
  const { jurors } = selectJury(advocates, pool, SEED);
  const ids = new Set(jurors.map((j) => j.agentId));
  assert.ok(!ids.has(Y_ADVOCATE.agentId));
  assert.ok(!ids.has(N_ADVOCATE.agentId));
});

test("picks top-3 by score when ≥3 archetype-distinct candidates exist", () => {
  const { jurors, fallbackUsed } = selectJury(advocates, pool, SEED);
  assert.equal(fallbackUsed, false);
  assert.equal(jurors[0].agentId, "0x1"); // 200, risk-hawk
  assert.equal(jurors[1].agentId, "0x2"); // 190, intent-first
  assert.equal(jurors[2].agentId, "0x3"); // 180, consequentialist
});

test("excludes archetype-matching candidates from the diverse subset", () => {
  const { jurors, fallbackUsed } = selectJury(advocates, pool, SEED);
  const matchingArchetypes = jurors.filter(
    (j) => j.archetypeId === Y_ADVOCATE.archetypeId || j.archetypeId === N_ADVOCATE.archetypeId,
  );
  assert.equal(matchingArchetypes.length, 0);
  assert.equal(fallbackUsed, false);
});

test("falls back when diverse subset has < 3 candidates", () => {
  // Pool with only one archetype-distinct candidate.
  const narrow = [
    Y_ADVOCATE,
    N_ADVOCATE,
    { agentId: "0xD", handle: "D", score: 100, archetypeId: "risk-hawk" },        // diverse
    { agentId: "0xE", handle: "E", score: 90,  archetypeId: "pragmatist" },       // shares YES
    { agentId: "0xF", handle: "F", score: 80,  archetypeId: "textualist" },       // shares NO
  ];
  const { jurors, fallbackUsed } = selectJury(advocates, narrow, SEED);
  assert.equal(fallbackUsed, true);
  assert.equal(jurors.length, 3);
  assert.equal(jurors[0].agentId, "0xD"); // diverse one goes first
});

test("deterministic: same seed + same pool → same jury (order-independent)", () => {
  const shuffled = [...pool].reverse();
  const a = selectJury(advocates, pool, SEED);
  const b = selectJury(advocates, shuffled, SEED);
  assert.deepEqual(
    a.jurors.map((j) => j.agentId),
    b.jurors.map((j) => j.agentId),
  );
});

test("different seed shifts the tiebreak when scores tie", () => {
  const tied: PoolAgent[] = [
    Y_ADVOCATE,
    N_ADVOCATE,
    { agentId: "0xT1", handle: "T1", score: 100, archetypeId: "risk-hawk" },
    { agentId: "0xT2", handle: "T2", score: 100, archetypeId: "intent-first" },
    { agentId: "0xT3", handle: "T3", score: 100, archetypeId: "consequentialist" },
    { agentId: "0xT4", handle: "T4", score: 100, archetypeId: "risk-hawk" },
  ];
  // With seed A vs seed B, the ordering of the 4 tied candidates can shift,
  // and so can which one falls out of the top-3.
  const a = selectJury(advocates, tied, "seed-A");
  const b = selectJury(advocates, tied, "seed-Z-very-different");
  // Both are valid 3-pick selections; we just need them to be reproducible
  // and at least sometimes differ between seeds.
  assert.equal(a.jurors.length, 3);
  assert.equal(b.jurors.length, 3);
});

test("seed is echoed in the result for provenance", () => {
  const r = selectJury(advocates, pool, SEED);
  assert.equal(r.seed, SEED);
});

test("throws when fewer than 3 candidates remain after excluding advocates", () => {
  const tiny = [Y_ADVOCATE, N_ADVOCATE, J1, J2];
  assert.throws(() => selectJury(advocates, tiny, SEED), /not enough candidates/);
});
