// Run with: node --import tsx --test src/lib/server/resolve.test.ts
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolveCase, resolverConfigHash, type ResolveAgents } from "./resolve";
import type { CaseInput } from "./debate";

const CASE: CaseInput = {
  question: "Did the grantee meet Milestone 2?",
  criteria: "Deliverable must match the written spec.",
  evidence: "The deliverable shipped at ~80% of the spec.",
};

const AGENTS: ResolveAgents = {
  affirmer: { handle: "Adv-Yes", systemPrompt: "You are Pragmatist." },
  denier: { handle: "Adv-No", systemPrompt: "You are Textualist." },
  jurors: [
    { handle: "Juror-1", systemPrompt: "You are Textualist." },
    { handle: "Juror-2", systemPrompt: "You are Pragmatist." },
    { handle: "Juror-3", systemPrompt: "You are Ethicist." },
  ],
};

process.env.KIRO_GATEWAY_API_KEY = "test-key";

let calls = 0;

// Branch the mock on the role implied by the system prompt so every layer
// (advocate / juror / guardrail) gets a shape it can parse.
function mockFetch() {
  return async (_url: string, init: any) => {
    calls++;
    const body = JSON.parse(init.body);
    const sys = body.messages.find((m: any) => m.role === "system").content;
    let payload: any;
    if (/ADVOCATE/.test(sys)) {
      payload = { claim: "c", reasoning: "r", rebuttal: "" };
    } else if (/binding judge/.test(sys)) {
      payload = { finalOutcome: true, ratifiedJury: true, overrideReason: "", biasFlags: [], confidence: 0.8, reasoning: "sound", personaTrapsRejected: [] };
    } else {
      // juror — Textualist votes NO, others YES → a real split
      const v = /Textualist/.test(sys) ? false : true;
      payload = { vote: v, confidence: 0.7, rationale: "rt" };
    }
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }), text: async () => "" } as any;
  };
}

const origFetch = globalThis.fetch;
beforeEach(() => {
  calls = 0;
});
afterEach(() => {
  globalThis.fetch = origFetch;
});

test("resolveCase produces a complete verdict bundle", async () => {
  globalThis.fetch = mockFetch() as any;
  const b = await resolveCase(CASE, AGENTS, { rounds: 2 });

  // debate ran (2 rounds, both sides)
  assert.equal(b.debate.rounds.length, 2);
  // jury ran (3 jurors, first pass + final)
  assert.equal(b.jury.firstPass.length, 3);
  assert.equal(b.jury.finalVotes.length, 3);
  // the panel actually split (Textualist NO vs 2 YES)
  assert.equal(b.jury.dissent, true);
  assert.ok(b.jury.disagreementRate > 0);
  // guardrail issued a binding verdict
  assert.equal(typeof b.guardrail.finalOutcome, "boolean");
  // bundle carries the binding outcome + a config hash anchor
  assert.equal(b.finalOutcome, b.guardrail.finalOutcome);
  assert.match(b.configHashHex, /^[0-9a-f]{64}$/);
});

test("resolveCase finalOutcome follows the guardrail, not the jury", async () => {
  // guardrail overrides to NO even though jury would be YES
  globalThis.fetch = (async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    const sys = body.messages.find((m: any) => m.role === "system").content;
    let payload: any;
    if (/ADVOCATE/.test(sys)) payload = { claim: "c", reasoning: "r", rebuttal: "" };
    else if (/binding judge/.test(sys))
      payload = { finalOutcome: false, ratifiedJury: false, overrideReason: "criteria require exact match", biasFlags: ["verbosity"], confidence: 0.7, reasoning: "override", personaTrapsRejected: ["rhetoric: emotional framing"] };
    else payload = { vote: true, confidence: 0.8, rationale: "yes" };
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(payload) } }] }), text: async () => "" } as any;
  }) as any;

  const b = await resolveCase(CASE, AGENTS, { rounds: 1 });
  assert.equal(b.jury.outcome, true); // jury said YES
  assert.equal(b.guardrail.ratifiedJury, false);
  assert.equal(b.finalOutcome, false); // bundle follows the guardrail
  assert.ok(b.guardrail.overrideReason.length > 0);
});

test("resolverConfigHash is stable for the same config and changes with the model map", () => {
  const a = resolverConfigHash("m-adv", "m-jury", "m-guard");
  const b = resolverConfigHash("m-adv", "m-jury", "m-guard");
  const c = resolverConfigHash("m-adv", "m-jury", "m-guard-2");
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^[0-9a-f]{64}$/);
});
