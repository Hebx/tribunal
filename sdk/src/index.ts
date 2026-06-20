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
