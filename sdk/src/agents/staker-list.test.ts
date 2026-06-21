// Run with: node --import tsx --test src/agents/staker-list.test.ts
//
// Mocks the smallest ClientLike surface to assert decoding of the v3 stake
// pool object shape. Covers both Sui RPC JSON dialects (boxed Option in
// fields.vec, and bare array form).

import { test } from "node:test";
import assert from "node:assert/strict";
import { readStakerList, type ClientLike } from "./staker-list.js";

const POOL = "0x" + "b".repeat(64);
const CASE = "0x" + "c".repeat(64);
const ADVOCATE_YES = "0xdefe29e208e5dcb9c26fbca7faedf1a6fb19b3bd66fb2b37cd23e522dc9538a0";
const ADVOCATE_NO  = "0x065cd2055c8dcea1362ace8efdefc69a59bfd82aea9b0221ae8c6d79a83cecdc";
const BACKER       = "0xbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeefbeef";

function makeClient(content: unknown): ClientLike {
  return {
    async getObject() {
      return { data: { content } };
    },
  };
}

test("readStakerList: decodes empty pool (pre-stake)", async () => {
  const client = makeClient({
    dataType: "moveObject",
    fields: {
      case_id: CASE,
      yes_total: "0",
      no_total: "0",
      yes_weighted_total: "0",
      no_weighted_total: "0",
      advocate_yes: null,
      advocate_no: null,
      stakes: [],
    },
  });
  const s = await readStakerList(client, POOL);
  assert.equal(s.caseId, CASE);
  assert.equal(s.advocateYesId, null);
  assert.equal(s.advocateNoId, null);
  assert.equal(s.stakers.length, 0);
  assert.equal(s.yesWeightedTotal, 0n);
});

test("readStakerList: decodes boxed Option form (fields.vec)", async () => {
  const client = makeClient({
    dataType: "moveObject",
    fields: {
      case_id: CASE,
      yes_total: "100",
      no_total: "100",
      yes_weighted_total: "300",
      no_weighted_total: "300",
      advocate_yes: { fields: { vec: [ADVOCATE_YES] } },
      advocate_no:  { fields: { vec: [ADVOCATE_NO]  } },
      stakes: [
        { fields: { agent_id: ADVOCATE_YES, side_true: true,  amount: "100", weight: "300", is_advocate: true  } },
        { fields: { agent_id: ADVOCATE_NO,  side_true: false, amount: "100", weight: "300", is_advocate: true  } },
      ],
    },
  });
  const s = await readStakerList(client, POOL);
  assert.equal(s.advocateYesId, ADVOCATE_YES);
  assert.equal(s.advocateNoId,  ADVOCATE_NO);
  assert.equal(s.yesWeightedTotal, 300n);
  assert.equal(s.stakers.length, 2);
  assert.equal(s.stakers[0].isAdvocate, true);
  assert.equal(s.stakers[0].weight, 300n);
});

test("readStakerList: decodes bare-array Option form", async () => {
  const client = makeClient({
    dataType: "moveObject",
    fields: {
      case_id: CASE,
      yes_total: "100",
      no_total: "0",
      yes_weighted_total: "300",
      no_weighted_total: "0",
      advocate_yes: [ADVOCATE_YES],
      advocate_no: [],
      stakes: [
        { agent_id: ADVOCATE_YES, side_true: true, amount: "100", weight: "300", is_advocate: true },
      ],
    },
  });
  const s = await readStakerList(client, POOL);
  assert.equal(s.advocateYesId, ADVOCATE_YES);
  assert.equal(s.advocateNoId, null);
  assert.equal(s.stakers.length, 1);
});

test("readStakerList: tags advocates and backers separately", async () => {
  // YES side: advocate stakes 100 (w=300), backer stakes 100 (w=100).
  const client = makeClient({
    dataType: "moveObject",
    fields: {
      case_id: CASE,
      yes_total: "200",
      no_total: "0",
      yes_weighted_total: "400",
      no_weighted_total: "0",
      advocate_yes: { fields: { vec: [ADVOCATE_YES] } },
      advocate_no:  { fields: { vec: [] } },
      stakes: [
        { fields: { agent_id: ADVOCATE_YES, side_true: true, amount: "100", weight: "300", is_advocate: true  } },
        { fields: { agent_id: BACKER,       side_true: true, amount: "100", weight: "100", is_advocate: false } },
      ],
    },
  });
  const s = await readStakerList(client, POOL);
  assert.equal(s.advocateYesId, ADVOCATE_YES);
  assert.equal(s.stakers.filter((x) => x.isAdvocate).length, 1);
  assert.equal(s.stakers.filter((x) => !x.isAdvocate).length, 1);
  assert.equal(s.stakers.find((x) => x.agentId === BACKER)!.weight, 100n);
  assert.equal(s.yesWeightedTotal, 400n);
});

test("readStakerList: throws on missing content", async () => {
  const client: ClientLike = { async getObject() { return { data: null }; } };
  await assert.rejects(() => readStakerList(client, POOL), /no parsed content/);
});

test("readStakerList: rejects non-moveObject payload", async () => {
  const client = makeClient({ dataType: "package" });
  await assert.rejects(() => readStakerList(client, POOL), /no parsed content/);
});
