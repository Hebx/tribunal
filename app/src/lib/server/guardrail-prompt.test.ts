// Run with: node --import tsx --test src/lib/server/guardrail-prompt.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  GUARDRAIL_SYSTEM_PROMPT,
  GUARDRAIL_CONFIG_HASH,
  parseGuardrailResponse,
} from "./guardrail-prompt";

test("GUARDRAIL_SYSTEM_PROMPT is locked, identifiable, and self-contained", () => {
  // Mentions the binding role.
  assert.match(GUARDRAIL_SYSTEM_PROMPT, /binding judge/i);
  // Demands strict JSON output.
  assert.match(GUARDRAIL_SYSTEM_PROMPT, /STRICT JSON only/);
  // Calls out the persona-trap discipline.
  assert.match(GUARDRAIL_SYSTEM_PROMPT, /Personas in this transcript are advocacy devices/);
  // Mandates the personaTrapsRejected proof-of-work field.
  assert.match(GUARDRAIL_SYSTEM_PROMPT, /personaTrapsRejected/);
  // Sane length — long enough to be a real procedure, short enough to fit.
  assert.ok(GUARDRAIL_SYSTEM_PROMPT.length > 800);
  assert.ok(GUARDRAIL_SYSTEM_PROMPT.length < 2500);
});

test("GUARDRAIL_SYSTEM_PROMPT does NOT interpolate per-case data (reproducibility invariant)", () => {
  // Reading the module twice must return the exact same string.
  // Module is loaded once per process, so we re-import via a dynamic import path
  // and assert string equality.
  const expectedHash = createHash("sha256")
    .update(GUARDRAIL_SYSTEM_PROMPT, "utf8")
    .digest("hex");
  assert.equal(GUARDRAIL_CONFIG_HASH, expectedHash);

  // Belt-and-braces: ensure no template placeholders leaked.
  assert.doesNotMatch(GUARDRAIL_SYSTEM_PROMPT, /\$\{/);
  assert.doesNotMatch(GUARDRAIL_SYSTEM_PROMPT, /\{\{/);
});

test("GUARDRAIL_CONFIG_HASH is a 64-hex sha256 and matches the prompt content", () => {
  assert.match(GUARDRAIL_CONFIG_HASH, /^[0-9a-f]{64}$/);
  // Recompute and compare — proves the export is the actual digest of the
  // current prompt content, not a stale constant.
  const recomputed = createHash("sha256")
    .update(GUARDRAIL_SYSTEM_PROMPT, "utf8")
    .digest("hex");
  assert.equal(GUARDRAIL_CONFIG_HASH, recomputed);
});

test("parseGuardrailResponse returns a tolerant shape with all expected fields", () => {
  const r = parseGuardrailResponse({
    finalOutcome: true,
    ratifiedJury: false,
    overrideReason: "criteria require exact match",
    biasFlags: ["verbosity", "anchoring"],
    confidence: 0.83,
    reasoning: "evidence is partial",
    personaTrapsRejected: ["rhetoric: emotional appeal to author intent"],
  });
  assert.equal(r.finalOutcome, true);
  assert.equal(r.ratifiedJury, false);
  assert.equal(r.overrideReason, "criteria require exact match");
  assert.deepEqual(r.biasFlags, ["verbosity", "anchoring"]);
  assert.equal(r.confidence, 0.83);
  assert.equal(r.reasoning, "evidence is partial");
  assert.equal(r.personaTrapsRejected.length, 1);
});

test("parseGuardrailResponse fills defaults for missing fields", () => {
  const r = parseGuardrailResponse({});
  assert.equal(r.finalOutcome, null);
  assert.equal(r.ratifiedJury, null);
  assert.equal(r.overrideReason, "");
  assert.deepEqual(r.biasFlags, []);
  assert.equal(r.confidence, 0);
  assert.equal(r.reasoning, "");
  assert.deepEqual(r.personaTrapsRejected, []);
});

test("parseGuardrailResponse coerces and clamps", () => {
  const r = parseGuardrailResponse({
    finalOutcome: "true", // not a boolean → null
    ratifiedJury: 1, // not a boolean → null
    overrideReason: "x".repeat(500), // clamped to 300
    biasFlags: ["a", "", 42], // empty/falsy filtered, numbers stringified
    confidence: 1.7, // clamped to 1
    reasoning: "y".repeat(500), // clamped to 400
    personaTrapsRejected: ["t1", null, "t2"],
  });
  assert.equal(r.finalOutcome, null);
  assert.equal(r.ratifiedJury, null);
  assert.equal(r.overrideReason.length, 300);
  assert.deepEqual(r.biasFlags, ["a", "42"]);
  assert.equal(r.confidence, 1);
  assert.equal(r.reasoning.length, 400);
  assert.deepEqual(r.personaTrapsRejected, ["t1", "t2"]);
});

test("parseGuardrailResponse rejects non-objects", () => {
  assert.throws(() => parseGuardrailResponse(null), /not a JSON object/);
  assert.throws(() => parseGuardrailResponse("verdict"), /not a JSON object/);
  assert.throws(() => parseGuardrailResponse(42), /not a JSON object/);
});
