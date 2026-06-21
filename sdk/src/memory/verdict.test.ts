// Run with: node --import tsx --test src/memory/verdict.test.ts
//
// In-memory fake of WalrusStore so we can test the typed-entry persistence end
// to end without HTTP. Verifies:
//  - all 5 typed entries are written under the correct EntryKind
//  - debate + jury entries are sealed at rest (AesSeal), guardrail/verdict/case_law are public
//  - recall({ kind: "case_law" }) returns the precedent entry
//  - patch identifiers are returned for the verdict-bundle client

import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash, createCipheriv, createDecipheriv } from "node:crypto";
import { TribunalMemory } from "./index.js";
import { WalrusStore, type QuiltEntryInput, type QuiltWriteResult } from "./walrus.js";
import { HashEmbedder } from "./embeddings.js";
import type { SealAdapter } from "./seal.js";
import { persistVerdictBundle, type VerdictBundleLike } from "./verdict.js";

// --- In-memory Walrus fake ---
class FakeWalrus extends WalrusStore {
  private quilts = new Map<string, Map<string, Uint8Array>>();
  private patchIndex = new Map<string, { quiltId: string; identifier: string }>();
  private counter = 0;

  constructor() {
    super({ publisher: "http://fake", aggregator: "http://fake" });
  }

  override async writeQuilt(entries: QuiltEntryInput[]): Promise<QuiltWriteResult> {
    if (entries.length === 0) throw new Error("writeQuilt: no entries");
    const quiltId = `quilt-${++this.counter}`;
    const inner = new Map<string, Uint8Array>();
    const patches = entries.map((e) => {
      inner.set(e.identifier, e.data);
      const quiltPatchId = `${quiltId}:${e.identifier}`;
      this.patchIndex.set(quiltPatchId, { quiltId, identifier: e.identifier });
      return { identifier: e.identifier, quiltPatchId };
    });
    this.quilts.set(quiltId, inner);
    return { quiltId, blobObjectId: `obj-${quiltId}`, size: 0, patches, newlyCreated: true };
  }

  override async readPatch(quiltPatchId: string): Promise<Uint8Array> {
    const ref = this.patchIndex.get(quiltPatchId);
    if (!ref) throw new Error(`no patch ${quiltPatchId}`);
    return this.readByIdentifier(ref.quiltId, ref.identifier);
  }

  override async readByIdentifier(quiltId: string, identifier: string): Promise<Uint8Array> {
    const inner = this.quilts.get(quiltId);
    if (!inner) throw new Error(`no quilt ${quiltId}`);
    const bytes = inner.get(identifier);
    if (!bytes) throw new Error(`no identifier ${identifier}`);
    return bytes;
  }
}

// --- Minimal AES-GCM SealAdapter so we can detect "sealed at rest" ---
// Envelope: [magic 4 bytes "SEAL"][iv 12][tag 16][ciphertext]
class TestAesSeal implements SealAdapter {
  readonly name = "test-aes";
  constructor(private readonly key: Buffer) {}
  private envelope(iv: Buffer, ct: Buffer, tag: Buffer): Uint8Array {
    return Uint8Array.from(Buffer.concat([Buffer.from("SEAL"), iv, tag, ct]));
  }
  async encrypt(plaintext: Uint8Array, _id: string): Promise<Uint8Array> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ct = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    const tag = cipher.getAuthTag();
    return this.envelope(iv, ct, tag);
  }
  async decrypt(bytes: Uint8Array, _id: string): Promise<Uint8Array> {
    const buf = Buffer.from(bytes);
    if (buf.subarray(0, 4).toString() !== "SEAL") return bytes; // not sealed → passthrough
    const iv = buf.subarray(4, 16);
    const tag = buf.subarray(16, 32);
    const ct = buf.subarray(32);
    const d = createDecipheriv("aes-256-gcm", this.key, iv);
    d.setAuthTag(tag);
    return Uint8Array.from(Buffer.concat([d.update(ct), d.final()]));
  }
}

function isSealedAtRest(bytes: Uint8Array): boolean {
  return Buffer.from(bytes).subarray(0, 4).toString() === "SEAL";
}

function makeBundle(): VerdictBundleLike {
  return {
    case: {
      question: "Did the grantee meet Milestone 2 of the DAO build grant?",
      criteria: "Deliverable must substantially match the written spec.",
      evidence: "Grantee shipped 8 of 10 features. No deadline breach.",
    },
    debate: {
      rounds: [
        {
          round: 1,
          arguments: [
            { side: "yes", claim: "Substantial performance is met.", reasoning: "8/10 features, core journey works." },
            { side: "no", claim: "Spec listed 10 features.", reasoning: "Literal text controls." },
          ],
        },
        {
          round: 2,
          arguments: [
            { side: "yes", claim: "Materiality threshold applies.", reasoning: "The missing features are non-core.", rebuttal: "Strict text without context is brittle." },
            { side: "no", claim: "No materiality carveout in spec.", reasoning: "Reading one in is unjustified." },
          ],
        },
      ],
    },
    jury: {
      firstPass: [
        { handle: "Juror-Pragmatist", vote: true, confidence: 0.7, rationale: "Core journey works." },
        { handle: "Juror-Textualist", vote: false, confidence: 0.8, rationale: "Words on the page." },
        { handle: "Juror-Risk-Hawk", vote: false, confidence: 0.6, rationale: "Audit log is material." },
      ],
      finalVotes: [
        { handle: "Juror-Pragmatist", vote: true, confidence: 0.65, rationale: "Stay with substantial performance.", revised: false },
        { handle: "Juror-Textualist", vote: false, confidence: 0.85, rationale: "Holding the line on text." },
        { handle: "Juror-Risk-Hawk", vote: false, confidence: 0.7, rationale: "Material control gap stands." },
      ],
      outcome: false,
      votesTrue: 1,
      votesFalse: 2,
      abstain: 0,
      dissent: 1,
      disagreementRate: 0.33,
    },
    guardrail: {
      finalOutcome: false,
      ratifiedJury: true,
      overrideReason: "",
      biasFlags: [],
      confidence: 0.78,
      reasoning: "Jurors applied the stated criteria; no bias or red-line trigger.",
    },
    finalOutcome: false,
    models: { advocate: "claude-haiku-4.5", jury: "claude-sonnet-4.6", guardrail: "claude-opus-4.8" },
    configHashHex: createHash("sha256").update("test-config").digest("hex"),
    decidedAt: Date.now(),
  };
}

test("persistVerdictBundle writes 5 typed entries and seals confidential kinds at rest", async () => {
  const walrus = new FakeWalrus();
  const seal = new TestAesSeal(randomBytes(32));
  const mem = new TribunalMemory("walrus-ns://tribunal/test", walrus, new HashEmbedder(), seal);

  const bundle = makeBundle();
  const persisted = await persistVerdictBundle(mem, "0xCASE", bundle);

  assert.equal(persisted.rows.length, 5);
  const kinds = persisted.rows.map((r) => r.kind).sort();
  assert.deepEqual(kinds, [
    "case_law",
    "debate_transcript",
    "guardrail_decision",
    "jury_deliberation",
    "verdict",
  ]);

  // Read the raw bytes back and inspect whether they were sealed at rest.
  // debate_transcript + jury_deliberation are confidential → SEAL envelope.
  // guardrail_decision, verdict, case_law are public → plaintext JSON.
  for (const row of persisted.rows) {
    const raw = await walrus.readByIdentifier(row.quiltId, row.identifier);
    if (row.kind === "debate_transcript" || row.kind === "jury_deliberation") {
      assert.ok(isSealedAtRest(raw), `${row.kind} should be sealed at rest`);
    } else {
      assert.ok(!isSealedAtRest(raw), `${row.kind} should be plaintext at rest`);
      // and it should round-trip as JSON
      const parsed = JSON.parse(new TextDecoder().decode(raw));
      assert.equal(parsed.kind, row.kind);
    }
  }

  // Patches map exposes every kind
  for (const k of ["debate", "jury", "guardrail", "verdict", "case_law"]) {
    assert.ok(persisted.patches[k], `patches.${k} missing`);
  }
});

test("recall({ kind: 'case_law' }) surfaces the precedent and decrypts confidential entries transparently", async () => {
  const walrus = new FakeWalrus();
  const seal = new TestAesSeal(randomBytes(32));
  const mem = new TribunalMemory("walrus-ns://tribunal/recall", walrus, new HashEmbedder(), seal);
  const bundle = makeBundle();
  await persistVerdictBundle(mem, "0xCASE", bundle);

  const lawHits = await mem.recall("milestone substantial performance", { kind: "case_law" });
  assert.equal(lawHits.length, 1);
  assert.equal(lawHits[0].entry.kind, "case_law");
  assert.match(String(lawHits[0].entry.text), /Verdict: NO/);

  // Confidential recall: the entry survives the SEAL envelope round-trip.
  const debateHits = await mem.recall("substantial performance", { kind: "debate_transcript" });
  assert.equal(debateHits.length, 1);
  assert.equal(debateHits[0].entry.kind, "debate_transcript");
  assert.match(String(debateHits[0].entry.text), /R1\/YES/);
});

test("v3: provenance entry is persisted PUBLIC when bundle.provenance is present", async () => {
  const walrus = new FakeWalrus();
  const seal = new TestAesSeal(randomBytes(32));
  const mem = new TribunalMemory("walrus-ns://tribunal/provenance", walrus, new HashEmbedder(), seal);
  const bundle: VerdictBundleLike = {
    ...makeBundle(),
    guardrailConfigHash: "g".repeat(64),
    provenance: {
      caseId: "0xCASE",
      poolId: "0xPOOL",
      advocates: {
        affirmer: {
          agentCardId: "0xaff",
          archetypeId: "pragmatist",
          personaHash: "a".repeat(64),
          score: 14,
          isFirstStaker: true,
          amount: "100",
          weight: "300",
        },
        denier: {
          agentCardId: "0xden",
          archetypeId: "textualist",
          personaHash: "b".repeat(64),
          score: 9,
          isFirstStaker: true,
          amount: "100",
          weight: "300",
        },
      },
      backers: { yes: [], no: [] },
      jurors: [
        { agentCardId: "0xj1", archetypeId: "risk-hawk", personaHash: "c".repeat(64), score: 31 },
        { agentCardId: "0xj2", archetypeId: "ethicist", personaHash: "d".repeat(64), score: 12 },
        { agentCardId: "0xj3", archetypeId: "intent-first", personaHash: "e".repeat(64), score: 7 },
      ],
      jurySelection: { seed: "0xdeadbeef", fallbackUsed: false },
      models: { advocate: "haiku-4.5", jury: "sonnet-4.6", guardrail: "opus-4.8" },
      configHashes: { resolver: "r".repeat(64), guardrail: "g".repeat(64) },
      gateway: {
        base: "https://gw.test/v1",
        temperatures: { advocate: 0.4, jury: 0.3, guardrail: 0 },
      },
      decidedAt: 1750000000000,
      resolverCommit: "abc1234",
    },
  };

  const persisted = await persistVerdictBundle(mem, "0xCASE", bundle);

  // 6 entries this time (added provenance), all the expected kinds present.
  assert.equal(persisted.rows.length, 6);
  const kinds = persisted.rows.map((r) => r.kind).sort();
  assert.deepEqual(kinds, [
    "case_law",
    "debate_transcript",
    "guardrail_decision",
    "jury_deliberation",
    "provenance",
    "verdict",
  ]);

  // Provenance must be PUBLIC (plaintext at rest). Audit trail is unreadable
  // if the seal layer were ever to silently encrypt it.
  const provRow = persisted.rows.find((r) => r.kind === "provenance")!;
  const raw = await walrus.readByIdentifier(provRow.quiltId, provRow.identifier);
  assert.ok(!isSealedAtRest(raw), "provenance must be public, not sealed at rest");

  // Round-trip the JSON and confirm the full audit row was preserved.
  const parsed = JSON.parse(new TextDecoder().decode(raw));
  assert.equal(parsed.kind, "provenance");
  const data = parsed.data;
  assert.equal(data.caseId, "0xCASE");
  assert.equal(data.poolId, "0xPOOL");
  assert.equal(data.advocates.affirmer.agentCardId, "0xaff");
  assert.equal(data.advocates.affirmer.isFirstStaker, true);
  assert.equal(data.jurors.length, 3);
  assert.equal(data.jurySelection.seed, "0xdeadbeef");
  assert.equal(data.configHashes.guardrail.length, 64);
  assert.equal(data.gateway.temperatures.guardrail, 0);
  assert.equal(data.resolverCommit, "abc1234");

  // patches map exposes provenance for client lookup.
  assert.ok(persisted.patches.provenance);
});

test("v3: persistVerdictBundle stays 5-entry when bundle.provenance is absent (backcompat)", async () => {
  const walrus = new FakeWalrus();
  const seal = new TestAesSeal(randomBytes(32));
  const mem = new TribunalMemory("walrus-ns://tribunal/backcompat", walrus, new HashEmbedder(), seal);
  const bundle = makeBundle(); // no provenance
  const persisted = await persistVerdictBundle(mem, "0xCASE", bundle);
  assert.equal(persisted.rows.length, 5);
  assert.ok(!persisted.patches.provenance);
});
