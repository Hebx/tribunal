// On-chain deployment coordinates + event identifiers.
// Mirrors DEPLOYMENTS.md → v3 first-staker advocacy + weighted-claim package.

export const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as
  | "testnet"
  | "mainnet"
  | "devnet"
  | "localnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_TRIBUNAL_PACKAGE_ID ??
  "0x88eeb06e6d45c0edcbbaf965500d5429dc4d43a76072962560700d1a77efdd89";

export const CREATOR_CAP_ID =
  process.env.NEXT_PUBLIC_TRIBUNAL_CREATOR_CAP ??
  "0xa93b590ab0e9983d30dfe2af4e73673d80cf6ae44dfe6223831af635aad1988e";

/** ReputationCap — gates identity::record_outcome (held by the resolver). */
export const REPUTATION_CAP_ID =
  process.env.NEXT_PUBLIC_TRIBUNAL_REPUTATION_CAP ??
  "0x945e4f01cf40b40d5304e51b965594d7664641e1f12160931cd1887e557bcaed";

/** Deployer address holding CaseCreatorCap — gates create_case / assert_resolution. */
export const CAP_HOLDER =
  process.env.NEXT_PUBLIC_TRIBUNAL_CAP_HOLDER ??
  "0x36939a27ef7eb60fa31aae905f2f7cbed8940c98c8178affc8ae154acabbc1d4";

export const PUBLISH_DIGEST = "2K8NvNKu84n7gfEyNuyPQPpmVMckSZ7y2Sau5F9anYsf";

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
export function explorerAddress(addr: string): string {
  return `https://suiscan.xyz/${NETWORK}/account/${addr}`;
}
export const WALRUS_AGGREGATOR =
  process.env.NEXT_PUBLIC_WALRUS_AGGREGATOR ??
  "https://aggregator.walrus-testnet.walrus.space";
