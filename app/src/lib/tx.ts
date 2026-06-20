// Client-side PTB builders for the Tribunal package.
//
// Ports the proven sdk/src/client.ts builders to the app's @mysten/sui 1.45 API
// (identical Transaction/bcs surface). Each returns a `Transaction` the wallet
// signs via dapp-kit's useSignAndExecuteTransaction.
//
// Capability model (verified on-chain):
//   - create_case / assert_resolution are CAP-GATED — only the deployer wallet
//     (holder of CaseCreatorCap / the case's ResolverCap) can call them.
//   - dispute_resolution is PERMISSIONLESS — any wallet with a matching bond.

import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { PACKAGE_ID, CREATOR_CAP_ID, SUI_TYPE } from "./chain";

const toU8 = (b: Uint8Array | number[]) => Array.from(b);
const u8vec = (b: Uint8Array | number[]) => bcs.vector(bcs.u8()).serialize(toU8(b));

/** sha256 in the browser (matches on-chain hash::sha2_256 and the SDK signer). */
export async function sha256Bytes(input: string | Uint8Array): Promise<Uint8Array> {
  const src = typeof input === "string" ? new TextEncoder().encode(input) : input;
  // Copy into a fresh ArrayBuffer-backed view so the type is unambiguously BufferSource.
  const data = new Uint8Array(src.length);
  data.set(src);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(digest);
}

/** Locked resolver config preimage + hash: sha256(models ‖ prompt ‖ sources). */
export async function configHash(models: string, prompt: string, sources: string) {
  const preimage = new TextEncoder().encode(`${models}|${prompt}|${sources}`);
  return { preimage, hash: await sha256Bytes(preimage) };
}

export interface CreateCaseInput {
  questionHash: Uint8Array;
  configHash: Uint8Array;
  memoryNs: Uint8Array;
  expiryEpoch: bigint | number;
  livenessEpochs: bigint | number;
  resolverCapRecipient: string; // ResolverCap (key+store) must be moved out of the PTB
  bondType?: string;
}

/**
 * create_case<T>(cap, question_hash, config_hash, memory_ns, expiry_epoch,
 *   liveness_epochs, consumer_id, ctx) -> (ID, ResolverCap)
 * Shares the Case; transfers the returned ResolverCap to `resolverCapRecipient`.
 * CAP-GATED: signer must own CREATOR_CAP_ID.
 */
export function buildCreateCase(args: CreateCaseInput): Transaction {
  const tx = new Transaction();
  const T = args.bondType ?? SUI_TYPE;
  const consumer = tx.pure(bcs.option(bcs.Address).serialize(null));

  const [, resolverCap] = tx.moveCall({
    target: `${PACKAGE_ID}::case::create_case`,
    typeArguments: [T],
    arguments: [
      tx.object(CREATOR_CAP_ID),
      tx.pure(u8vec(args.questionHash)),
      tx.pure(u8vec(args.configHash)),
      tx.pure(u8vec(args.memoryNs)),
      tx.pure.u64(BigInt(args.expiryEpoch)),
      tx.pure.u64(BigInt(args.livenessEpochs)),
      consumer,
    ],
  });
  tx.transferObjects([resolverCap], tx.pure.address(args.resolverCapRecipient));
  return tx;
}

export interface AssertInput {
  caseId: string;
  resolverCapId: string;
  presentedConfig: Uint8Array; // raw preimage; hashed on-chain, must match config_hash
  outcomeTrue: boolean;
  evidence: { blobId: Uint8Array; sha256: Uint8Array; sealed: boolean; epoch: bigint | number };
  bondAmount: bigint; // MIST
  bondType?: string;
}

/** assert_resolution<T>(case, cap, presented_config, outcome_true, evidence_ref, bond, ctx). CAP-GATED. */
export function buildAssertResolution(args: AssertInput): Transaction {
  const tx = new Transaction();
  const T = args.bondType ?? SUI_TYPE;

  const evidence = tx.moveCall({
    target: `${PACKAGE_ID}::evidence::new_ref`,
    arguments: [
      tx.pure(u8vec(args.evidence.blobId)),
      tx.pure(u8vec(args.evidence.sha256)),
      tx.pure.bool(args.evidence.sealed),
      tx.pure.u64(BigInt(args.evidence.epoch)),
    ],
  });

  const [bondCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.bondAmount)]);
  const bondBalance = tx.moveCall({
    target: "0x2::coin::into_balance",
    typeArguments: [T],
    arguments: [bondCoin],
  });

  tx.moveCall({
    target: `${PACKAGE_ID}::case::assert_resolution`,
    typeArguments: [T],
    arguments: [
      tx.object(args.caseId),
      tx.object(args.resolverCapId),
      tx.pure(u8vec(args.presentedConfig)),
      tx.pure.bool(args.outcomeTrue),
      evidence,
      bondBalance,
    ],
  });
  return tx;
}

/** dispute_resolution<T>(case, bond, ctx) -> ID. PERMISSIONLESS; bond must match resolver bond. */
export function buildDispute(caseId: string, bondAmount: bigint, bondType = SUI_TYPE): Transaction {
  const tx = new Transaction();
  const [bondCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(bondAmount)]);
  const bondBalance = tx.moveCall({
    target: "0x2::coin::into_balance",
    typeArguments: [bondType],
    arguments: [bondCoin],
  });
  tx.moveCall({
    target: `${PACKAGE_ID}::dispute::dispute_resolution`,
    typeArguments: [bondType],
    arguments: [tx.object(caseId), bondBalance],
  });
  return tx;
}

/** Extract a created object id by type-suffix from execution objectChanges. */
export function findCreated(res: any, suffix: string): string | undefined {
  const c = (res?.objectChanges ?? []).find(
    (x: any) => x.type === "created" && String(x.objectType).includes(suffix),
  );
  return c?.objectId;
}
