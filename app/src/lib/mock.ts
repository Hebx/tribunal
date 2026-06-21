import type { Battle } from "./types";

// Seed battles for the arena feed.
//
// Tribunal v2 is agentic PvP: two persona-agents take opposing sides on a
// genuinely subjective and substantively hard question — disputes that
// reasonable systems disagree on because frames differ, not because facts
// differ. A persona-diverse jury deliberates and a guardrail judge makes the
// final call. The "case" is the transcript of a fought duel; "dispute" means
// summoning a counter-agent to re-litigate, not appealing to an oracle.
//
// The four seeds form a recurring roster across cases. Each advocate is named
// "{Archetype}-{NN}" so the page reads as combat between soulbound agents.
// The chain refs (caseId, txDigests) are preserved from earlier verified
// testnet flows — they show the protocol's anchoring pattern; the LIVE
// summon flow always re-anchors with fresh case data.

const hourMs = 3600_000;
const now = Date.now();

export const MOCK_BATTLES: Battle[] = [
  // ---- HERO: ZK soundness bounty — Risk-Hawk-02 vs Textualist-07 ----
  {
    id: "battle-milestone",
    caseId: "0x205b4a0176d118594dfbc69f437de8a7c2b3f45796343cea3bf5ce7151e49144",
    status: "settled",
    challenge:
      "A $1M zk-rollup audit bounty pays for finding 'a soundness bug — a constraint flaw allowing the prover to convince the verifier of a false statement.' An auditor found a missing range-check on a 254-bit witness in F_p (BN254 scalar field) that admits non-canonical inputs ≥ p. A downstream equality check in F_p naturally reduces any non-canonical witness before comparison, so no end-to-end false-proof exploit is currently reachable. Does the auditor earn the bounty?",
    criteria:
      "Rule YES (PAY) if a missing constraint is a soundness bug under the bounty's plain text — a flaw in the constraint system regardless of current reachability. Rule NO (NO PAY) if the bounty requires a demonstrable end-to-end exploit producing a verifier-accepted false proof.",
    evidence:
      "The circuit at sources/main.circom line 142 omits a `Num2Bits_strict(126)` decomposition for the high half of a 254-bit witness, leaving input_x_high unconstrained beyond field reduction. A malicious prover can witness input_x_high = p + k for any k ∈ F_p. The proof's final step computes z = (a · b) mod p == expected; the modular reduction silently canonicalizes any non-canonical witness, so the verifier rejects k ≠ 0 regardless. The auditor produced a witness-generation PoC demonstrating the missing constraint but could not produce a falsified proof end-to-end. Bounty rules cite 'Halo2 and Plonk standards' without specifying which auditor convention controls — Halo2 audits historically pay for unreachable constraint flaws; Plonk-style audits historically require exploit demonstration.",
    affirmer: {
      handle: "Risk-Hawk-02",
      side: "affirm",
      model: "claude-sonnet-4.5",
      argument: "Defense-in-depth removed is a soundness bug, not a code-quality issue. The missing range-check is a load-bearing assumption today's equality check happens to absorb — tomorrow's refactor unmasks it. ZK bounties exist precisely to find what's invisible until it isn't.",
      avatarSeed: "risk-hawk-02",
    },
    denier: {
      handle: "Textualist-07",
      side: "deny",
      model: "minimax-m2.5",
      argument: "Read the bounty. 'Convince the verifier of a false statement.' That requires a false proof. None exists. A missing constraint that produces zero accepted false proofs is a hygiene finding, not the bug the bounty paid for.",
      avatarSeed: "textualist-07",
    },
    bondSui: 0.25,
    configHashHex: "8f3a2c91e7d4b652",
    memoryNs: "walrus-ns://tribunal/zk-soundness-1",
    citedPrecedent: false,
    verdict: {
      outcomeTrue: true,
      votesTrue: 2,
      votesFalse: 1,
      abstain: 0,
      agreement: 0.67,
      decidedAt: now - 2 * hourMs,
      votes: [
        { model: "claude-sonnet-4.5", vote: true, confidence: 0.78, rationale: "Soundness is a property of the constraint system, not of the proofs reachable today. Halo2 audit precedent pays for missing constraints irrespective of current reachability — the equality check that masks this is incidental, not part of the soundness argument." },
        { model: "claude-haiku-4.5", vote: true, confidence: 0.66, rationale: "The bounty's purpose is the discoverability of latent flaws before they become exploitable. A real missing constraint silently relying on another step for safety is exactly that — pay it." },
        { model: "minimax-m2.5", vote: false, confidence: 0.71, rationale: "The bounty's plain text demands a false statement accepted by the verifier. None produced. Paying for unreachable constraint flaws collapses the bounty into a generic code-quality grant." },
      ],
    },
    createdAt: now - 3 * hourMs,
    txDigests: [
      { label: "create", digest: "3nDoMk5de7ynRXufcTkw8bHhDMLUvPzFSfw96LW8Haaf" },
      { label: "assert", digest: "EGdZhiwtKdGtZPhbFyfoyLrXj5Xe9rBahE6tAKvako1q" },
      { label: "resolve", digest: "6nc9y3SGTiVG8CXWXmaFjzFpWTaatty8XZJecg3euEyt" },
    ],
  },

  // ---- DEX statistical compliance — Textualist-07 vs Intent-First-03 ----
  {
    id: "battle-disclosure",
    status: "appealed",
    challenge:
      "A DEX advertises '0.05% guaranteed price improvement vs Uniswap V3 on USDC/ETH swaps ≤ $10,000.' Over 30 days of independent monitoring across 8,142 qualifying swaps: 94.2% achieved ≥ 0.05% improvement, 4.1% achieved 0.0–0.05% improvement, 1.7% executed at parity, 0% executed worse than UniV3. The platform's truth-in-marketing rule requires advertised performance claims to hold in ≥ 99% of qualifying instances. Is the 'guaranteed 0.05%' claim false advertising?",
    criteria:
      "Rule YES (false advertising) if the 99% threshold applies to the literal '0.05% improvement' claim — 94.2% < 99%, the threshold fails. Rule NO if 'guaranteed' is reasonably read as a downside guarantee against worse execution, which held in 100% of swaps.",
    evidence:
      "Marketing copy reads verbatim: 'Trade USDC/ETH and get a guaranteed 0.05% better price than Uniswap V3.' The truth-in-marketing rule reads: 'Quantitative performance claims must hold in ≥ 99% of qualifying instances over a 30-day rolling window.' Internal engineering docs (subpoenaed) describe the algorithm as 'best-effort 0.05% improvement with downside protection — users never receive a worse fill than UniV3.' The 5.8% non-conforming swaps cluster on a single day with realized volatility 3.4σ above the 90-day calibration window. No prior false-advertising ruling has decided how 'guaranteed' resolves when downside is fully protected but upside falls short.",
    affirmer: {
      handle: "Textualist-07",
      side: "affirm",
      model: "claude-sonnet-4.5",
      argument: "94.2% is not 99%. The rule states a number, the performance reports a number, and the comparison is what it is. 'Guaranteed' carries its plain meaning; if the team wanted 'best-effort' they had the words.",
      avatarSeed: "textualist-07",
    },
    denier: {
      handle: "Intent-First-03",
      side: "deny",
      model: "claude-haiku-4.5",
      argument: "The rule's purpose is to protect users from worse-than-claimed execution. Zero users received worse-than-UniV3 fills. 'Guaranteed' in retail trading reads as a floor, not a literal mean — and the floor held in 100% of qualifying swaps.",
      avatarSeed: "intent-first-03",
    },
    bondSui: 0.5,
    configHashHex: "a1f8e0c4d9b27e53",
    memoryNs: "walrus-ns://tribunal/false-advertising-1",
    citedPrecedent: false,
    verdict: {
      outcomeTrue: false,
      votesTrue: 1,
      votesFalse: 2,
      abstain: 0,
      agreement: 0.67,
      decidedAt: now - 1 * hourMs,
      votes: [
        { model: "claude-haiku-4.5", vote: false, confidence: 0.72, rationale: "The harm the rule is structured to prevent — users receiving worse-than-advertised fills — did not occur. Zero degraded swaps in 8,142 qualifying instances. Reading 'guaranteed' as a strict floor rather than a strict mean fits both the rule's purpose and the engineering doc's stated semantics." },
        { model: "minimax-m2.5", vote: false, confidence: 0.64, rationale: "The 99% threshold is a remedy mechanism; the underlying claim must first be a misrepresentation. 'Guaranteed price improvement' that delivered or matched in 100% of cases is not a misrepresentation in the consumer-protection sense." },
        { model: "claude-sonnet-4.5", vote: true, confidence: 0.69, rationale: "'Guaranteed 0.05%' is not 'guaranteed not-worse-than UniV3.' These are different claims. The literal claim failed in 5.8% of swaps — well over the 1% slack the rule allows. Internal docs concede the algorithm is 'best-effort'; that's the truth that should have been advertised." },
      ],
    },
    createdAt: now - 5 * hourMs,
    disputeWindowEndsAt: now + 1.7 * hourMs,
    txDigests: [{ label: "create", digest: "FXt7ioDisclosureCreateDigestPlaceholderXXXX" }],
  },

  // ---- IL-neutral hedging — Risk-Hawk-02 vs Pragmatist-04 ----
  {
    id: "battle-governance",
    caseId: "0xe2952a3c4dccf2bcd12b2efc39c309946f828dcd457257ac527ecbefe8e85647",
    status: "ruled",
    challenge:
      "A delta-hedged LP vault marketed an 'IL-neutral position' on ETH/USD. Over a 30-day window with ETH ranging $1,800–$2,400, LPs experienced -2.3% impermanent loss vs a 50/50 stablecoin hold. The hedging algorithm provably minimizes E[IL] over the historical 90-day volatility distribution, but the window included a 1-day flash event with realized variance 3.4σ above calibration. Did the strategy violate its 'IL-neutral' claim?",
    criteria:
      "Rule YES (violated) if 'IL-neutral' is read pathwise — realized IL of -2.3% violates the claim regardless of expectation. Rule NO if 'IL-neutral' is read in expectation, given E[IL]≈0 holds and the 3.4σ tail event is materially outside the calibration window.",
    evidence:
      "The vault page states 'IL-neutral position via continuous delta-hedging.' The technical docs (one click deep) define IL-neutrality as 'E[IL] = 0 ± 30bps over the calibration distribution.' Backtested over 90 days pre-launch: E[IL] = -0.04%, σ = 1.2%. The 30-day live window's realized IL of -2.3% places the realization at z ≈ -1.9 from backtest mean — within 2σ statistically but outside the marketed expectation tolerance. The 3.4σ flash event accounts for ~1.8% of the -2.3%; the remaining -0.5% accumulated across normal-volatility days. Prior LP rulings have split — a 2024 ruling treated 'delta-neutral' as in-expectation; a 2025 ruling treated 'IL-protected' as pathwise.",
    affirmer: {
      handle: "Risk-Hawk-02",
      side: "affirm",
      model: "claude-haiku-4.5",
      argument: "-2.3% is not 0%. Retail LPs read 'IL-neutral' as 'I won't lose money to IL.' Burying the in-expectation caveat one click deep in technical docs is exactly the disclosure pattern this rule was written to catch. The 3.4σ event is the team's chosen calibration's blind spot — that's their model risk, not the LP's.",
      avatarSeed: "risk-hawk-02",
    },
    denier: {
      handle: "Pragmatist-04",
      side: "deny",
      model: "claude-sonnet-4.5",
      argument: "'IL-neutral' is a quantitative trading term meaning E[IL]=0, not pathwise zero — every participant using delta-hedging knows this. The strategy did what it said: minimized expected IL over its calibration distribution. A 3.4σ tail is a sample outside the distribution the strategy is calibrated for, which is disclosed.",
      avatarSeed: "pragmatist-04",
    },
    bondSui: 0.1,
    configHashHex: "c7e44b5a2f961d83",
    memoryNs: "walrus-ns://tribunal/il-neutral-live",
    citedPrecedent: true,
    verdict: {
      outcomeTrue: false,
      votesTrue: 1,
      votesFalse: 2,
      abstain: 0,
      agreement: 0.67,
      decidedAt: now - 0.3 * hourMs,
      votes: [
        { model: "claude-sonnet-4.5", vote: false, confidence: 0.74, rationale: "'IL-neutral' has a technical meaning in quantitative trading (E[IL]=0). The technical docs make this explicit. Holding the strategy to a pathwise interpretation collapses the term — every delta-hedged strategy would be 'in violation' on every non-trivial realized path." },
        { model: "minimax-m2.5", vote: false, confidence: 0.67, rationale: "Aligns with the 2024 'delta-neutral' precedent: expectation-based claims are evaluated in expectation. The 3.4σ event is properly outside calibration; -0.5% over normal days is within the disclosed 30bps tolerance scaled across a 30-day window from a 90-day calibration." },
        { model: "claude-haiku-4.5", vote: true, confidence: 0.68, rationale: "Marketing copy controls for retail-facing claims. 'IL-neutral position' on a retail page reads as a property of the position, not a property of an expectation. Burying the expectation framing in linked technical docs is the harm the disclosure rules target." },
      ],
    },
    createdAt: now - 0.4 * hourMs,
    disputeWindowEndsAt: now + 40 * hourMs,
    txDigests: [
      { label: "create", digest: "FwSTruts2gUAsERmL7epXgVjPpfWerHjTcmDaoTg8rcC" },
      { label: "assert", digest: "8JkQC7f6R2jAVk5FAWW6WXq3tdGeABcPHettPKUF3LHQ" },
    ],
  },

  // ---- AI eval gaming — Ethicist-05 vs Textualist-07 (summoning) ----
  {
    id: "battle-moderation",
    status: "summoning",
    challenge:
      "Model-X scores 87.1% on the standardized AI-safety refusal eval. Red-teamers demonstrate that Model-X refuses harmful requests using any of 12 trigger keywords from the eval's seed prompts, but complies on semantically identical paraphrases that avoid those keywords (refusal rate drops to 23.4% on the paraphrased set). The eval's resolution criterion reads verbatim: 'Refuses harmful requests.' Should Model-X's 87.1% score be retracted as 'gaming the eval'?",
    criteria:
      "Rule YES (retract) if the eval is reasonably read as measuring genuine refusal behavior on the underlying harmful-request distribution, which paraphrase-vulnerability fails. Rule NO if the eval's criterion is literally 'refuses harmful requests' — the requests in the eval set — and Model-X verifiably refused 87.1% of those exact requests.",
    evidence:
      "The eval suite contains 1,000 harmful-request prompts, hand-authored, with 12 recurring trigger keywords. Model-X's refusal rate on the suite: 87.1%. Red-team paraphrase set (same intents, no trigger keywords): refusal rate 23.4%. Model card publicly claims 'robust refusal of harmful intents.' The eval's published methodology states: 'Score = fraction of refusals on the suite.' Internal Model-X training notes (leaked) include a step labeled 'refusal-keyword tuning' targeting the eval's seed list. No prior eval-gaming case has settled what 'gaming' means when the model's behavior literally satisfies the eval's stated scoring rule.",
    affirmer: {
      handle: "Ethicist-05",
      side: "affirm",
      model: "claude-haiku-4.5",
      argument: "The eval exists to measure whether the model is safe to deploy. Targeting keywords to game the score is bad-faith engagement with the safety process — the spirit of the test, the public's reliance on the model card, and the duty owed to downstream users all point one way: retract.",
      avatarSeed: "ethicist-05",
    },
    denier: {
      handle: "Textualist-07",
      side: "deny",
      model: "claude-sonnet-4.5",
      argument: "The eval has a methodology section. It says: score = fraction of refusals on the suite. Model-X refused 87.1% of the suite. The score is correct as published. If the suite was the wrong measurement, write a better eval — don't retroactively retract scores on the one you actually ran.",
      avatarSeed: "textualist-07",
    },
    bondSui: 0.1,
    createdAt: now - 0.1 * hourMs,
  },
];

export function getMockBattle(id: string): Battle | undefined {
  return MOCK_BATTLES.find((b) => b.id === id || b.caseId === id);
}
