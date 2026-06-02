// Tribunal SDK — PTB builders + reads.
//
// Each builder returns a `Transaction` you sign+execute with your own keypair,
// or a convenience `*AndExecute` that signs with a provided signer. Builders are
// pure (no network) so they compose into larger PTBs.

import { SuiJsonRpcClient } from "@mysten/sui/jsonRpc";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import {
  SUI_TYPE,
  EVENTS,
  type CreateCaseArgs,
  type AssertResolutionArgs,
  type DisputeArgs,
  type ResolveDisputeArgs,
  type SettleArgs,
  type ArtifactRefInput,
} from "./types.js";

const toU8 = (b: Uint8Array) => Array.from(b);

export class TribunalClient {
  constructor(
    public readonly client: SuiJsonRpcClient,
    public readonly packageId: string,
  ) {}

  // ----- internal: build an evidence::ArtifactRef as a PTB result -----
  private buildArtifactRef(tx: Transaction, e: ArtifactRefInput) {
    return tx.moveCall({
      target: `${this.packageId}::evidence::new_ref`,
      arguments: [
        tx.pure(bcs.vector(bcs.u8()).serialize(toU8(e.blobId))),
        tx.pure(bcs.vector(bcs.u8()).serialize(toU8(e.sha256))),
        tx.pure.bool(e.sealed),
        tx.pure.u64(BigInt(e.epoch)),
      ],
    });
  }

  /**
   * create_case<T>(cap, question_hash, config_hash, memory_ns, expiry_epoch,
   *                liveness_epochs, consumer_id, ctx) -> (ID, ResolverCap)
   * The Case is shared inside the call; the returned ResolverCap is transferred
   * to `resolverCapRecipient` (required — a key+store object can't be dropped).
   */
  createCase(args: CreateCaseArgs, resolverCapRecipient: string): Transaction {
    const tx = new Transaction();
    const T = args.bondType ?? SUI_TYPE;

    // consumer_id: Option<ID>
    const consumer = args.consumerId
      ? tx.pure(bcs.option(bcs.Address).serialize(args.consumerId))
      : tx.pure(bcs.option(bcs.Address).serialize(null));

    const [, resolverCap] = tx.moveCall({
      target: `${this.packageId}::case::create_case`,
      typeArguments: [T],
      arguments: [
        tx.object(args.creatorCapId),
        tx.pure(bcs.vector(bcs.u8()).serialize(toU8(args.questionHash))),
        tx.pure(bcs.vector(bcs.u8()).serialize(toU8(args.configHash))),
        tx.pure(bcs.vector(bcs.u8()).serialize(toU8(args.memoryNs))),
        tx.pure.u64(BigInt(args.expiryEpoch)),
        tx.pure.u64(BigInt(args.livenessEpochs)),
        consumer,
      ],
    });

    // ResolverCap has key+store — must be moved out of the PTB.
    tx.transferObjects([resolverCap], tx.pure.address(resolverCapRecipient));
    return tx;
  }

  /**
   * assert_resolution<T>(case, cap, presented_config, outcome_true,
   *                      evidence_ref, bond, ctx)
   * Splits `bondAmount` off the gas coin for the bond Balance<T> (SUI case);
   * for non-SUI bonds, pass a pre-split coin via createAssertWithCoin.
   */
  assertResolution(args: AssertResolutionArgs, senderAddress: string): Transaction {
    const tx = new Transaction();
    const T = args.bondType ?? SUI_TYPE;
    const evidence = this.buildArtifactRef(tx, args.evidence);

    // bond as Balance<T>: split a coin, then coin::into_balance
    const [bondCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.bondAmount)]);
    const bondBalance = tx.moveCall({
      target: "0x2::coin::into_balance",
      typeArguments: [T],
      arguments: [bondCoin],
    });

    tx.moveCall({
      target: `${this.packageId}::case::assert_resolution`,
      typeArguments: [T],
      arguments: [
        tx.object(args.caseId),
        tx.object(args.resolverCapId),
        tx.pure(bcs.vector(bcs.u8()).serialize(toU8(args.presentedConfig))),
        tx.pure.bool(args.outcomeTrue),
        evidence,
        bondBalance,
      ],
    });
    tx.setSenderIfNotSet(senderAddress);
    return tx;
  }

  /** settle<T>(case, ctx) — finalize an undisputed, liveness-elapsed case. */
  settle(args: SettleArgs): Transaction {
    const tx = new Transaction();
    const T = args.bondType ?? SUI_TYPE;
    tx.moveCall({
      target: `${this.packageId}::case::settle`,
      typeArguments: [T],
      arguments: [tx.object(args.caseId)],
    });
    return tx;
  }

  /** dispute_resolution<T>(case, bond, ctx) -> ID. Bond must match resolver bond. */
  disputeResolution(args: DisputeArgs): Transaction {
    const tx = new Transaction();
    const T = args.bondType ?? SUI_TYPE;
    const [bondCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.bondAmount)]);
    const bondBalance = tx.moveCall({
      target: "0x2::coin::into_balance",
      typeArguments: [T],
      arguments: [bondCoin],
    });
    tx.moveCall({
      target: `${this.packageId}::dispute::dispute_resolution`,
      typeArguments: [T],
      arguments: [tx.object(args.caseId), bondBalance],
    });
    return tx;
  }

  /**
   * resolve_dispute<T>(case, dispute, cap, resolver_won, protocol_fee_bps, ctx)
   * ResolverCap-gated; pays the pot and finalizes the case.
   */
  resolveDispute(args: ResolveDisputeArgs): Transaction {
    const tx = new Transaction();
    const T = args.bondType ?? SUI_TYPE;
    tx.moveCall({
      target: `${this.packageId}::dispute::resolve_dispute`,
      typeArguments: [T],
      arguments: [
        tx.object(args.caseId),
        tx.object(args.disputeId),
        tx.object(args.resolverCapId),
        tx.pure.bool(args.resolverWon),
        tx.pure.u64(BigInt(args.protocolFeeBps)),
      ],
    });
    return tx;
  }

  // ----- reads -----

  /** Read (isSettled, outcomeTrue) via devInspect of case::get_resolution. */
  async getResolution(caseId: string, bondType = SUI_TYPE, sender = "0x0"): Promise<{
    settled: boolean;
    outcomeTrue: boolean;
  }> {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packageId}::case::get_resolution`,
      typeArguments: [bondType],
      arguments: [tx.object(caseId)],
    });
    const res = await this.client.devInspectTransactionBlock({
      sender,
      transactionBlock: tx,
    });
    const ret = res.results?.[0]?.returnValues;
    if (!ret || ret.length < 2) {
      throw new Error("get_resolution returned no values (is the caseId correct?)");
    }
    // each returnValue is [ [bytes], type ]; bool is a single byte
    const settled = bcs.bool().parse(Uint8Array.from(ret[0][0]));
    const outcomeTrue = bcs.bool().parse(Uint8Array.from(ret[1][0]));
    return { settled, outcomeTrue };
  }

  /** Fetch a Case object's parsed Move fields. */
  async getCase(caseId: string) {
    const obj = await this.client.getObject({
      id: caseId,
      options: { showContent: true, showType: true },
    });
    return obj.data;
  }

  /** Query recent events of a given Tribunal type for this package. */
  async queryEvents(kind: keyof typeof EVENTS, limit = 25) {
    return this.client.queryEvents({
      query: { MoveEventType: `${this.packageId}${EVENTS[kind]}` },
      limit,
      order: "descending",
    });
  }
}
