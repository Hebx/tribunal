// Tribunal memory encryption layer — the SealAdapter contract + concrete tiers.
//
// The memory layer treats entry bytes as opaque (see index.ts), so encryption
// plugs in transparently between the typed entry and the Walrus Quilt write.
// This is the seam the on-chain `evidence::can_decrypt` policy is designed
// around: in-progress deliberation is confidential to the resolver; once a case
// is settled the verdict is PUBLICLY auditable.
//
// Three tiers, all behind one interface so the production path is a drop-in:
//
//   1. PassthroughSeal — no-op. Keeps the demo output human-readable and lets a
//      verdict/case_law entry stay public on Walrus (the transparency half of
//      the policy). This is the correct adapter for PUBLIC entries.
//
//   2. AesSeal — real AES-256-GCM authenticated encryption with a key derived
//      per Seal identity (namespace ‖ entry_id) via HKDF from a master secret.
//      Bytes on public Walrus are genuine ciphertext + auth tag; tampering is
//      detected on decrypt. This is the working confidentiality tier for the
//      MVP — sensitive deliberation is not plaintext on a public network.
//
//   3. (Production) Seal threshold encryption via @mysten/seal SealClient. Drops
//      in behind this same interface once the on-chain `seal_approve` entry
//      function is published and key-server objects exist on the target network.
//      Decryption is then gated by the on-chain policy (case participation /
//      settlement) and evaluated by a t-of-n key-server committee — no single
//      party holds the key. See reference/seal-production.md for the wiring.
//
// Identity convention (matches evidence::is_prefix): a Seal identity is
// `${namespace}:${entryId}`, so one namespace covers many sealed entries while
// every identity still maps to exactly one case.

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

export interface SealAdapter {
  readonly name: string;
  /** Encrypt plaintext bytes for the given Seal identity (namespace:entryId). */
  encrypt(plaintext: Uint8Array, sealId: string): Promise<Uint8Array>;
  /** Decrypt ciphertext bytes for the given Seal identity. */
  decrypt(ciphertext: Uint8Array, sealId: string): Promise<Uint8Array>;
}

/**
 * No-op adapter. Use for PUBLIC entries (settled verdicts, case law) where the
 * thesis requires open auditability. Default so existing flows are unchanged.
 */
export class PassthroughSeal implements SealAdapter {
  readonly name = "passthrough";
  async encrypt(plaintext: Uint8Array): Promise<Uint8Array> {
    return plaintext;
  }
  async decrypt(ciphertext: Uint8Array): Promise<Uint8Array> {
    return ciphertext;
  }
}

// AesSeal wire format (all binary, prepended to ciphertext):
//   magic  : 4 bytes  "TSL1"  (Tribunal Seal v1) — lets readers detect encryption
//   iv     : 12 bytes (GCM nonce, random per message)
//   tag    : 16 bytes (GCM auth tag)
//   data   : N bytes  (ciphertext)
const MAGIC = Buffer.from("TSL1", "ascii");
const IV_LEN = 12;
const TAG_LEN = 16;
const HEADER_LEN = MAGIC.length + IV_LEN + TAG_LEN;

/**
 * Real authenticated encryption for confidential memory entries.
 *
 * Per-identity key = HKDF-SHA256(masterSecret, salt=sealId, info="tribunal-seal").
 * That binds every entry's key to its namespace+id, so leaking one derived key
 * does not expose other cases, and the master secret never touches Walrus.
 *
 * NOTE: this is symmetric (the resolver holds the master secret). It delivers
 * confidentiality-at-rest on public Walrus today. The threshold-Seal tier
 * (no single key holder, on-chain-gated decryption) is the production upgrade
 * behind the same interface.
 */
export class AesSeal implements SealAdapter {
  readonly name = "aes-256-gcm";
  private readonly master: Buffer;

  constructor(masterSecret: string | Uint8Array) {
    const buf = typeof masterSecret === "string" ? Buffer.from(masterSecret, "utf8") : Buffer.from(masterSecret);
    if (buf.length < 16) throw new Error("AesSeal: master secret too short (need >= 16 bytes)");
    this.master = buf;
  }

  private keyFor(sealId: string): Buffer {
    // HKDF -> 32-byte AES-256 key, salted by the Seal identity.
    const derived = hkdfSync("sha256", this.master, Buffer.from(sealId, "utf8"), "tribunal-seal", 32);
    return Buffer.from(derived);
  }

  async encrypt(plaintext: Uint8Array, sealId: string): Promise<Uint8Array> {
    const key = this.keyFor(sealId);
    const iv = randomBytes(IV_LEN);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([cipher.update(Buffer.from(plaintext)), cipher.final()]);
    const tag = cipher.getAuthTag();
    return new Uint8Array(Buffer.concat([MAGIC, iv, tag, enc]));
  }

  async decrypt(ciphertext: Uint8Array, sealId: string): Promise<Uint8Array> {
    const buf = Buffer.from(ciphertext);
    if (buf.length < HEADER_LEN || !buf.subarray(0, MAGIC.length).equals(MAGIC)) {
      // Not Tribunal-sealed (e.g. a public passthrough entry) — return as-is.
      return ciphertext;
    }
    const iv = buf.subarray(MAGIC.length, MAGIC.length + IV_LEN);
    const tag = buf.subarray(MAGIC.length + IV_LEN, HEADER_LEN);
    const data = buf.subarray(HEADER_LEN);
    const key = this.keyFor(sealId);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(data), decipher.final()]); // throws on tamper
    return new Uint8Array(dec);
  }
}

/** True if bytes carry the Tribunal-Seal envelope (i.e. are encrypted). */
export function isSealed(bytes: Uint8Array): boolean {
  return bytes.length >= MAGIC.length && Buffer.from(bytes.subarray(0, MAGIC.length)).equals(MAGIC);
}

/**
 * Resolve a Seal adapter from the environment.
 *   TRIBUNAL_SEAL_SECRET set -> AesSeal (real confidentiality at rest)
 *   else                     -> PassthroughSeal (public, readable)
 */
export function resolveSeal(env: Record<string, string | undefined> = process.env): SealAdapter {
  const secret = env.TRIBUNAL_SEAL_SECRET?.trim();
  if (secret && secret.length >= 16) return new AesSeal(secret);
  return new PassthroughSeal();
}
