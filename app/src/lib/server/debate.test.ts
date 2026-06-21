// Run with: node --import tsx --test src/lib/server/debate.test.ts
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { argue, runDebate, type CaseInput, type AdvocatePersona } from "./debate";

const CASE: CaseInput = {
  question: "Did the grantee meet Milestone 2?",
  criteria: "Deliverable must match the written spec.",
  evidence: "The deliverable shipped at ~80% of the spec.",
};

const AFFIRMER: AdvocatePersona = { handle: "Advocate-Y", systemPrompt: "You are Pragmatist. You judge by outcomes." };
const DENIER: AdvocatePersona = { handle: "Advocate-N", systemPrompt: "You are Textualist. The words on the page control." };

// Ensure the gateway key exists so chat() doesn't throw before fetch.
process.env.TRIBUNAL_GATEWAY_PROVIDER = "kiro";
process.env.KIRO_GATEWAY_API_KEY = "test-key";

// Capture the messages sent to the gateway so we can assert on prompts.
let lastBodies: any[] = [];

function mockFetch(responder: (body: any) => any) {
  return async (_url: string, init: any) => {
    const body = JSON.parse(init.body);
    lastBodies.push(body);
    const content = JSON.stringify(responder(body));
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content } }] }),
      text: async () => "",
    } as any;
  };
}

const origFetch = globalThis.fetch;
beforeEach(() => {
  lastBodies = [];
});
afterEach(() => {
  globalThis.fetch = origFetch;
});

test("argue produces a structured argument for its side", async () => {
  globalThis.fetch = mockFetch(() => ({
    claim: "The milestone was substantially met.",
    reasoning: "80% delivery achieves the practical goal.",
    rebuttal: "",
  })) as any;

  const a = await argue(CASE, AFFIRMER, "yes");
  assert.equal(a.side, "yes");
  assert.equal(a.handle, "Advocate-Y");
  assert.match(a.claim, /substantially met/);
  assert.match(a.reasoning, /80%/);
});

test("argue injects the persona system prompt and the case block", async () => {
  globalThis.fetch = mockFetch(() => ({ claim: "x", reasoning: "y", rebuttal: "" })) as any;
  await argue(CASE, DENIER, "no");
  const sys = lastBodies[0].messages.find((m: any) => m.role === "system").content;
  const user = lastBodies[0].messages.find((m: any) => m.role === "user").content;
  assert.match(sys, /Textualist/);
  assert.match(sys, /NO \/ FALSE/);
  assert.match(user, /Did the grantee meet Milestone 2/);
  assert.match(user, /80% of the spec/);
});

test("argue with a prior opponent argument drives a rebuttal prompt", async () => {
  globalThis.fetch = mockFetch(() => ({ claim: "x", reasoning: "y", rebuttal: "you ignore the spec" })) as any;
  const prior = { side: "yes" as const, handle: "Advocate-Y", claim: "It was met", reasoning: "80% works", rebuttal: "" };
  const a = await argue(CASE, DENIER, "no", prior);
  const user = lastBodies[0].messages.find((m: any) => m.role === "user").content;
  assert.match(user, /The opposing advocate argued/);
  assert.match(user, /80% works/);
  assert.equal(a.rebuttal, "you ignore the spec");
});

test("runDebate returns the requested number of rounds with both sides each", async () => {
  globalThis.fetch = mockFetch((body) => {
    const sys = body.messages[0].content;
    const side = /YES \/ TRUE/.test(sys) ? "yes" : "no";
    return { claim: `${side} claim`, reasoning: `${side} reasoning`, rebuttal: "" };
  }) as any;

  const d = await runDebate(CASE, AFFIRMER, DENIER, 2);
  assert.equal(d.rounds.length, 2);
  for (const round of d.rounds) {
    assert.equal(round.arguments.length, 2);
    const sides = round.arguments.map((a) => a.side).sort();
    assert.deepEqual(sides, ["no", "yes"]);
  }
});

test("runDebate round 1 has no rebuttal prompt; round 2 does", async () => {
  globalThis.fetch = mockFetch((body) => {
    const sys = body.messages[0].content;
    const side = /YES \/ TRUE/.test(sys) ? "yes" : "no";
    return { claim: `${side}`, reasoning: `${side} reasoning`, rebuttal: "" };
  }) as any;

  await runDebate(CASE, AFFIRMER, DENIER, 2);
  // 4 calls total: 2 in round 1, 2 in round 2
  assert.equal(lastBodies.length, 4);
  const round1User = lastBodies.slice(0, 2).map((b) => b.messages[1].content);
  const round2User = lastBodies.slice(2, 4).map((b) => b.messages[1].content);
  assert.ok(round1User.every((u) => !/The opposing advocate argued/.test(u)));
  assert.ok(round2User.every((u) => /The opposing advocate argued/.test(u)));
});

test("runDebate defaults to 2 rounds", async () => {
  globalThis.fetch = mockFetch(() => ({ claim: "c", reasoning: "r", rebuttal: "" })) as any;
  const d = await runDebate(CASE, AFFIRMER, DENIER);
  assert.equal(d.rounds.length, 2);
});
