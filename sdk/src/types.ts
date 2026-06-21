// Tribunal SDK — shared types + config.
//
// The on-chain Move entry signatures these builders target (package `tribunal`):
//   case::create_case<T>(cap, question_hash, config_hash, memory_ns,
//                        expiry_epoch, liveness_epochs, consumer_id, ctx)
//                        -> (ID, ResolverCap)   [shares the Case]
//   case::assert_resolution<T>(case, cap, presented_config, outcome_true,
//                              evidence_ref, bond, ctx)
//   case::settle<T>(case, ctx)
//   dispute::dispute_resolution<T>(case, bond, ctx) -> ID
//   dispute::resolve_dispute<T>(case, dispute, cap, resolver_won,
//                               protocol_fee_bps, ctx)
//   evidence::new_ref(blob_id, sha256, sealed, epoch) -> ArtifactRef
//
// `T` is the bond asset type; defaults to SUI (0x2::sui::SUI).

export const SUI_TYPE = "0x2::sui::SUI";

/** Resolved deployment coordinates, written by the deploy script. */
export interface TribunalDeployment {
  network: "testnet" | "mainnet" | "devnet" | "localnet";
  packageId: string;
  /** CaseCreatorCap object id minted to the publisher by `init`. */
  creatorCapId: string;
  /** ReputationCap object id minted to the publisher by identity::init (v2). */
  reputationCapId?: string;
  publishedAt: string;
  digest: string;
}

/** Inputs for creating a case. Hashes are raw bytes (number[] / Uint8Array). */
export interface CreateCaseArgs {
  creatorCapId: string;
  questionHash: Uint8Array;
  configHash: Uint8Array;
  memoryNs: Uint8Array;
  expiryEpoch: bigint | number;
  livenessEpochs: bigint | number;
  consumerId?: string | null;
  /** Bond coin type; defaults to SUI. */
  bondType?: string;
}

export interface AssertResolutionArgs {
  caseId: string;
  resolverCapId: string;
  /** Raw (model_id ‖ prompt ‖ data_sources) preimage; hashed on-chain. */
  presentedConfig: Uint8Array;
  outcomeTrue: boolean;
  evidence: ArtifactRefInput;
  /** Bond amount in MIST (or the coin's base unit). */
  bondAmount: bigint;
  bondType?: string;
}

export interface ArtifactRefInput {
  blobId: Uint8Array;
  sha256: Uint8Array;
  sealed: boolean;
  epoch: bigint | number;
}

export interface DisputeArgs {
  caseId: string;
  bondAmount: bigint;
  bondType?: string;
}

export interface ResolveDisputeArgs {
  caseId: string;
  disputeId: string;
  resolverCapId: string;
  resolverWon: boolean;
  protocolFeeBps: bigint | number;
  bondType?: string;
}

export interface SettleArgs {
  caseId: string;
  bondType?: string;
}

/** Event type-name suffixes emitted by the package. */
export const EVENTS = {
  CaseCreated: "::case::CaseCreated",
  ResolutionAsserted: "::case::ResolutionAsserted",
  CaseSettled: "::case::CaseSettled",
  ResolutionDisputed: "::dispute::ResolutionDisputed",
  DisputeResolved: "::dispute::DisputeResolved",
} as const;
