// Signer + hashing helpers.
//
// Key sourcing priority:
//   1. TRIBUNAL_PRIVKEY env (suiprivkey1... bech32, the modern export format)
//   2. The Sui CLI keystore (~/.sui/sui_config/sui.keystore) active key
// This lets scripts reuse the same testnet address the CLI deploys with, with
// no key material committed to the repo.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import type { Signer } from "@mysten/sui/cryptography";

/** sha256(bytes) -> 32-byte Uint8Array. Matches on-chain hash::sha2_256. */
export function sha256Bytes(input: Uint8Array | string): Uint8Array {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return Uint8Array.from(createHash("sha256").update(buf).digest());
}

/**
 * Build the locked resolver config hash: sha256(model_id ‖ prompt ‖ sources).
 * The `presented_config` preimage at assert time MUST be the byte-identical
 * concatenation used here, or the on-chain equality check aborts.
 */
export function configHash(modelId: string, prompt: string, sources: string): {
  preimage: Uint8Array;
  hash: Uint8Array;
} {
  const preimage = Buffer.from(`${modelId}|${prompt}|${sources}`, "utf8");
  return { preimage: Uint8Array.from(preimage), hash: sha256Bytes(preimage) };
}

/** Load an Ed25519 signer from env or the CLI keystore (first/active key). */
export function loadSigner(): Signer {
  const envKey = process.env.TRIBUNAL_PRIVKEY?.trim();
  if (envKey) {
    const { scheme, secretKey } = decodeSuiPrivateKey(envKey);
    if (scheme !== "ED25519") {
      throw new Error(`Unsupported key schema ${scheme}; expected ED25519`);
    }
    return Ed25519Keypair.fromSecretKey(secretKey);
  }

  // Fall back to the CLI keystore: it's a JSON array of base64 flag||privkey.
  const ksPath = join(homedir(), ".sui", "sui_config", "sui.keystore");
  let raw: string;
  try {
    raw = readFileSync(ksPath, "utf8");
  } catch {
    throw new Error(
      `No TRIBUNAL_PRIVKEY env and no keystore at ${ksPath}. ` +
        `Set TRIBUNAL_PRIVKEY=suiprivkey1... or run 'sui client'.`,
    );
  }
  const keys: string[] = JSON.parse(raw);
  if (!keys.length) throw new Error("Empty Sui keystore");
  // Each entry is base64(flag || 32-byte secret); flag 0x00 = Ed25519.
  const bytes = Buffer.from(keys[0], "base64");
  if (bytes[0] !== 0x00) {
    throw new Error("First keystore key is not Ed25519; set TRIBUNAL_PRIVKEY explicitly");
  }
  return Ed25519Keypair.fromSecretKey(Uint8Array.from(bytes.subarray(1)));
}
