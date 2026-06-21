// Server-side case-law recall over Walrus memory.
//
// Reads the public case_law / verdict entries that the Tribunal has written to
// Walrus and ranks them against a query. Self-contained (no SDK cross-version
// dependency): a deterministic local hash embedder + cosine, mirroring
// sdk/src/memory/embeddings.ts. Public entries are plaintext on Walrus, so the
// arena can surface accumulated precedent without any key.

const WALRUS_AGGREGATOR =
  process.env.WALRUS_AGGREGATOR ??
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  "https://aggregator.walrus-testnet.walrus.space";

const DIMS = 256;

/** Deterministic hashed-ngram embedder (matches the SDK's HashEmbedder shape). */
function embed(text: string): number[] {
  const v = new Array(DIMS).fill(0);
  const toks = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  const grams = [...toks];
  for (let i = 0; i < toks.length - 1; i++) grams.push(toks[i] + "_" + toks[i + 1]);
  for (const g of grams) {
    let h = 2166136261;
    for (let i = 0; i < g.length; i++) {
      h ^= g.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = (h >>> 0) % DIMS;
    v[idx] += (h & 1) === 0 ? 1 : -1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface CaseLawHit {
  score: number;
  kind: string;
  text: string;
  quiltId: string;
  /** On-chain case object id this hit was decided on (if the quilt carries an anchor). */
  caseId?: string;
}

/** Read one public entry from a Walrus quilt by identifier. */
async function readEntry(quiltId: string, identifier: string): Promise<any | null> {
  try {
    const res = await fetch(`${WALRUS_AGGREGATOR}/v1/blobs/by-quilt-id/${quiltId}/${identifier}`);
    if (!res.ok) return null;
    const text = await res.text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Recall public case law from given Walrus quilts, ranked by relevance to the
 * query. Each quilt carries a `_manifest` listing its entries; we read the
 * public ones (verdict / case_law), embed, and cosine-rank.
 */
export async function recall(query: string, quiltIds: string[], k = 5): Promise<CaseLawHit[]> {
  const qv = embed(query);

  // Read all quilts in parallel; within each, read its public entries in parallel.
  const perQuilt = await Promise.all(
    quiltIds.map(async (quiltId) => {
      const manifest = await readEntry(quiltId, "_manifest");
      if (!manifest?.rows) return [] as CaseLawHit[];
      const anchorRow = manifest.rows.find((r: any) => r.kind === "anchor");
      const anchor = anchorRow ? await readEntry(quiltId, anchorRow.identifier) : null;
      const caseIdForQuilt: string | undefined = anchor?.data?.caseId;
      const publicRows = manifest.rows.filter(
        (row: any) => row.kind === "verdict" || row.kind === "case_law",
      );
      const entries = await Promise.all(
        publicRows.map((row: any) => readEntry(quiltId, row.identifier)),
      );
      return entries
        .filter((e) => e?.text)
        .map((entry) => ({
          score: cosine(qv, embed(entry.text)),
          kind: entry.kind,
          text: entry.text,
          quiltId,
          caseId: entry?.data?.caseId ?? caseIdForQuilt,
        }));
    }),
  );

  return perQuilt.flat().sort((a, b) => b.score - a.score).slice(0, k);
}
