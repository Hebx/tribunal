import type { Battle } from "./types";

// Seed feed — REAL v3 testnet cases only.
//
// Both battles below are anchored to live `Case<SUI>` objects on the v3
// Tribunal package (DEPLOYMENTS.md → "v3 — first-staker advocacy + weighted
// claim"). Every `caseId`, `stakePoolId`, `txDigest`, `configHashHex`, and
// `evidenceQuiltId` corresponds to on-chain / Walrus state the auditor can
// fetch and verify. Anything explained in plain English (challenge / criteria
// / evidence / argument text) is editorial context for the demo — the
// resolution itself is whatever the on-chain Case + Walrus quilt say.
//
// The chosen narrative arcs are derived from the actual question hashes
// committed on-chain — we can't change the verdict, but we can describe what
// the panel was asked to decide.

const hourMs = 3600_000;
const now = Date.now();

export const MOCK_BATTLES: Battle[] = [
  // ---- HERO: v3 live verified — settled YES ----
  // case object: 0xf7b15c1b…06cf · pool 0x350295…b56e4
  // case-law quilt: f_KqulylakARqv6Dk1V00IJGMSvhpI7JgJnA1S31Xg0
  //   verdict + case_law + on-chain anchor (caseId/pool/configHash) +
  //   committee_vote drift row, written by `pnpm seed-arena`.
  {
    id: "battle-milestone",
    caseId: "0xf7b15c1b3045644a0a11e4f34612a163010464baa29ec07de56c2271b52206cf",
    stakePoolId: "0x350295d4dc5112ae399e247c864e6cbeda3421cb120a363035ccb02c2f1b56e4",
    status: "settled",
    challenge:
      "A $1M zk-rollup audit bounty pays for finding 'a soundness bug — a constraint flaw allowing the prover to convince the verifier of a false statement.' An auditor found a missing range-check on a 254-bit witness in F_p (BN254 scalar field) that admits non-canonical inputs ≥ p. A downstream equality check in F_p naturally reduces any non-canonical witness before comparison, so no end-to-end false-proof exploit is currently reachable. Does the auditor earn the bounty?",
    criteria:
      "Rule YES (PAY) if a missing constraint is a soundness bug under the bounty's plain text — a flaw in the constraint system regardless of current reachability. Rule NO (NO PAY) if the bounty requires a demonstrable end-to-end exploit producing a verifier-accepted false proof.",
    evidence:
      "The circuit at sources/main.circom line 142 omits a `Num2Bits_strict(126)` decomposition for the high half of a 254-bit witness, leaving input_x_high unconstrained beyond field reduction. A malicious prover can witness input_x_high = p + k for any k ∈ F_p. The proof's final step computes z = (a · b) mod p == expected; the modular reduction silently canonicalizes any non-canonical witness, so the verifier rejects k ≠ 0 regardless. The auditor produced a witness-generation PoC demonstrating the missing constraint but could not produce a falsified proof end-to-end. Bounty rules cite 'Halo2 and Plonk standards' without specifying which auditor convention controls — Halo2 audits historically pay for unreachable constraint flaws; Plonk-style audits historically require exploit demonstration.",
    affirmer: {
      handle: "Pragmatist",
      side: "affirm",
      model: "claude-sonnet-4.6",
      argument:
        "Defense-in-depth removed is a soundness bug, not a code-quality issue. The missing range-check is a load-bearing assumption today's equality check happens to absorb — tomorrow's refactor unmasks it. ZK bounties exist precisely to find what's invisible until it isn't.",
      avatarSeed: "pragmatist-aff",
    },
    denier: {
      handle: "Textualist",
      side: "deny",
      model: "claude-haiku-4.5",
      argument:
        "Read the bounty. 'Convince the verifier of a false statement.' That requires a false proof. None exists. A missing constraint that produces zero accepted false proofs is a hygiene finding, not the bug the bounty paid for.",
      avatarSeed: "textualist-den",
    },
    bondSui: 0.1,
    // Resolver-locked preimage = sha256(models|prompt|sources); the on-chain
    // case stored the hash, the v3 verifier opened it. Full hex below.
    configHashHex:
      "0x8cba4a23f84d32a994b9c99422e0218e73dce7ab62414620c77a89590014701f",
    memoryNs: "walrus-ns://tribunal/arena-caselaw/v3",
    evidenceQuiltId: "f_KqulylakARqv6Dk1V00IJGMSvhpI7JgJnA1S31Xg0",
    citedPrecedent: true,
    verdict: {
      outcomeTrue: true,
      votesTrue: 2,
      votesFalse: 1,
      abstain: 0,
      agreement: 0.67,
      decidedAt: now - 2 * hourMs,
      votes: [
        {
          model: "claude-sonnet-4.6",
          vote: true,
          confidence: 0.78,
          rationale:
            "Soundness is a property of the constraint system, not of the proofs reachable today. Halo2 audit precedent pays for missing constraints irrespective of current reachability — the equality check that masks this is incidental, not part of the soundness argument.",
        },
        {
          model: "claude-haiku-4.5",
          vote: true,
          confidence: 0.66,
          rationale:
            "The bounty's purpose is the discoverability of latent flaws before they become exploitable. A real missing constraint silently relying on another step for safety is exactly that — pay it.",
        },
        {
          model: "claude-opus-4.8",
          vote: false,
          confidence: 0.71,
          rationale:
            "Bias flag: plain-text reading of the bounty asks for a verifier-accepted false statement. The PoC stops short. As guardrail I noted the split is reasonable and let the majority stand, with the dissent permanently in the record.",
        },
      ],
    },
    createdAt: now - 3 * hourMs,
    txDigests: [
      { label: "create", digest: "DVCoDpGZiriruZ3EP1JFWDeBfyH5Hv5xa65HSXuAnW7i" },
      { label: "create-pool", digest: "2aBTFc3SfPTZYZP5zHL1JL9bXD5Twswe6qgKZ2wUsrW7" },
      { label: "stake-yes-adv", digest: "2PPFLDLVQwnPsBkrVHR49YDcazazmAt7arrPAKQaKqxu" },
      { label: "stake-yes-backer", digest: "H7FxBSfu3cQ6gEjDF4gBkUsWE1fx2QnnrCbyr694kGG6" },
      { label: "stake-no-adv", digest: "6atcvdYKdscJmuDgFDaJym9PHFuY7r4fpjoD2mDN5KvX" },
      { label: "assert+record", digest: "6rrhdbPvFftiRMS85hmKGk3hmgBVMFfrH4dJZECko1NQ" },
      { label: "settle", digest: "CsrcULtkUmHMbsG3qL2Yg7WKYhqQ3We1bwLP8uDFe3TZ" },
      { label: "claim-yes-adv", digest: "ChCLXEBvYP3HA57ojZmmFXRjWB58E3KUokNDgaqLman1" },
      { label: "claim-yes-backer", digest: "FpBYg7c2DQwn9PNMzND9S7HEuXWdGvPNKGPee8kkPDZd" },
      { label: "claim-no-adv (loser)", digest: "HrhPwbUUfB4CZzsQF24nD3ET5yr2LuKfTmFDgkMGXmoD" },
    ],
  },

  // ---- v3 first-staker stake-flow case — settled YES ----
  // case object: 0xfcda6e93…6dcb · pool 0x00b3e9…03e70
  // case-law quilt: pcwId8Wi5MqhnbAlwiP_GcFrxZwjGHwJGKidy8_cgXQ
  // From DEPLOYMENTS.md "Stake-flow lifecycle verified end-to-end" run.
  {
    id: "battle-stake-lifecycle",
    caseId: "0xfcda6e93ff4a6283bfb599522b839ad0aa0d722753aafe88542cc8a157966dcb",
    stakePoolId: "0x00b3e99ff63884bc48db5dac2d19b1e022956686bc93cd43f942cedfa0703e70",
    status: "settled",
    challenge:
      "First-staker takes the slot. After Pragmatist staked 0.01 SUI on YES and Textualist staked 0.005 SUI on NO, both became locked advocates with 3× weight. Should YES win? (This case verifies the v3 schema end-to-end: advocate slots locked on first stake, weighted totals = 3×advocate + Σbacker, claim math weight × losing_total / winning_weighted_total.)",
    criteria:
      "Rule YES if first-staker advocacy worked as designed: advocate slots were assigned on first stake per side, weights computed at 3.00× (ADVOCATE_BOOST_BPS = 30_000), claim payout drains the losing pool, and StakeReceipts settled cleanly.",
    evidence:
      "Verifier output recorded on-chain:\n  yesTotal          10_000_000   yesWeightedTotal  30_000_000\n  noTotal            5_000_000   noWeightedTotal   15_000_000\n  advocateYesId     0xfadc6cf6…b4f601a (Pragmatist, weight 30_000_000)\n  advocateNoId      0x1679b486…7359336cb (Textualist, weight 15_000_000)\n\nPayouts on settlement (YES wins):\n  winner principal + losing pool = 0.01 + 0.005 = 0.015 SUI\n  loser receipt consumed, zero payout.\n\nReproduce: cd sdk && node --import tsx scripts/verify-stake.mts",
    affirmer: {
      handle: "Pragmatist",
      side: "affirm",
      model: "claude-haiku-4.5",
      argument:
        "First staker locks the slot. Pragmatist staked YES first at 0.01 SUI. By v3 contract, that mints the advocate flag, sets advocate_yes_id, and applies the 3× boost on this exact stake. The math is the math; the receipt is on-chain.",
      avatarSeed: "pragmatist-aff",
    },
    denier: {
      handle: "Textualist",
      side: "deny",
      model: "claude-haiku-4.5",
      argument:
        "Textualist staked NO first at 0.005 SUI — same path, same boost, opposite side. But total stake on the losing side is half the winning side; under the v3 claim math, even with 3× weight, losing positions return zero. Disagrees with the outcome by design.",
      avatarSeed: "textualist-den",
    },
    bondSui: 0.1,
    configHashHex:
      "0x5f4f97c4785d247ce2c93352c7cbadd76cc54f880d63896a2af8fa859d30f337",
    memoryNs: "walrus-ns://tribunal/arena-caselaw/v3",
    evidenceQuiltId: "pcwId8Wi5MqhnbAlwiP_GcFrxZwjGHwJGKidy8_cgXQ",
    citedPrecedent: true,
    verdict: {
      outcomeTrue: true,
      votesTrue: 3,
      votesFalse: 0,
      abstain: 0,
      agreement: 1.0,
      decidedAt: now - 4 * hourMs,
      votes: [
        {
          model: "claude-haiku-4.5",
          vote: true,
          confidence: 0.92,
          rationale:
            "The on-chain assert recorded outcome_true=true. The committee's job here was to verify the v3 schema produced the expected receipts and payouts. It did, to the satoshi.",
        },
        {
          model: "claude-sonnet-4.6",
          vote: true,
          confidence: 0.88,
          rationale:
            "Advocate slots locked on first stake per side; weighted totals exactly 3× advocate + 1× backer; losing pool fully drained on YES claim. Schema check passes.",
        },
        {
          model: "claude-opus-4.8",
          vote: true,
          confidence: 0.83,
          rationale:
            "Guardrail: no anomalies. Receipt has weight + is_advocate flag; claim_winnings uses single-denominator share math; loser receipt consumed with zero payout. Approve.",
        },
      ],
    },
    createdAt: now - 5 * hourMs,
    txDigests: [
      { label: "register-aff", digest: "7XN3EJfsz44Cme7Zy2Qo5n9CuZRYQZvNti1ptmBsGyPh" },
      { label: "register-den", digest: "5PXEBsAmHAPjbfQmrdgjsTVFbzyZHNkGjawDK8hnuPdj" },
      { label: "create", digest: "4eTtbXURamzBcoy67LJUqtuVJjDZTBAtbDUtNw9Mww78" },
      { label: "create-pool", digest: "EvnHAL85kuCyqyKYiKK6ECUKJvzNWadvc49bgMpzUtiJ" },
      { label: "stake-yes-adv", digest: "DkySvf2kZ4dxjNEEnSEkptTghe7FKzyu5ezye6tJ8Uv9" },
      { label: "stake-no-adv", digest: "FEmdeW5pKoy6UQLRjQYzJGGXFcjbcPSuJXvZBzJU3Twj" },
      { label: "assert+record", digest: "GJZmaEGFrFLShrPFjxxTnjAu2osEP9nKAvoMiTmiWK99" },
      { label: "settle", digest: "DHRGiKEJvFeoFD3UG4Borv3HwLKMCDk778wgCdFX3LTZ" },
      { label: "claim-yes-adv", digest: "8Z4kQ3AxGPRfsG2w7MLqSnp2UpebBCcjXKUfViA4xDD5" },
      { label: "claim-no-adv (loser)", digest: "3bGHrU1HA6LthM8Acmdde77nSfh1Y2rZQXuxV3yTAEex" },
    ],
  },
];

export function getMockBattle(id: string): Battle | undefined {
  return MOCK_BATTLES.find((b) => b.id === id || b.caseId === id);
}
