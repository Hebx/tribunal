// On-chain deployment coordinates + event identifiers.
// Mirrors ../../../deployment.testnet.json (the live Tribunal package).

export const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as
  | "testnet"
  | "mainnet"
  | "devnet"
  | "localnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_TRIBUNAL_PACKAGE_ID ??
  "0x2076d59aad67a1c8305d750ce9c0853238b094655ac179b9435402c73d872d1c";

export const CREATOR_CAP_ID =
  process.env.NEXT_PUBLIC_TRIBUNAL_CREATOR_CAP ??
  "0xf5043e63d909aba053c1418f6cd85b4e36a6bb05031039191397275504d479b1";

/** ReputationCap — gates identity::record_outcome (held by the resolver). */
export const REPUTATION_CAP_ID =
  process.env.NEXT_PUBLIC_TRIBUNAL_REPUTATION_CAP ??
  "0x89ec20f484192962fcc264ba13c83f4aa98e5bbbe6af21aa400a1d721e1df859";

/** Deployer address holding CaseCreatorCap — gates create_case / assert_resolution. */
export const CAP_HOLDER =
  process.env.NEXT_PUBLIC_TRIBUNAL_CAP_HOLDER ??
  "0x36939a27ef7eb60fa31aae905f2f7cbed8940c98c8178affc8ae154acabbc1d4";

export const PUBLISH_DIGEST = "HJhwTiZCqHDpUPqBWUN8bV9iQk8J4dWc6CsBEh8omoLW";

/** Event type suffixes emitted by the package. */
export const EVENTS = {
  CaseCreated: "::case::CaseCreated",
  ResolutionAsserted: "::case::ResolutionAsserted",
  CaseSettled: "::case::CaseSettled",
  ResolutionDisputed: "::dispute::ResolutionDisputed",
  DisputeResolved: "::dispute::DisputeResolved",
  AgentRegistered: "::identity::AgentRegistered",
  ScoreUpdated: "::identity::ScoreUpdated",
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
