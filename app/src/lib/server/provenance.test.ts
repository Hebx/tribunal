// Run with: node --import tsx --test src/lib/server/provenance.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildProvenance } from "./provenance";
import type { LoadedStake } from "./load-stakers";
import type { AssembledCase, AssembledAgent } from "./assemble-case";
import type { JuryPick } from "./select-jury";
import type { Stake, PoolAgent } from "./matchmaking";

const POOL_AGENT = (id: string, archetypeId: string, score: number): PoolAgent => ({
  agentId: id,
  handle: id.slice(0, 6),
  score,
  archetypeId,
});

const STAKE = (
  agent: PoolAgent,
  side: "yes" | "no",
  amount: bigint,
  weight: bigint,
  isAdvocate: boolean,
): Stake => ({ agent, side, amount, weight, isAdvocate });

const AGENT_PRAG = POOL_AGENT("0xaff", "pragmatist", 14);
const AGENT_TEXT = POOL_AGENT("0xden", "textualist", 9);
const AGENT_BACK = POOL_AGENT("0xbk1", "contextualist", 4);
const AGENT_JR1 = POOL_AGENT("0xj1", "risk-hawk", 31);
const AGENT_JR2 = POOL_AGENT("0xj2", "ethicist", 12);
const AGENT_JR3 = POOL_AGENT("0xj3", "intent-first", 7);

const LOADED: LoadedStake = {
  poolId: "0xpool",
  caseId: "0xcase",
  advocateYesId: "0xaff",
  advocateNoId: "0xden",
  yesTotal: 200n,
  noTotal: 100n,
  yesWeightedTotal: 400n,
  noWeightedTotal: 300n,
  stakers: [
    STAKE(AGENT_PRAG, "yes", 100n, 300n, true),
    STAKE(AGENT_BACK, "yes", 100n, 100n, false),
    STAKE(AGENT_TEXT, "no", 100n, 300n, true),
  ],
};

const ASSEMBLED_AGENT = (a: PoolAgent): AssembledAgent => ({
  agentId: a.agentId,
  handle: a.handle,
  archetypeId: a.archetypeId!,
  // Stable, valid-hex persona hash for fixture use. Real personaHashes are
  // produced by composePersona — those are real sha256.
  personaHash: a.agentId.slice(2).replace(/[^0-9a-f]/g, "a").padEnd(64, "f"),
  systemPrompt: `prompt-${a.handle}`,
});

const ASSEMBLED: AssembledCase = {
  agents: {
    affirmer: { handle: AGENT_PRAG.handle, systemPrompt: "p" },
    denier: { handle: AGENT_TEXT.handle, systemPrompt: "p" },
    jurors: [
      { handle: AGENT_JR1.handle, systemPrompt: "p" },
      { handle: AGENT_JR2.handle, systemPrompt: "p" },
      { handle: AGENT_JR3.handle, systemPrompt: "p" },
    ],
  },
  affirmer: ASSEMBLED_AGENT(AGENT_PRAG),
  denier: ASSEMBLED_AGENT(AGENT_TEXT),
  jurors: [AGENT_JR1, AGENT_JR2, AGENT_JR3].map(ASSEMBLED_AGENT),
};

const JURY: JuryPick = {
  jurors: [AGENT_JR1, AGENT_JR2, AGENT_JR3],
  fallbackUsed: false,
  seed: "0xdeadbeef",
};

const COMMON = {
  caseId: "0xcase",
  loaded: LOADED,
  assembled: ASSEMBLED,
  jurySelection: JURY,
  models: { advocate: "haiku", jury: "sonnet", guardrail: "opus" },
  configHashes: { resolver: "r".repeat(64), guardrail: "g".repeat(64) },
  gateway: { base: "https://gw.test/v1", temperatures: { advocate: 0.4, jury: 0.3, guardrail: 0 } },
  decidedAt: 1750000000000,
  resolverCommit: "abc1234",
};

test("buildProvenance carries every field the audit trail needs", () => {
  const p = buildProvenance(COMMON);
  assert.equal(p.caseId, "0xcase");
  assert.equal(p.poolId, "0xpool");
  assert.equal(p.decidedAt, 1750000000000);
  assert.equal(p.resolverCommit, "abc1234");
  assert.equal(p.models.advocate, "haiku");
  assert.equal(p.configHashes.guardrail.length, 64);
  assert.equal(p.gateway.base, "https://gw.test/v1");
  assert.equal(p.gateway.temperatures.guardrail, 0);
});

test("advocate rows pin the first-staker flag + carry archetype/personaHash/weight", () => {
  const p = buildProvenance(COMMON);
  assert.equal(p.advocates.affirmer.agentCardId, "0xaff");
  assert.equal(p.advocates.affirmer.archetypeId, "pragmatist");
  assert.equal(p.advocates.affirmer.isFirstStaker, true);
  assert.equal(p.advocates.affirmer.score, 14);
  assert.equal(p.advocates.affirmer.amount, "100");
  assert.equal(p.advocates.affirmer.weight, "300");
  assert.match(p.advocates.affirmer.personaHash, /^[0-9a-f]{64}$/);

  assert.equal(p.advocates.denier.agentCardId, "0xden");
  assert.equal(p.advocates.denier.weight, "300");
});

test("backer rows include only non-advocate stakers, with amount + weight", () => {
  const p = buildProvenance(COMMON);
  assert.equal(p.backers.yes.length, 1);
  assert.equal(p.backers.yes[0].agentCardId, "0xbk1");
  assert.equal(p.backers.yes[0].amount, "100");
  assert.equal(p.backers.yes[0].weight, "100");
  assert.equal(p.backers.no.length, 0);
});

test("juror rows preserve archetype + personaHash for the 3-juror panel", () => {
  const p = buildProvenance(COMMON);
  assert.equal(p.jurors.length, 3);
  const ids = p.jurors.map((j) => j.agentCardId);
  assert.deepEqual(ids, ["0xj1", "0xj2", "0xj3"]);
  assert.equal(p.jurors[0].archetypeId, "risk-hawk");
  for (const j of p.jurors) assert.match(j.personaHash, /^[0-9a-f]{64}$/);
});

test("jury seed + fallback flag are recorded so determinism is reproducible", () => {
  const p = buildProvenance(COMMON);
  assert.equal(p.jurySelection.seed, "0xdeadbeef");
  assert.equal(p.jurySelection.fallbackUsed, false);

  const fallbackJury = { ...JURY, fallbackUsed: true };
  const p2 = buildProvenance({ ...COMMON, jurySelection: fallbackJury });
  assert.equal(p2.jurySelection.fallbackUsed, true);
});

test("temperatures default to the resolver defaults when not supplied", () => {
  const p = buildProvenance({
    ...COMMON,
    gateway: { base: "https://gw.test/v1", temperatures: {} },
  });
  assert.equal(p.gateway.temperatures.advocate, 0.4);
  assert.equal(p.gateway.temperatures.jury, 0.3);
  assert.equal(p.gateway.temperatures.guardrail, 0);
});

test("resolverCommit defaults to empty string when not supplied", () => {
  const { resolverCommit, ...rest } = COMMON;
  void resolverCommit;
  const p = buildProvenance(rest);
  assert.equal(p.resolverCommit, "");
});

test("throws when an advocate has no matching stake row (invariant break)", () => {
  const corrupt: LoadedStake = {
    ...LOADED,
    stakers: LOADED.stakers.filter((s) => s.agent.agentId !== "0xaff"),
  };
  assert.throws(
    () => buildProvenance({ ...COMMON, loaded: corrupt }),
    /advocate .*missing from stakers/,
  );
});
