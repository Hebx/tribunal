// On-chain deployment coordinates + event identifiers.
// Mirrors ../../../deployment.testnet.json (the live Tribunal package).

export const NETWORK = (process.env.NEXT_PUBLIC_SUI_NETWORK ?? "testnet") as
  | "testnet"
  | "mainnet"
  | "devnet"
  | "localnet";

export const PACKAGE_ID =
  process.env.NEXT_PUBLIC_TRIBUNAL_PACKAGE_ID ??
  "0x2fcdcc486214dcee3a86facddfbbb02e5c47f0a72472b79e856e710725715757";

export const CREATOR_CAP_ID =
  process.env.NEXT_PUBLIC_TRIBUNAL_CREATOR_CAP ??
  "0x93bf5289e187944eb377d82624c06d3e2eaf8d5a650a66fa9668b13fca77a42b";

/** Deployer address holding CaseCreatorCap — gates create_case / assert_resolution. */
export const CAP_HOLDER =
  process.env.NEXT_PUBLIC_TRIBUNAL_CAP_HOLDER ??
  "0x36939a27ef7eb60fa31aae905f2f7cbed8940c98c8178affc8ae154acabbc1d4";

export const PUBLISH_DIGEST = "3XTZqjrLrXGxtiFu9obhitqk1qHb9dvP2Pn45f8X91Xc";

/** Event type suffixes emitted by the package. */
export const EVENTS = {
  CaseCreated: "::case::CaseCreated",
  ResolutionAsserted: "::case::ResolutionAsserted",
  CaseSettled: "::case::CaseSettled",
  ResolutionDisputed: "::dispute::ResolutionDisputed",
  DisputeResolved: "::dispute::DisputeResolved",
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
