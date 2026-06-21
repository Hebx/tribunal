// Run with: node --import tsx --test src/lib/server/guardrail.test.ts
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { guardrailRule } from "./guardrail";
import type { CaseInput, DebateResult } from "./debate";
import type { JuryResult } from "./jury";

const CASE: CaseInput = {
  question: "Did the grantee meet Milestone 2?",
  criteria: "Deliverable must match the written spec.",
  evidence: "The deliverable shipped at ~80% of the spec.",
};

const DEBATE: DebateResult = {
  case: CASE,
  rounds: [
    {
      round: 1,
      arguments: [
        { side: "yes", handle: "A", claim: "Met.", reasoning: "80% works.", rebuttal: "" },
        { side: "no", handle: "B", claim: "Not met.", reasoning: "Spec not matched.", rebuttal: "" },
      ],
    },
  ],
};

function jury(outcome: boolean, dr: number): JuryResult {
  return {
    firstPass: [],
    finalVotes: [
      { handle: "j1", vote: outcome, confidence: 0.7, rationale: "r1" },
      { handle: "j2", vote: outcome, confidence: 0.6, rationale: "r2" },
      { handle: "j3", vote: !outcome, confidence: 0.8, rationale: "r3" },
    ],
    outcome,
    votesTrue: outcome ? 2 : 1,
    votesFalse: outcome ? 1 : 2,
    abstain: 0,
    dissent: dr > 0,
    disagreementRate: dr,
  };
}

process.env.KIRO_GATEWAY_API_KEY = "test-key";

let lastBodies: any[] = [];
function mockFetch(responder: (body: any) => any) {
  return async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    lastBodies.push(body);
    const content = JSON.stringify(responder(body));
    return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }), text: async () => "" } as any;
  };
}

const origFetch = globalThis.fetch;
beforeEach(() => {
  lastBodies = [];
});
afterEach(() => {
  globalThis.fetch = origFetch;
});

test("guardrail ratifies the jury when it agrees", async () => {
  globalThis.fetch = mockFetch(() => ({
    finalOutcome: true,
    ratifiedJury: true,
    overrideReason: "",
    biasFlags: [],
    confidence: 0.8,
    reasoning: "Jury applied the criteria correctly.",
  })) as any;

  const r = await guardrailRule(CASE, DEBATE, jury(true, 1 / 3));
  assert.equal(r.finalOutcome, true);
  assert.equal(r.ratifiedJury, true);
  assert.equal(r.overrideReason, "");
});

test("guardrail uses the opus model", async () => {
  globalThis.fetch = mockFetch(() => ({ finalOutcome: true, ratifiedJury: true, overrideReason: "", biasFlags: [], confidence: 0.5, reasoning: "ok" })) as any;
  await guardrailRule(CASE, DEBATE, jury(true, 0));
  assert.match(lastBodies[0].model, /opus/);
});

test("guardrail can override the jury majority and records a reason", async () => {
  // jury said true; guardrail overturns to false
  globalThis.fetch = mockFetch(() => ({
    finalOutcome: false,
    ratifiedJury: false,
    overrideReason: "Jury anchored on the verbose YES advocate; criteria require an exact spec match.",
    biasFlags: ["verbosity", "anchoring"],
    confidence: 0.75,
    reasoning: "Overriding on procedural grounds.",
  })) as any;

  const r = await guardrailRule(CASE, DEBATE, jury(true, 1 / 3));
  assert.equal(r.finalOutcome, false);
  assert.equal(r.ratifiedJury, false);
  assert.ok(r.overrideReason.length > 0, "override must record a reason");
  assert.deepEqual(r.biasFlags.sort(), ["anchoring", "verbosity"]);
});

test("guardrail forces a reason when it overrides but the model omitted one", async () => {
  // model contradicts itself: ratifiedJury=false but no reason → we must synthesize/guard
  globalThis.fetch = mockFetch(() => ({
    finalOutcome: false,
    ratifiedJury: false,
    overrideReason: "",
    biasFlags: [],
    confidence: 0.6,
    reasoning: "",
  })) as any;

  const r = await guardrailRule(CASE, DEBATE, jury(true, 0));
  assert.equal(r.ratifiedJury, false);
  assert.ok(r.overrideReason.length > 0, "an override with no reason must be backfilled, never empty");
});

test("guardrail prompt includes the jury outcome, dissent, and disagreement rate", async () => {
  globalThis.fetch = mockFetch(() => ({ finalOutcome: true, ratifiedJury: true, overrideReason: "", biasFlags: [], confidence: 0.5, reasoning: "ok" })) as any;
  await guardrailRule(CASE, DEBATE, jury(true, 1 / 3));
  const user = lastBodies[0].messages.find((m: any) => m.role === "user").content;
  assert.match(user, /disagreement/i);
  assert.match(user, /YES|TRUE/);
});
