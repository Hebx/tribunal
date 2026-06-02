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

export type EntryKind =
  | "reasoning_trace"
  | "committee_vote"
  | "verdict"
  | "case_law"
  | "evidence_note";

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
  ) {}

  get embedderName(): string {
    return this.embedder.name;
  }

  /** Quilt identifiers must start alphanumeric and be unique within the quilt. */
  private patchIdentifier(entryId: string): string {
    const safe = entryId.replace(/[^a-zA-Z0-9_-]/g, "_");
    return /^[a-zA-Z0-9]/.test(safe) ? safe : `e_${safe}`;
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
      // NOTE: entry bytes are opaque to Walrus — Seal-encrypt here in M3c-4.
      quiltEntries.push({ identifier, data: enc.encode(JSON.stringify(payload)) });
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
      const entry = JSON.parse(dec.decode(bytes)) as MemoryEntry;
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
        const entry = JSON.parse(dec.decode(bytes)) as MemoryEntry;
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
