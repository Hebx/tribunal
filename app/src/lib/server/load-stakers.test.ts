// Run with: node --import tsx --test src/lib/server/load-stakers.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  findPoolForCase,
  readPoolState,
  loadStakersForCase,
} from "./load-stakers";
import type { PoolAgent } from "./matchmaking";

const PKG = "0x" + "1".repeat(64);
const CASE = "0x" + "c".repeat(64);
const POOL = "0x" + "b".repeat(64);
const A = "0x" + "a".repeat(64);
const B = "0x" + "d".repeat(64);
const C_BACKER = "0x" + "e".repeat(64);

const POOL_OBJ_V3 = {
  dataType: "moveObject",
  fields: {
    case_id: CASE,
    yes_total: "10000000",
    no_total: "5000000",
    yes_weighted_total: "30000000",
    no_weighted_total: "15000000",
    advocate_yes: A,
    advocate_no: B,
    stakes: [
      { fields: { agent_id: A, side_true: true,  amount: "10000000", weight: "30000000", is_advocate: true  } },
      { fields: { agent_id: B, side_true: false, amount: "5000000",  weight: "15000000", is_advocate: true  } },
      { fields: { agent_id: C_BACKER, side_true: true, amount: "1000000", weight: "1000000", is_advocate: false } },
    ],
  },
};

function makeClient(opts: {
  events?: Array<{ pool_id?: string; case_id?: string }>;
  pool?: any;
}) {
  return {
    async queryEvents(_q: any) {
      return {
        data: (opts.events ?? []).map((p) => ({ parsedJson: p })),
        hasNextPage: false,
        nextCursor: null,
      };
    },
    async getObject(_q: any) {
      return { data: { content: opts.pool ?? null } };
    },
  } as any;
}

// === findPoolForCase ===

test("findPoolForCase: returns matching pool id", async () => {
  const c = makeClient({
    events: [
      { pool_id: "0xabc", case_id: "0xdead" },
      { pool_id: POOL, case_id: CASE },
    ],
  });
  const got = await findPoolForCase(c, CASE, PKG);
  assert.equal(got, POOL);
});

test("findPoolForCase: returns null when no event matches", async () => {
  const c = makeClient({ events: [{ pool_id: "0xabc", case_id: "0xdead" }] });
  assert.equal(await findPoolForCase(c, CASE, PKG), null);
});

test("findPoolForCase: returns null on no events at all", async () => {
  const c = makeClient({ events: [] });
  assert.equal(await findPoolForCase(c, CASE, PKG), null);
});

// === readPoolState ===

test("readPoolState: decodes v3 pool — both advocates set, mixed dialects", async () => {
  const c = makeClient({ pool: POOL_OBJ_V3 });
  const s = await readPoolState(c, POOL);
  assert.equal(s.advocateYesId, A);
  assert.equal(s.advocateNoId,  B);
  assert.equal(s.yesTotal, 10_000_000n);
  assert.equal(s.yesWeightedTotal, 30_000_000n);
  assert.equal(s.stakers.length, 3);
  assert.equal(s.stakers[2].isAdvocate, false);
});

test("readPoolState: rejects pre-v3 pool with a clear error", async () => {
  const c = makeClient({
    pool: {
      dataType: "moveObject",
      fields: {
        case_id: CASE,
        yes_total: "100",
        no_total: "0",
        staked_agents: [A],
        // no advocate_yes, no yes_weighted_total
      },
    },
  });
  await assert.rejects(
    () => readPoolState(c, POOL),
    /pre-v3/,
  );
});

test("readPoolState: throws on missing pool content", async () => {
  const c = makeClient({ pool: null });
  await assert.rejects(() => readPoolState(c, POOL), /no parsed content/);
});

test("readPoolState: handles bare-array advocate_yes (alternate dialect)", async () => {
  const c = makeClient({
    pool: {
      dataType: "moveObject",
      fields: { ...POOL_OBJ_V3.fields, advocate_yes: [A], advocate_no: [] },
    },
  });
  const s = await readPoolState(c, POOL);
  assert.equal(s.advocateYesId, A);
  assert.equal(s.advocateNoId, null);
});

test("readPoolState: handles boxed-Option advocate (older dialect)", async () => {
  const c = makeClient({
    pool: {
      dataType: "moveObject",
      fields: {
        ...POOL_OBJ_V3.fields,
        advocate_yes: { fields: { vec: [A] } },
        advocate_no:  { fields: { vec: [] } },
      },
    },
  });
  const s = await readPoolState(c, POOL);
  assert.equal(s.advocateYesId, A);
  assert.equal(s.advocateNoId, null);
});

// === loadStakersForCase ===

test("loadStakersForCase: returns null when no pool exists for the case", async () => {
  const c = makeClient({ events: [] });
  const got = await loadStakersForCase(CASE, [], { client: c, pkgId: PKG });
  assert.equal(got, null);
});

test("loadStakersForCase: enriches stakers from agent pool", async () => {
  const agents: PoolAgent[] = [
    { agentId: A, handle: "Pragmatist", score: 120, archetypeId: "pragmatist" },
    { agentId: B, handle: "Textualist", score: 100, archetypeId: "textualist" },
    { agentId: C_BACKER, handle: "Backer", score: 90, archetypeId: "intent-first" },
  ];
  const c = makeClient({
    events: [{ pool_id: POOL, case_id: CASE }],
    pool: POOL_OBJ_V3,
  });
  const s = await loadStakersForCase(CASE, agents, { client: c, pkgId: PKG });
  assert.ok(s);
  assert.equal(s!.advocateYesId, A);
  assert.equal(s!.stakers.length, 3);
  assert.equal(s!.stakers[0].agent.handle, "Pragmatist");
  assert.equal(s!.stakers[0].weight, 30_000_000n);
  assert.equal(s!.stakers[2].agent.handle, "Backer");
  assert.equal(s!.stakers[2].isAdvocate, false);
});

test("loadStakersForCase: tolerates stakers not in the agent pool", async () => {
  // Agent pool only has A. The pool object includes B + C_BACKER as stakers
  // — loadStakersForCase must placeholder them rather than throw, since
  // pickAdvocates is the layer that decides whether the matchup is valid.
  const agents: PoolAgent[] = [
    { agentId: A, handle: "A", score: 100, archetypeId: "pragmatist" },
  ];
  const c = makeClient({
    events: [{ pool_id: POOL, case_id: CASE }],
    pool: POOL_OBJ_V3,
  });
  const s = await loadStakersForCase(CASE, agents, { client: c, pkgId: PKG });
  assert.ok(s);
  assert.equal(s!.stakers.length, 3);
  // The B + C_BACKER entries fall through to placeholders (score 0, archetype undefined).
  const placeholders = s!.stakers.filter((x) => x.agent.score === 0);
  assert.equal(placeholders.length, 2);
});
