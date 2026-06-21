// Verdict-bundle persistence — app-side adapter over the SDK memory layer.
//
// Builds a TribunalMemory keyed to the case's stable namespace and persists
// the verdict bundle as a typed Walrus Quilt with 6 entries:
//   - debate_transcript  (sealed until settle)
//   - jury_deliberation  (sealed until settle)
//   - guardrail_decision (public — pins guardrailConfigHash)
//   - verdict            (public — pins both configHashes)
//   - case_law           (public — short precedent summary)
//   - provenance         (public — full v3 audit row)
//
// PERSISTENCE IS BEST-EFFORT. The resolver returns the verdict regardless;
// if Walrus is unreachable, the response carries { audit: { error } } and
// the verdict still ships. The on-chain anchor (configHashHex +
// guardrailConfigHash) is the tamper-evident root; the Quilt is the trail.
//
// Walrus endpoint config:
//   WALRUS_PUBLISHER  / WALRUS_AGGREGATOR
// or fall back to Mysten testnet defaults baked into the SDK.

import { TribunalMemory } from "@tribunal/sdk/memory";
import { WalrusStore, type WalrusEndpoints } from "@tribunal/sdk/memory/walrus";
import { HashEmbedder } from "@tribunal/sdk/memory/embeddings";
import { persistVerdictBundle, type VerdictBundleLike, type PersistedBundle } from "@tribunal/sdk/memory/verdict";
import type { VerdictBundle } from "./resolve";

/** What the audit-trail panel needs from a successful persist. */
export interface PersistResult {
  quiltId: string;
  /** Map kind → quilt patch identifier (for aggregator-fetch). */
  patches: Record<string, string>;
  /** Walrus aggregator base — UI uses it to read each patch. */
  aggregator: string;
  /** Stable namespace for this case (used to scope future recall queries). */
  namespace: string;
}

/** Compose a stable namespace from the caseId. The on-chain Case object
 *  carries a `memory_ns` field in future iterations; until that wiring lands,
 *  we derive a deterministic string from the caseId itself. */
export function namespaceForCase(caseId: string): string {
  return `walrus-ns://tribunal/case/${caseId}`;
}

function endpoints(): WalrusEndpoints | undefined {
  const pub = process.env.WALRUS_PUBLISHER;
  const agg = process.env.WALRUS_AGGREGATOR;
  if (!pub && !agg) return undefined;
  return {
    publisher: pub ?? "https://publisher.walrus-testnet.walrus.space",
    aggregator: agg ?? "https://aggregator.walrus-testnet.walrus.space",
  };
}

/**
 * Persist a verdict bundle. Never throws — failure is returned as
 * { ok: false, error }. The caller logs and degrades gracefully.
 */
export async function persistBundle(
  caseId: string,
  bundle: VerdictBundle,
): Promise<{ ok: true; persisted: PersistResult } | { ok: false; error: string }> {
  try {
    const ep = endpoints();
    const walrus = ep ? new WalrusStore(ep) : new WalrusStore();
    const namespace = namespaceForCase(caseId);
    // Hash embedder is deterministic and fast; no LLM/api required so we never
    // gate verdict persistence on a separate embedding service being up.
    const memory = new TribunalMemory(namespace, walrus, new HashEmbedder());

    const result: PersistedBundle = await persistVerdictBundle(
      memory,
      caseId,
      bundle as unknown as VerdictBundleLike,
    );

    return {
      ok: true,
      persisted: {
        quiltId: result.quiltId,
        patches: result.patches,
        aggregator: ep?.aggregator ?? "https://aggregator.walrus-testnet.walrus.space",
        namespace,
      },
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
