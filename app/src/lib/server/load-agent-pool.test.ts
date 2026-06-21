// Run with: node --import tsx --test src/lib/server/load-agent-pool.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { agentRowToPoolAgent } from "./load-agent-pool";
import type { AgentRow } from "./agents";

const ROW: AgentRow = {
  cardId: "0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
  owner: "0x36939a",
  archetypeId: "pragmatist",
  personaHash: "deadbeef",
  createdAtEpoch: 12345,
  score: 130,
  wins: 2,
  losses: 1,
  overturned: 0,
  currentStreak: 1,
  hasOutcome: true,
  explorerUrl: "https://suiscan.xyz/testnet/object/0xabc",
};

test("agentRowToPoolAgent: maps cardId, score, archetype", () => {
  const a = agentRowToPoolAgent(ROW);
  assert.equal(a.agentId, ROW.cardId);
  assert.equal(a.score, 130);
  assert.equal(a.archetypeId, "pragmatist");
});

test("agentRowToPoolAgent: derives a stable handle from archetype + id suffix", () => {
  const a = agentRowToPoolAgent(ROW);
  assert.match(a.handle, /^Pragmatist [a-f0-9]{6}$/);
});

test("agentRowToPoolAgent: handles row with empty archetype", () => {
  const a = agentRowToPoolAgent({ ...ROW, archetypeId: "" });
  assert.equal(a.archetypeId, "");
  // Falls back to "Agent" prefix when archetype is missing.
  assert.match(a.handle, /^Agent [a-f0-9]{6}$/);
});

test("agentRowToPoolAgent: zero-score row still maps cleanly", () => {
  const a = agentRowToPoolAgent({ ...ROW, score: 0 });
  assert.equal(a.score, 0);
});
