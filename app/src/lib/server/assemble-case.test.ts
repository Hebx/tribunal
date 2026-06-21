// Run with: node --import tsx --test src/lib/server/assemble-case.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleCaseAgents, MissingArchetypeError } from "./assemble-case";
import type { PoolAgent, Matchup } from "./matchmaking";
import type { JuryPick } from "./select-jury";

const A = (id: string, archetypeId: string | undefined, handle = id): PoolAgent => ({
  agentId: id,
  handle,
  score: 0,
  archetypeId,
});

const MATCHUP: Matchup = {
  affirmer: A("0xaff", "pragmatist", "Aff"),
  denier: A("0xden", "textualist", "Den"),
  backers: { yes: [], no: [] },
};

const JURY: JuryPick = {
  jurors: [
    A("0xj1", "risk-hawk", "J1"),
    A("0xj2", "ethicist", "J2"),
    A("0xj3", "intent-first", "J3"),
  ],
  fallbackUsed: false,
  seed: "0xdeadbeef",
};

test("assembleCaseAgents produces 2 advocates + 3 jurors with composed prompts", () => {
  const out = assembleCaseAgents(MATCHUP, JURY);
  // advocates
  assert.equal(out.agents.affirmer.handle, "Aff");
  assert.equal(out.agents.denier.handle, "Den");
  // both prompts include the archetype lens
  assert.match(out.agents.affirmer.systemPrompt, /Pragmatist/i);
  assert.match(out.agents.denier.systemPrompt, /Textualist/i);
  // jurors
  assert.equal(out.agents.jurors.length, 3);
  assert.match(out.agents.jurors[0].systemPrompt, /Risk-Hawk/i);
  assert.match(out.agents.jurors[1].systemPrompt, /Ethicist/i);
  assert.match(out.agents.jurors[2].systemPrompt, /Intent-First/i);
});

test("assembleCaseAgents records per-agent persona metadata for provenance", () => {
  const out = assembleCaseAgents(MATCHUP, JURY);
  assert.equal(out.affirmer.agentId, "0xaff");
  assert.equal(out.affirmer.archetypeId, "pragmatist");
  assert.match(out.affirmer.personaHash, /^[0-9a-f]{64}$/);
  assert.equal(out.denier.agentId, "0xden");
  assert.equal(out.denier.archetypeId, "textualist");
  assert.equal(out.jurors.length, 3);
  for (const j of out.jurors) {
    assert.ok(j.agentId.startsWith("0x"));
    assert.match(j.personaHash, /^[0-9a-f]{64}$/);
  }
});

test("identical inputs produce identical persona hashes (reproducibility)", () => {
  const a = assembleCaseAgents(MATCHUP, JURY);
  const b = assembleCaseAgents(MATCHUP, JURY);
  assert.equal(a.affirmer.personaHash, b.affirmer.personaHash);
  assert.equal(a.denier.personaHash, b.denier.personaHash);
  assert.deepEqual(
    a.jurors.map((j) => j.personaHash),
    b.jurors.map((j) => j.personaHash),
  );
});

test("throws MissingArchetypeError when an advocate has no archetype_id", () => {
  const m: Matchup = { ...MATCHUP, affirmer: A("0xbroken", undefined, "Broken") };
  assert.throws(() => assembleCaseAgents(m, JURY), (e: unknown) => {
    assert.ok(e instanceof MissingArchetypeError);
    assert.equal((e as MissingArchetypeError).role, "affirmer");
    return true;
  });
});

test("throws MissingArchetypeError when a juror has no archetype_id", () => {
  const j: JuryPick = {
    ...JURY,
    jurors: [JURY.jurors[0], A("0xbad", undefined, "Bad"), JURY.jurors[2]],
  };
  assert.throws(() => assembleCaseAgents(MATCHUP, j), (e: unknown) => {
    assert.ok(e instanceof MissingArchetypeError);
    assert.equal((e as MissingArchetypeError).role, "juror");
    return true;
  });
});

test("throws when archetype_id is set but unknown", () => {
  const m: Matchup = { ...MATCHUP, affirmer: A("0xbogus", "made-up-archetype", "Bog") };
  assert.throws(() => assembleCaseAgents(m, JURY), /unknown archetype/);
});
