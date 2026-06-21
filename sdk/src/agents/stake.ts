// Stake PTB builders for tribunal::stake.
//
// All builders are pure (no network). The on-chain Move signatures targeted:
//   stake::create_pool<T>(case: &Case<T>, ctx) -> ID  [shares the pool]
//   stake::stake<T>(pool, agent_card, side_true, payment: Coin<T>, ctx)
//   stake::claim_winnings<T>(pool, case, receipt, ctx)

import { Transaction } from "@mysten/sui/transactions";
import { SUI_TYPE } from "../types.js";

export interface CreatePoolArgs {
  caseId: string;
  bondType?: string;
}

export interface StakeArgs {
  poolId: string;
  agentCardId: string;
  /** true = YES advocate, false = NO advocate. */
  sideTrue: boolean;
  /** Stake amount in MIST (or the coin's base unit). */
  amount: bigint;
  bondType?: string;
}

export interface ClaimArgs {
  poolId: string;
  caseId: string;
  receiptId: string;
  bondType?: string;
}

/** Create the stake pool bound to a case. Shares the pool. */
export function buildCreatePool(pkgId: string, args: CreatePoolArgs): Transaction {
  const tx = new Transaction();
  const T = args.bondType ?? SUI_TYPE;
  tx.moveCall({
    target: `${pkgId}::stake::create_pool`,
    typeArguments: [T],
    arguments: [tx.object(args.caseId)],
  });
  return tx;
}

/**
 * Stake `amount` on `sideTrue`. Splits the stake coin off the signer's gas
 * coin (SUI flow); for non-SUI bonds, supply a pre-split coin via buildStakeWithCoin.
 */
export function buildStake(pkgId: string, args: StakeArgs): Transaction {
  const tx = new Transaction();
  const T = args.bondType ?? SUI_TYPE;
  const [stakeCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.amount)]);
  tx.moveCall({
    target: `${pkgId}::stake::stake`,
    typeArguments: [T],
    arguments: [
      tx.object(args.poolId),
      tx.object(args.agentCardId),
      tx.pure.bool(args.sideTrue),
      stakeCoin,
    ],
  });
  return tx;
}

/** Claim winnings; consumes the StakeReceipt. */
export function buildClaim(pkgId: string, args: ClaimArgs): Transaction {
  const tx = new Transaction();
  const T = args.bondType ?? SUI_TYPE;
  tx.moveCall({
    target: `${pkgId}::stake::claim_winnings`,
    typeArguments: [T],
    arguments: [
      tx.object(args.poolId),
      tx.object(args.caseId),
      tx.object(args.receiptId),
    ],
  });
  return tx;
}
