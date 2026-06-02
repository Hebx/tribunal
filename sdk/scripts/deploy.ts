// Publish the Tribunal Move package to the active Sui network and capture the
// package id + the CaseCreatorCap minted to the publisher by `init`.
//
//   cd sdk && npm run deploy            # uses CLI keystore key + testnet
//   TRIBUNAL_NETWORK=testnet npm run deploy
//
// Writes ../deployment.<network>.json (gitignored).

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { loadSigner } from "../src/signer.js";
import type { TribunalDeployment } from "../src/types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const NETWORK = (process.env.TRIBUNAL_NETWORK ?? "testnet") as TribunalDeployment["network"];
const MOVE_DIR = join(__dirname, "..", "..", "move");

async function main() {
  const signer = loadSigner();
  const address = signer.getPublicKey().toSuiAddress();
  const client = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl(NETWORK),
    network: NETWORK,
  });
  console.log(`Publisher: ${address}  network: ${NETWORK}`);

  // Compile to bytecode + deps via the sui CLI (most reliable build path).
  // localnet has no published framework, so resolve deps against testnet.
  const buildEnv = NETWORK === "mainnet" ? "mainnet" : "testnet";
  console.log(`Building package… (build-env: ${buildEnv})`);
  const out = execFileSync(
    "sui",
    [
      "move",
      "build",
      "--dump-bytecode-as-base64",
      "--build-env",
      buildEnv,
      "--path",
      MOVE_DIR,
    ],
    { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
  );
  const { modules, dependencies } = JSON.parse(out);

  const tx = new Transaction();
  const [upgradeCap] = tx.publish({ modules, dependencies });
  tx.transferObjects([upgradeCap], tx.pure.address(address));

  console.log("Publishing…");
  const res = await client.signAndExecuteTransaction({
    signer,
    transaction: tx,
    options: { showEffects: true, showObjectChanges: true },
  });
  await client.waitForTransaction({ digest: res.digest });

  const changes = res.objectChanges ?? [];
  const published = changes.find((c) => c.type === "published") as
    | { packageId: string }
    | undefined;
  if (!published) throw new Error("No published package in object changes");
  const packageId = published.packageId;

  const creatorCap = changes.find(
    (c) =>
      c.type === "created" &&
      typeof (c as any).objectType === "string" &&
      (c as any).objectType.endsWith("::case::CaseCreatorCap"),
  ) as { objectId: string } | undefined;
  if (!creatorCap) throw new Error("CaseCreatorCap not found in object changes");

  const deployment: TribunalDeployment = {
    network: NETWORK,
    packageId,
    creatorCapId: creatorCap.objectId,
    publishedAt: new Date().toISOString(),
    digest: res.digest,
  };
  const outPath = join(__dirname, "..", "..", `deployment.${NETWORK}.json`);
  writeFileSync(outPath, JSON.stringify(deployment, null, 2) + "\n");

  console.log("\n=== Deployed ===");
  console.log(`packageId    : ${packageId}`);
  console.log(`creatorCapId : ${creatorCap.objectId}`);
  console.log(`digest       : ${res.digest}`);
  console.log(`written      : ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
