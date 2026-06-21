// Verdict → on-chain anchor + outcome receipts (v2 M4.2).
//
// One PTB that posts the resolver's asserted outcome AND scores every
// participating agent in the same transaction. Atomic by construction: if any
// part aborts (config-hash mismatch, cooldown, wrong cap) the whole bundle
// reverts, so the chain never sees a half-applied verdict.
//
// The reputation half is gated by the `ReputationCap` (held by the resolver),
// so agents cannot self-mint score. An agent is scored as `won = true` iff its
// staked side matched the binding outcome; an `overturned` flag is reserved
// for the dispute-resolved path (a previously-won verdict that later flipped).

import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import type { TribunalClient } from "../client.js";
import {
  SUI_TYPE,
  type AssertResolutionArgs,
  type ArtifactRefInput,
} from "../types.js";

/** An agent that participated in a debate, with the side it argued. */
export interface ParticipantStake {
  /** AgentCard object id. */
  agentCardId: string;
  /** Side this agent argued: `true` = YES/affirmer, `false` = NO/denier. */
  argued: boolean;
}

export interface AssertAndRecordArgs {
  caseId: string;
  resolverCapId: string;
  reputationCapId: string;
  /** Raw (model_id ‖ prompt ‖ data_sources) preimage; hashed on-chain. */
  presentedConfig: Uint8Array;
  /** Binding verdict from the guardrail judge. */
  outcomeTrue: boolean;
  evidence: ArtifactRefInput;
  /** Resolver bond in MIST (SUI default). */
  bondAmount: bigint;
  /** Participants whose AgentCards to score. */
  participants: ParticipantStake[];
  bondType?: string;
}

const toU8 = (b: Uint8Array) => Array.from(b);

/**
 * Build a single PTB that asserts the verdict AND records outcome receipts for
 * each participant. The two halves succeed or revert together.
 */
export function buildAssertAndRecord(
  pkgId: string,
  args: AssertAndRecordArgs,
  sender: string,
): Transaction {
  const tx = new Transaction();
  const T = args.bondType ?? SUI_TYPE;

  // 1) evidence::new_ref → ArtifactRef
  const evidence = tx.moveCall({
    target: `${pkgId}::evidence::new_ref`,
    arguments: [
      tx.pure(bcs.vector(bcs.u8()).serialize(toU8(args.evidence.blobId))),
      tx.pure(bcs.vector(bcs.u8()).serialize(toU8(args.evidence.sha256))),
      tx.pure.bool(args.evidence.sealed),
      tx.pure.u64(BigInt(args.evidence.epoch)),
    ],
  });

  // 2) bond as Balance<T>
  const [bondCoin] = tx.splitCoins(tx.gas, [tx.pure.u64(args.bondAmount)]);
  const bondBalance = tx.moveCall({
    target: "0x2::coin::into_balance",
    typeArguments: [T],
    arguments: [bondCoin],
  });

  // 3) case::assert_resolution
  tx.moveCall({
    target: `${pkgId}::case::assert_resolution`,
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

  // 4) identity::record_outcome per participant — same tx, same gas, atomic
  for (const p of args.participants) {
    const won = p.argued === args.outcomeTrue;
    tx.moveCall({
      target: `${pkgId}::identity::record_outcome`,
      arguments: [
        tx.object(args.reputationCapId),
        tx.object(p.agentCardId),
        tx.pure.bool(won),
        tx.pure.bool(false), // overturned is set only by the dispute-resolved path
      ],
    });
  }

  tx.setSenderIfNotSet(sender);
  return tx;
}

/**
 * Build a PTB that records dispute-resolved overturn outcomes. Use after
 * `resolve_dispute` flips the verdict: the side that originally won is scored
 * `overturned=true`, and the side that prevailed on dispute is scored as a win.
 *
 * Note: this is a SEPARATE PTB, posted after the dispute resolution, because
 * `resolve_dispute` itself is a single-cap call and the cooldown rules mean
 * the same epoch's prior win/loss must already be on-chain before we can
 * stamp the overturn.
 */
export function buildOverturnOutcomes(
  pkgId: string,
  reputationCapId: string,
  participants: ParticipantStake[],
  finalOutcomeTrue: boolean,
): Transaction {
  const tx = new Transaction();
  for (const p of participants) {
    const wonOnDispute = p.argued === finalOutcomeTrue;
    // The original winner (who now lost on dispute) gets overturned=true.
    // The original loser (who now wins on dispute) gets a clean win.
    const overturned = !wonOnDispute; // they had been on the winning side, now flipped
    tx.moveCall({
      target: `${pkgId}::identity::record_outcome`,
      arguments: [
        tx.object(reputationCapId),
        tx.object(p.agentCardId),
        tx.pure.bool(wonOnDispute),
        tx.pure.bool(overturned),
      ],
    });
  }
  return tx;
}

/**
 * Convenience over a TribunalClient: same builder, package id resolved from
 * the client.
 */
export function assertAndRecordOutcomes(
  client: TribunalClient,
  args: AssertAndRecordArgs,
  sender: string,
): Transaction {
  return buildAssertAndRecord(client.packageId, args, sender);
}

// Also export an args shape compatible with the existing AssertResolutionArgs
// so the v1 callsite in `app/src/lib/server/...` can switch without churn.
export type { AssertResolutionArgs };
