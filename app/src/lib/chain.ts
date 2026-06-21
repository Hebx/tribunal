// On-chain deployment coordinates + event identifiers.
// Mirrors ../../../deployment.testnet.json (the live Tribunal package).

export const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as
  | "testnet"
  | "mainnet"
  | "devnet"
  | "localnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_TRIBUNAL_PACKAGE_ID ??
  "0x2c8697803b3eec5b8e0e0391a4f1dacb0760a904ed67add840d94452b1cd3750";

export const CREATOR_CAP_ID =
  process.env.NEXT_PUBLIC_TRIBUNAL_CREATOR_CAP ??
  "0x56bc017bbac4b09e096bab13f59ae1c0a0fa899a1777d6dec919bfd39a560283";

/** ReputationCap — gates identity::record_outcome (held by the resolver). */
export const REPUTATION_CAP_ID =
  process.env.NEXT_PUBLIC_TRIBUNAL_REPUTATION_CAP ??
  "0x50535871e26ecec2d33e589909729493179bcc7727712c996fb9041f486999a7";

/** Deployer address holding CaseCreatorCap — gates create_case / assert_resolution. */
export const CAP_HOLDER =
  process.env.NEXT_PUBLIC_TRIBUNAL_CAP_HOLDER ??
  "0x36939a27ef7eb60fa31aae905f2f7cbed8940c98c8178affc8ae154acabbc1d4";

export const PUBLISH_DIGEST = "BvtYpFAZ9EyDSLVMJatwuYYHhPyZ7cLf8J8TvkuPAhGB";

/** Event type suffixes emitted by the package. */
export const EVENTS = {
  CaseCreated: "::case::CaseCreated",
  ResolutionAsserted: "::case::ResolutionAsserted",
  CaseSettled: "::case::CaseSettled",
  ResolutionDisputed: "::dispute::ResolutionDisputed",
  DisputeResolved: "::dispute::DisputeResolved",
  AgentRegistered: "::identity::AgentRegistered",
  ScoreUpdated: "::identity::ScoreUpdated",
  PoolCreated: "::stake::PoolCreated",
  Staked: "::stake::Staked",
  WinningsClaimed: "::stake::WinningsClaimed",
} as const;

export const SUI_TYPE = "0x2::sui::SUI";

/** Demo mode fills the feed with seeded battles; the live battle flow always
 *  hits the real committee + Walrus regardless. */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE !== "false";

/** Block explorer link helpers (SuiScan testnet). */
export function explorerTx(digest: string): string {
  return `https://suiscan.xyz/${NETWORK}/tx/${digest}`;
}
export function explorerObject(id: string): string {
  return `https://suiscan.xyz/${NETWORK}/object/${id}`;
}
export const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  "https://aggregator.walrus-testnet.walrus.space";
