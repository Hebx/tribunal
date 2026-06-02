// Pluggable embeddings for semantic recall.
//
// Per the walrus-agent-memory skill: the vector index is a REBUILDABLE CACHE,
// never the source of truth (Walrus blobs are). So the embedder is swappable and
// the demo never hard-depends on a paid API — if no provider key works, we fall
// back to a deterministic local hashing embedder (good enough to prove the
// recall *mechanism*; swap in a real model for production quality).

export interface Embedder {
  readonly name: string;
  readonly dims: number;
  embed(text: string): Promise<number[]>;
}

/** Cosine similarity between two equal-length vectors. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Deterministic local fallback: hashed bag-of-token-ngrams projected into a
 * fixed-dim L2-normalized vector. No network, no key. Stable across runs so a
 * rebuilt index matches the original. Quality is coarse but the recall pipeline
 * is identical to a real embedder's.
 */
export class HashEmbedder implements Embedder {
  readonly name = "local-hash";
  constructor(readonly dims = 256) {}

  async embed(text: string): Promise<number[]> {
    const v = new Array(this.dims).fill(0);
    const toks = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    const grams: string[] = [...toks];
    for (let i = 0; i < toks.length - 1; i++) grams.push(toks[i] + "_" + toks[i + 1]);
    for (const g of grams) {
      let h = 2166136261;
      for (let i = 0; i < g.length; i++) {
        h ^= g.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      const idx = (h >>> 0) % this.dims;
      const sign = (h & 1) === 0 ? 1 : -1;
      v[idx] += sign;
    }
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map((x) => x / norm);
  }
}

/** Google Gemini embeddings (gemini-embedding-001). */
export class GeminiEmbedder implements Embedder {
  readonly name = "gemini-embedding-001";
  readonly dims: number;
  constructor(
    private readonly apiKey: string,
    private readonly model = "gemini-embedding-001",
    dims = 768,
  ) {
    this.dims = dims;
  }

  async embed(text: string): Promise<number[]> {
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:embedContent?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${this.model}`,
        content: { parts: [{ text }] },
        outputDimensionality: this.dims,
      }),
    });
    if (!res.ok) throw new Error(`Gemini embed failed: ${res.status} ${await res.text()}`);
    const j: any = await res.json();
    const values = j.embedding?.values;
    if (!Array.isArray(values)) throw new Error("Gemini embed: no values");
    return values;
  }
}

/**
 * Resolve an embedder from the environment, preferring a real provider and
 * falling back to the deterministic local hasher so the pipeline always runs.
 *   GEMINI_API_KEY -> GeminiEmbedder, else HashEmbedder.
 */
export function resolveEmbedder(env: Record<string, string | undefined> = process.env): Embedder {
  const gem = env.GEMINI_API_KEY?.trim();
  if (gem) return new GeminiEmbedder(gem);
  return new HashEmbedder();
}
