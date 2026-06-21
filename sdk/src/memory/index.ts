// Tribunal verifiable agent-memory layer — remember / recall / restore.
//
// The thesis artifact for the Walrus track: the committee's judgment is
// PERSISTENT (Walrus), RECALLABLE (embeddings), OWNED (on-chain memory_ns binds
// it to a Case), and RESTORABLE (the index is a cache; Walrus is the truth).
//
// Design (walrus-agent-memory skill §7):
//   - Namespace: a stable id (the Case's on-chain `memory_ns`) grouping all
//     entries for one case/agent. The chain is the source of truth for which
//     memory belongs where.
//   - Typed entries: each entry tagged by kind (reasoning_trace | committee_vote
//     | verdict | case_law) so recall can filter.
//   - Quilt container: one Quilt per remember() batch; many small typed entries.
//   - Semantic recall: embed at write, keep a lightweight vector index keyed by
//     quiltPatchId. Recall = embed query -> cosine over index -> fetch + parse.
//   - Restore: re-read every entry from Walrus and rebuild the index. No
//     centralized memory DB — the durable truth is the namespace's blobs.
//   - (Seal hook): entries can be Seal-encrypted before write; gating lands in
//     the on-chain seal_approve policy (M3c-4). The layer treats entry bytes as
//     opaque, so plugging encryption in is transparent to remember/recall.

import { WalrusStore, type QuiltEntryInput } from "./walrus.js";
import { type Embedder, resolveEmbedder, cosine } from "./embeddings.js";
import { type SealAdapter, PassthroughSeal } from "./seal.js";

export type EntryKind =
  | "reasoning_trace"
  | "committee_vote"
  | "verdict"
  | "case_law"
  | "evidence_note"
  // v2 — persona-debate pipeline (added M4.3)
  | "debate_transcript" // full multi-round advocate transcript
  | "jury_deliberation" // first-pass + final juror votes + dissent + disagreement
  | "guardrail_decision" // opus-4.8 ruling: ratification/override + bias flags
  // v3 — stake-gated matchmaking audit row (M3b)
  | "provenance" // reproducible audit trail: advocates / backers / jurors / seeds / configHashes / models
  // v3 — case-law quilt anchor back to the on-chain case it summarises
  | "anchor"; // { caseId, stakePoolId, configHashHex, battleId, models }

export interface MemoryEntry {
  /** Stable within a namespace; becomes the Quilt patch identifier. */
  id: string;
  kind: EntryKind;
  /** Human/agent-readable text; what gets embedded for recall. */
  text: string;
  /** Arbitrary structured payload (model votes, scores, sources, ...). */
  data?: Record<string, unknown>;
  /** ms epoch; set at remember() if absent. */
  ts?: number;
}

/** A persisted entry's coordinates in Walrus + its embedding (the index row). */
export interface IndexRow {
  id: string;
  kind: EntryKind;
  quiltId: string;
  quiltPatchId: string;
  /** Patch identifier within the quilt — always known, survives restore. */
  identifier: string;
  ts: number;
  embedding: number[];
  textPreview: string;
}

/** The recall result: the entry plus where it lives and how well it matched. */
export interface RecallHit {
  score: number;
  entry: MemoryEntry;
  quiltId: string;
  quiltPatchId: string;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Confidentiality policy: which entry kinds are Seal-encrypted at rest on
 * Walrus. Mirrors the on-chain `evidence::can_decrypt` rule — in-progress
 * deliberation (votes, reasoning) is confidential to the resolver until the
 * case settles; the final verdict and accumulated case law are PUBLICLY
 * auditable (the transparency half of the thesis), so they stay readable.
 */
const CONFIDENTIAL_KINDS: ReadonlySet<EntryKind> = new Set<EntryKind>([
  "committee_vote",
  "reasoning_trace",
  "evidence_note",
  // v2 — in-progress deliberation stays sealed until the case settles. The
  // guardrail's binding ruling and the case_law summary are public.
  "debate_transcript",
  "jury_deliberation",
]);

/** Manifest entry written alongside the data entries so restore() is self-describing. */
interface ManifestRow {
  id: string;
  kind: EntryKind;
  identifier: string; // patch identifier within the quilt
  ts: number;
}

export class TribunalMemory {
  private index: IndexRow[] = [];

  constructor(
    /** On-chain Case.memory_ns (utf8). Binds this store to a specific case. */
    public readonly namespace: string,
    private readonly walrus: WalrusStore = new WalrusStore(),
    private readonly embedder: Embedder = resolveEmbedder(),
    /**
     * Encryption adapter for confidential entries. Defaults to passthrough so
     * existing flows are unchanged; pass an AesSeal (or production Seal) to
     * encrypt deliberation entries at rest on public Walrus.
     */
    private readonly seal: SealAdapter = new PassthroughSeal(),
  ) {}

  get embedderName(): string {
    return this.embedder.name;
  }

  get sealName(): string {
    return this.seal.name;
  }

  /** Seal identity for an entry: `${namespace}:${entryId}` (see evidence::is_prefix). */
  private sealIdFor(entryId: string): string {
    return `${this.namespace}:${entryId}`;
  }

  /** True if this entry kind is encrypted at rest under the confidentiality policy. */
  private isConfidential(kind: EntryKind): boolean {
    return this.seal.name !== "passthrough" && CONFIDENTIAL_KINDS.has(kind);
  }

  /** Quilt identifiers must start alphanumeric and be unique within the quilt. */
  private patchIdentifier(entryId: string): string {
    const safe = entryId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return /^[a-zA-Z0-9]/.test(safe) ? safe : `e_${safe}`;
  }

  /**
   * Decode raw Walrus bytes into a MemoryEntry, transparently Seal-decrypting
   * if the bytes carry the Tribunal-Seal envelope. Public entries (passthrough)
   * decode directly; the adapter returns non-sealed bytes unchanged.
   */
  private async decodeEntry(bytes: Uint8Array, entryId: string): Promise<MemoryEntry> {
    const plain = await this.seal.decrypt(bytes, this.sealIdFor(entryId));
    return JSON.parse(dec.decode(plain)) as MemoryEntry;
  }

  /**
   * Persist a batch of entries as ONE Quilt, embedding each for recall.
   * Returns the quiltId. Writes a `_manifest` entry so restore() can enumerate
   * the batch without external bookkeeping.
   */
  async remember(entries: MemoryEntry[]): Promise<{ quiltId: string; rows: IndexRow[] }> {
    if (entries.length === 0) throw new Error("remember: no entries");
    const ts = Date.now();
    const manifest: ManifestRow[] = [];
    const quiltEntries: QuiltEntryInput[] = [];

    for (const e of entries) {
      const identifier = this.patchIdentifier(e.id);
      const payload = {
        ns: this.namespace,
        id: e.id,
        kind: e.kind,
        text: e.text,
        data: e.data ?? {},
        ts: e.ts ?? ts,
      };
      // Confidential kinds are Seal-encrypted at rest; public kinds (verdict,
      // case_law) stay readable on Walrus per the on-chain transparency policy.
      let bytes: Uint8Array = enc.encode(JSON.stringify(payload));
      if (this.isConfidential(e.kind)) {
        bytes = await this.seal.encrypt(bytes, this.sealIdFor(e.id));
      }
      quiltEntries.push({ identifier, data: bytes });
      manifest.push({ id: e.id, kind: e.kind, identifier, ts: payload.ts });
    }
    // self-describing manifest (also lets restore work by quiltId alone)
    quiltEntries.push({
      identifier: "_manifest",
      data: enc.encode(JSON.stringify({ ns: this.namespace, ts, rows: manifest })),
    });

    const res = await this.walrus.writeQuilt(quiltEntries);
    const patchById = new Map(res.patches.map((p) => [p.identifier, p.quiltPatchId]));

    const rows: IndexRow[] = [];
    for (const e of entries) {
      const identifier = this.patchIdentifier(e.id);
      const quiltPatchId = patchById.get(identifier);
      if (!quiltPatchId) throw new Error(`no patch id for ${identifier}`);
      const embedding = await this.embedder.embed(e.text);
      const row: IndexRow = {
        id: e.id,
        kind: e.kind,
        quiltId: res.quiltId,
        quiltPatchId,
        identifier,
        ts: e.ts ?? ts,
        embedding,
        textPreview: e.text.slice(0, 120),
      };
      this.index.push(row);
      rows.push(row);
    }
    return { quiltId: res.quiltId, rows };
  }

  /**
   * Semantic recall over the in-memory index. Embeds the query, cosine-ranks,
   * optionally filters by kind, fetches the top-k entries from Walrus.
   */
  async recall(query: string, opts: { k?: number; kind?: EntryKind } = {}): Promise<RecallHit[]> {
    const k = opts.k ?? 3;
    const qv = await this.embedder.embed(query);
    const ranked = this.index
      .filter((r) => !opts.kind || r.kind === opts.kind)
      .map((r) => ({ r, score: cosine(qv, r.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    const hits: RecallHit[] = [];
    for (const { r, score } of ranked) {
      // prefer patch id (known after remember); fall back to quiltId+identifier
      // (always known, survives restore where patch ids aren't re-derived)
      const bytes = r.quiltPatchId
        ? await this.walrus.readPatch(r.quiltPatchId)
        : await this.walrus.readByIdentifier(r.quiltId, r.identifier);
      const entry = await this.decodeEntry(bytes, r.id);
      hits.push({ score, entry, quiltId: r.quiltId, quiltPatchId: r.quiltPatchId });
    }
    return hits;
  }

  /**
   * Rebuild the vector index from Walrus alone, given the quiltIds that belong
   * to this namespace. Proves the index is a cache and Walrus is the truth.
   * Reads each quilt's `_manifest`, then each entry, re-embedding as it goes.
   */
  async restore(quiltIds: string[]): Promise<number> {
    this.index = [];
    let restored = 0;
    for (const quiltId of quiltIds) {
      const manRaw = await this.walrus.readByIdentifier(quiltId, "_manifest");
      const manifest = JSON.parse(dec.decode(manRaw)) as {
        ns: string;
        rows: ManifestRow[];
      };
      if (manifest.ns !== this.namespace) continue; // not ours
      for (const m of manifest.rows) {
        const bytes = await this.walrus.readByIdentifier(quiltId, m.identifier);
        const entry = await this.decodeEntry(bytes, m.id);
        const embedding = await this.embedder.embed(entry.text);
        this.index.push({
          id: entry.id,
          kind: entry.kind,
          quiltId,
          quiltPatchId: "", // patch id not re-derived; reads go via identifier
          identifier: m.identifier,
          ts: entry.ts ?? manifest.rows.find((x) => x.id === entry.id)?.ts ?? 0,
          embedding,
          textPreview: entry.text.slice(0, 120),
        });
        restored++;
      }
    }
    return restored;
  }

  /** Current index size (entries available for recall). */
  get size(): number {
    return this.index.length;
  }

  /** Export the index rows (for persistence/debugging — NOT the source of truth). */
  snapshot(): IndexRow[] {
    return [...this.index];
  }
}
