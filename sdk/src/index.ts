export * from "./types.js";
export { TribunalClient } from "./client.js";
export { loadSigner, configHash, sha256Bytes } from "./signer.js";

// Memory layer (M3c) — verifiable agent memory on Walrus + committee runner
export {
  WalrusStore,
  TESTNET_WALRUS,
  type WalrusEndpoints,
  type QuiltEntryInput,
  type QuiltWriteResult,
  type BlobWriteResult,
} from "./memory/walrus.js";
export {
  TribunalMemory,
  type MemoryEntry,
  type EntryKind,
  type IndexRow,
  type RecallHit,
} from "./memory/index.js";
export {
  type Embedder,
  HashEmbedder,
  GeminiEmbedder,
  resolveEmbedder,
  cosine,
} from "./memory/embeddings.js";
export {
  Committee,
  type CommitteeConfig,
  type ModelVote,
  type Verdict,
} from "./memory/committee.js";
export {
  type SealAdapter,
  PassthroughSeal,
  AesSeal,
  isSealed,
  resolveSeal,
} from "./memory/seal.js";
export { loadEnv } from "./memory/env.js";

// Agents (v2) — bundled assert+record PTBs for the persona-debate pipeline
export {
  buildAssertAndRecord,
  buildOverturnOutcomes,
  assertAndRecordOutcomes,
  type ParticipantStake,
  type AssertAndRecordArgs,
} from "./agents/outcomes.js";

// Stake (v2 M5) — opt-in skin-in-the-game pools, claim-on-settlement
export {
  buildCreatePool,
  buildStake,
  buildClaim,
  type CreatePoolArgs,
  type StakeArgs,
  type ClaimArgs,
} from "./agents/stake.js";

// Typed verdict-bundle persistence on Walrus (v2 M4.3)
export {
  persistVerdictBundle,
  type VerdictBundleLike,
  type PersistedBundle,
} from "./memory/verdict.js";
