// Run with: node --import tsx --test src/lib/server/jury.test.ts
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  jurorVote,
  anonymizeTranscript,
  runJury,
  type JurorPersona,
} from "./jury";
import type { CaseInput, DebateResult } from "./debate";

const CASE: CaseInput = {
  question: "Did the grantee meet Milestone 2?",
  criteria: "Deliverable must match the written spec.",
  evidence: "The deliverable shipped at ~80% of the spec.",
};

// A two-round debate with named advocate handles we expect to be stripped.
const DEBATE: DebateResult = {
  case: CASE,
  rounds: [
    {
      round: 1,
      arguments: [
        { side: "yes", handle: "Pragmatist-Prime", claim: "Substantially met.", reasoning: "80% achieves the goal.", rebuttal: "" },
        { side: "no", handle: "Textualist-Rex", claim: "Not met.", reasoning: "80% is not the written spec.", rebuttal: "" },
      ],
    },
    {
      round: 2,
      arguments: [
        { side: "yes", handle: "Pragmatist-Prime", claim: "Still met.", reasoning: "Outcome over form.", rebuttal: "Textualist-Rex ignores real use." },
        { side: "no", handle: "Textualist-Rex", claim: "Still not.", reasoning: "Spec is the contract.", rebuttal: "Pragmatist-Prime invents leniency." },
      ],
    },
  ],
};

const JUROR_A: JurorPersona = { handle: "Juror-Textualist", systemPrompt: "You are Textualist. The words on the page control." };
const JUROR_B: JurorPersona = { handle: "Juror-Pragmatist", systemPrompt: "You are Pragmatist. You judge by outcomes." };
const JUROR_C: JurorPersona = { handle: "Juror-Ethicist", systemPrompt: "You are Ethicist. Fairness and good faith govern." };

process.env.TRIBUNAL_GATEWAY_PROVIDER = "kiro";
process.env.KIRO_GATEWAY_API_KEY = "test-key";

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

// --- Task 3.1: anchoring resistance + independent juror vote ---

test("anonymizeTranscript strips advocate handles, replaces with Side A/B", () => {
  const anon = anonymizeTranscript(DEBATE);
  assert.ok(!/Pragmatist-Prime/.test(anon), "yes-advocate handle must be gone");
  assert.ok(!/Textualist-Rex/.test(anon), "no-advocate handle must be gone");
  assert.match(anon, /Side A/);
  assert.match(anon, /Side B/);
  // the substance survives
  assert.match(anon, /80% achieves the goal/);
  assert.match(anon, /Spec is the contract/);
});

test("jurorVote returns a structured vote and never sees advocate handles", async () => {
  globalThis.fetch = mockFetch(() => ({ vote: true, confidence: 0.7, rationale: "Outcome substantially achieved." })) as any;
  const v = await jurorVote(CASE, DEBATE, JUROR_B);
  assert.equal(v.vote, true);
  assert.equal(v.handle, "Juror-Pragmatist");
  assert.ok(v.confidence > 0 && v.confidence <= 1);
  const user = lastBodies[0].messages.find((m: any) => m.role === "user").content;
  assert.ok(!/Pragmatist-Prime/.test(user), "advocate handle must not reach the juror");
  assert.ok(!/Textualist-Rex/.test(user), "advocate handle must not reach the juror");
  assert.match(user, /Side A/);
});

test("jurorVote injects the juror persona system prompt", async () => {
  globalThis.fetch = mockFetch(() => ({ vote: false, confidence: 0.6, rationale: "Spec not met." })) as any;
  await jurorVote(CASE, DEBATE, JUROR_A);
  const sys = lastBodies[0].messages.find((m: any) => m.role === "system").content;
  assert.match(sys, /Textualist/);
  assert.match(sys, /juror/i);
});

// --- Task 3.2: jury panel + deliberation + dissent + disagreement metric ---

test("runJury runs all jurors and tallies the majority outcome", async () => {
  // 2 vote true, 1 votes false → outcome true, dissent present
  globalThis.fetch = mockFetch((body) => {
    const sys = body.messages.find((m: any) => m.role === "system").content;
    const isDelib = /other jurors/i.test(body.messages.find((m: any) => m.role === "user").content);
    if (/Textualist/.test(sys)) return { vote: false, confidence: 0.8, rationale: "Spec controls." };
    return { vote: true, confidence: 0.7, rationale: "Outcome achieved." + (isDelib ? " (held)" : "") };
  }) as any;

  const r = await runJury(CASE, DEBATE, [JUROR_A, JUROR_B, JUROR_C]);
  assert.equal(r.firstPass.length, 3);
  assert.equal(r.finalVotes.length, 3);
  assert.equal(r.outcome, true); // 2 true vs 1 false
  assert.equal(r.dissent, true); // not unanimous
  assert.ok(r.disagreementRate > 0, "disagreement must be non-zero on a split");
});

test("runJury reports zero disagreement and no dissent on a unanimous panel", async () => {
  globalThis.fetch = mockFetch(() => ({ vote: true, confidence: 0.9, rationale: "Clear." })) as any;
  const r = await runJury(CASE, DEBATE, [JUROR_A, JUROR_B, JUROR_C]);
  assert.equal(r.outcome, true);
  assert.equal(r.dissent, false);
  assert.equal(r.disagreementRate, 0);
});

test("runJury first pass is independent (no peer rationales in the prompt)", async () => {
  globalThis.fetch = mockFetch(() => ({ vote: true, confidence: 0.5, rationale: "ok" })) as any;
  await runJury(CASE, DEBATE, [JUROR_A, JUROR_B]);
  // first 2 calls = first pass (independent), next up-to-2 = deliberation
  const firstPassUsers = lastBodies.slice(0, 2).map((b) => b.messages.find((m: any) => m.role === "user").content);
  assert.ok(firstPassUsers.every((u) => !/other jurors/i.test(u)), "first pass must not include peer rationales");
});

test("runJury deliberation pass exposes peers' rationales", async () => {
  globalThis.fetch = mockFetch(() => ({ vote: true, confidence: 0.5, rationale: "ok" })) as any;
  await runJury(CASE, DEBATE, [JUROR_A, JUROR_B]);
  // deliberation calls reference peer rationales
  const delibUsers = lastBodies.slice(2).map((b) => b.messages.find((m: any) => m.role === "user").content);
  assert.ok(delibUsers.length > 0, "deliberation pass must run");
  assert.ok(delibUsers.every((u) => /other jurors/i.test(u)), "deliberation prompt must include peer rationales");
});

test("runJury requires distinct juror personas", async () => {
  globalThis.fetch = mockFetch(() => ({ vote: true, confidence: 0.5, rationale: "ok" })) as any;
  await assert.rejects(() => runJury(CASE, DEBATE, [JUROR_A, JUROR_A]), /distinct/i);
});
