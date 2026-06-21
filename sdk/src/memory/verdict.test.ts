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
