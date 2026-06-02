// Walrus storage client — publisher/aggregator HTTP path.
//
// Per our research (walrus-agent-memory skill §3): for an app the recommended
// path is publisher (write) + aggregator (read), NOT the heavyweight SDK. The
// public Mysten testnet publisher sponsors the WAL cost, so no WAL token or CLI
// is required to ship the demo. Quilt (§5) is the container for many small
// typed entries — one Quilt per case bundle.
//
// Two IDs (§2), never confused:
//   - quiltId       : the blob id of the whole Quilt (content-addressed)
//   - quiltPatchId  : per-entry id inside the Quilt (depends on composition)

export interface WalrusEndpoints {
  publisher: string;
  aggregator: string;
}

export const TESTNET_WALRUS: WalrusEndpoints = {
  publisher: "https://publisher.walrus-testnet.walrus.space",
  aggregator: "https://aggregator.walrus-testnet.walrus.space",
};

export interface QuiltEntryInput {
  /** Alphanumeric-start identifier, unique within the quilt (Walrus rule). */
  identifier: string;
  /** Raw bytes of the (already Seal-encrypted, if sensitive) entry. */
  data: Uint8Array;
}

export interface StoredQuiltPatch {
  identifier: string;
  quiltPatchId: string;
}

export interface QuiltWriteResult {
  quiltId: string;
  /** Sui object id of the quilt's Blob registration record. */
  blobObjectId: string;
  size: number;
  patches: StoredQuiltPatch[];
  /** true if the publisher minted a new blob, false if content already existed. */
  newlyCreated: boolean;
}

export interface BlobWriteResult {
  blobId: string;
  blobObjectId: string;
  size: number;
  newlyCreated: boolean;
}

export class WalrusStore {
  constructor(private readonly ep: WalrusEndpoints = TESTNET_WALRUS) {}

  /** Write a single blob. Use for one large payload; prefer writeQuilt for many. */
  async writeBlob(data: Uint8Array, epochs = 5): Promise<BlobWriteResult> {
    const res = await fetch(`${this.ep.publisher}/v1/blobs?epochs=${epochs}`, {
      method: "PUT",
      body: data as BodyInit,
    });
    if (!res.ok) throw new Error(`Walrus writeBlob failed: ${res.status} ${await res.text()}`);
    const j: any = await res.json();
    const created = j.newlyCreated?.blobObject;
    const certified = j.alreadyCertified;
    if (created) {
      return {
        blobId: created.blobId,
        blobObjectId: created.id,
        size: created.size,
        newlyCreated: true,
      };
    }
    if (certified) {
      return { blobId: certified.blobId, blobObjectId: certified.blobId, size: 0, newlyCreated: false };
    }
    throw new Error(`Unexpected Walrus response: ${JSON.stringify(j).slice(0, 300)}`);
  }

  /**
   * Write many small entries as one Quilt (the cost lever — ~409x cheaper than
   * individual blobs). Returns the quiltId + per-entry quiltPatchIds.
   * NOTE: a quilt is immutable as a unit — you cannot add/delete one entry.
   */
  async writeQuilt(entries: QuiltEntryInput[], epochs = 5): Promise<QuiltWriteResult> {
    if (entries.length === 0) throw new Error("writeQuilt: no entries");
    const form = new FormData();
    for (const e of entries) {
      // a Blob body keyed by the entry identifier => Walrus uses it as the patch identifier
      form.append(e.identifier, new Blob([e.data as BlobPart]), e.identifier);
    }
    const res = await fetch(`${this.ep.publisher}/v1/quilts?epochs=${epochs}`, {
      method: "PUT",
      body: form,
    });
    if (!res.ok) throw new Error(`Walrus writeQuilt failed: ${res.status} ${await res.text()}`);
    const j: any = await res.json();
    const store = j.blobStoreResult ?? j;
    const obj = store.newlyCreated?.blobObject ?? store.alreadyCertified;
    const newlyCreated = !!store.newlyCreated;
    if (!obj) throw new Error(`Unexpected Walrus quilt response: ${JSON.stringify(j).slice(0, 300)}`);
    const patches: StoredQuiltPatch[] = (j.storedQuiltBlobs ?? []).map((p: any) => ({
      identifier: p.identifier,
      quiltPatchId: p.quiltPatchId,
    }));
    return {
      quiltId: obj.blobId,
      blobObjectId: obj.id ?? obj.blobId,
      size: obj.size ?? 0,
      patches,
      newlyCreated,
    };
  }

  /** Read raw bytes of a single blob (or whole quilt) by id. */
  async readBlob(blobId: string): Promise<Uint8Array> {
    const res = await fetch(`${this.ep.aggregator}/v1/blobs/${blobId}`);
    if (!res.ok) throw new Error(`Walrus readBlob failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Read one quilt entry by its quiltPatchId. */
  async readPatch(quiltPatchId: string): Promise<Uint8Array> {
    const res = await fetch(`${this.ep.aggregator}/v1/blobs/by-quilt-patch-id/${quiltPatchId}`);
    if (!res.ok) throw new Error(`Walrus readPatch failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  /** Read one quilt entry by quiltId + identifier. */
  async readByIdentifier(quiltId: string, identifier: string): Promise<Uint8Array> {
    const res = await fetch(`${this.ep.aggregator}/v1/blobs/by-quilt-id/${quiltId}/${identifier}`);
    if (!res.ok) throw new Error(`Walrus readByIdentifier failed: ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }
}
