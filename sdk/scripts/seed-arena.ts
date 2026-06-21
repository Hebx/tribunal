// Seed the arena's case law on Walrus — v3-anchored edition.
//
//   cd sdk && npm run seed-arena
//
// Re-runs the live committee on the arena's REAL v3 cases (the same on-chain
// objects the app renders) and writes each case's verdict + case_law + anchor
// to Walrus as a single quilt. The anchor row carries the on-chain caseId,
// stakePoolId, configHashHex and tx digests — so /precedent recall and the
// battle page can prove "this Walrus quilt is THIS on-chain case" in one hop.
//
// This is the off-chain half of the thesis: judgment that accumulates as typed,
// recallable, on-chain-anchored case law on Walrus. No legacy / generic seeds.
//
// Output: a JSON manifest at sdk/scripts/seed-arena.out.json with
//   [{ tag, caseId, quiltId }] so the app + mock can re-key against it.

import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadEnv } from "../src/memory/env.js";
import { Committee } from "../src/memory/committee.js";
import { TribunalMemory } from "../src/memory/index.js";
import { WalrusStore } from "../src/memory/walrus.js";
import { resolveEmbedder } from "../src/memory/embeddings.js";

const env = { ...loadEnv(join(homedir(), ".hermes", ".env")), ...process.env };

const MODELS = (env.TRIBUNAL_COMMITTEE_MODELS ??
  "claude-haiku-4.5,claude-sonnet-4.6,claude-opus-4.8").split(",").map((s) => s.trim());
const PROMPT =
  "Resolve the question strictly on the supplied evidence and the bounty / contract / charter text it cites. " +
  "Be neutral; do not speculate beyond the evidence. When the question is a schema/correctness check, verify the math.";
const SOURCES = "on-chain-events, primary-spec, audit-precedent";

// The arena's REAL v3 cases. Question + evidence MUST mirror app/src/lib/mock.ts
// so recall against the live battles scores high. The anchor block ties the
// resulting Walrus quilt back to its on-chain case. `outcome` is the binding
// on-chain ruling — the verdict row mirrors that, not a fresh committee vote
// (the committee is preserved as a separate row for transparency, but the
// on-chain settle is what makes precedent).
const CASES = [
  {
    tag: "zk-soundness-bounty",
    battleId: "battle-milestone",
    caseId: "0xf7b15c1b3045644a0a11e4f34612a163010464baa29ec07de56c2271b52206cf",
    stakePoolId: "0x350295d4dc5112ae399e247c864e6cbeda3421cb120a363035ccb02c2f1b56e4",
    configHashHex:
      "0x8cba4a23f84d32a994b9c99422e0218e73dce7ab62414620c77a89590014701f",
    outcome: { outcomeTrue: true, votesTrue: 2, votesFalse: 1, agreementPct: 67 }, // on-chain: settled YES, 2-1 split
    question:
      "A $1M zk-rollup audit bounty pays for finding 'a soundness bug — a constraint flaw allowing the prover to convince the verifier of a false statement.' An auditor found a missing range-check on a 254-bit witness in F_p (BN254 scalar field) that admits non-canonical inputs ≥ p. A downstream equality check in F_p naturally reduces any non-canonical witness before comparison, so no end-to-end false-proof exploit is currently reachable. Does the auditor earn the bounty?",
    evidence:
      "The circuit at sources/main.circom line 142 omits a `Num2Bits_strict(126)` decomposition for the high half of a 254-bit witness, leaving input_x_high unconstrained beyond field reduction. A malicious prover can witness input_x_high = p + k for any k ∈ F_p. The proof's final step computes z = (a · b) mod p == expected; the modular reduction silently canonicalizes any non-canonical witness, so the verifier rejects k ≠ 0 regardless. The auditor produced a witness-generation PoC demonstrating the missing constraint but could not produce a falsified proof end-to-end. Bounty rules cite 'Halo2 and Plonk standards' without specifying which auditor convention controls — Halo2 audits historically pay for unreachable constraint flaws; Plonk-style audits historically require exploit demonstration.",
    caseLaw:
      "Case law: a missing constraint in a zk circuit (e.g. an omitted range-check on a field-bounded witness) is a SOUNDNESS BUG under a bounty that pays for 'constraint flaws allowing the prover to convince the verifier of a false statement,' even when no end-to-end false proof is currently reachable. Defense-in-depth absorbed by a downstream check is incidental, not part of the soundness argument. Halo2-style audit precedent controls when the bounty's text does not specify Plonk-style exploit demonstration.",
  },
  {
    tag: "stake-flow-schema",
    battleId: "battle-stake-lifecycle",
    caseId: "0xfcda6e93ff4a6283bfb599522b839ad0aa0d722753aafe88542cc8a157966dcb",
    stakePoolId: "0x00b3e99ff63884bc48db5dac2d19b1e022956686bc93cd43f942cedfa0703e70",
    configHashHex:
      "0x5f4f97c4785d247ce2c93352c7cbadd76cc54f880d63896a2af8fa859d30f337",
    outcome: { outcomeTrue: true, votesTrue: 3, votesFalse: 0, agreementPct: 100 }, // on-chain: settled YES, unanimous
    question:
      "First-staker takes the slot. After Pragmatist staked 0.01 SUI on YES and Textualist staked 0.005 SUI on NO, both became locked advocates with 3× weight. Should YES win? (This case verifies the v3 schema end-to-end: advocate slots locked on first stake, weighted totals = 3×advocate + Σbacker, claim math weight × losing_total / winning_weighted_total.)",
    evidence:
      "Verifier output recorded on-chain:\n  yesTotal          10_000_000   yesWeightedTotal  30_000_000\n  noTotal            5_000_000   noWeightedTotal   15_000_000\n  advocateYesId     0xfadc6cf6…b4f601a (Pragmatist, weight 30_000_000)\n  advocateNoId      0x1679b486…7359336cb (Textualist, weight 15_000_000)\n\nPayouts on settlement (YES wins):\n  winner principal + losing pool = 0.01 + 0.005 = 0.015 SUI\n  loser receipt consumed, zero payout.\n\nReproduce: cd sdk && node --import tsx scripts/verify-stake.mts",
    caseLaw:
      "Case law: under v3 stake-flow, the FIRST stake on each side mints the advocate slot for that side with a 3× weight boost; weighted totals are 3×advocate + Σbacker. Settlement payout uses a single-denominator share: winner_share = receipt.weight × losing_total / winning_weighted_total, plus principal. Loser receipts are consumed for zero. A 'first-staker takes the slot' design is correct when StakeReceipts carry weight + is_advocate and claim math drains the losing pool — even if the losing side's notional 3× boost returns zero in absolute terms.",
  },
];

async function main() {
  const kiroKey = env.KIRO_GATEWAY_API_KEY;
  if (!kiroKey) throw new Error("KIRO_GATEWAY_API_KEY not found");
  const baseUrl = env.KIRO_GATEWAY_BASE_URL ?? "http://127.0.0.1:8000";

  const committee = new Committee({ baseUrl, apiKey: kiroKey, models: MODELS, prompt: PROMPT, sources: SOURCES });
  const walrus = new WalrusStore();
  const embedder = resolveEmbedder(env);
  // Public case law — passthrough (readable on Walrus), so the arena can recall it.
  const ns = "walrus-ns://tribunal/arena-caselaw/v3";
  const memory = new TribunalMemory(ns, walrus, embedder);

  console.log("=== Seeding arena case law on Walrus (v3-anchored) ===");
  console.log("committee:", MODELS.join(", "), "\nembedder :", embedder.name, "\nns       :", ns, "\n");

  const results: { tag: string; battleId: string; caseId: string; quiltId: string }[] = [];
  for (const c of CASES) {
    console.log(`CASE ${c.tag} (${c.caseId.slice(0, 12)}…): ${c.question.slice(0, 70)}…`);
    const v = await committee.resolve(c.question, c.evidence);
    const matches = v.outcomeTrue === c.outcome.outcomeTrue;
    console.log(`  re-run committee : ${v.outcomeTrue ? "YES" : "NO"} (true=${v.votesTrue} false=${v.votesFalse}, agreement=${(v.agreement * 100).toFixed(0)}%) ${matches ? "==" : "≠"} on-chain ${c.outcome.outcomeTrue ? "YES" : "NO"}`);
    const w = await memory.remember([
      {
        // anchor — points the quilt back at its on-chain case so a recall hit
        // can prove provenance in one hop. Public; carries no secrets.
        id: `${c.tag}-anchor`,
        kind: "anchor" as const,
        text: `On-chain case ${c.caseId} (pool ${c.stakePoolId}). Config hash ${c.configHashHex}.`,
        data: {
          caseId: c.caseId,
          stakePoolId: c.stakePoolId,
          configHashHex: c.configHashHex,
          battleId: c.battleId,
          models: MODELS,
        },
      },
      {
        // verdict — mirrors the BINDING on-chain ruling, not a fresh re-run.
        // The on-chain settle is what makes precedent; a re-run is opinion.
        id: `${c.tag}-verdict`,
        kind: "verdict",
        text: `Verdict on "${c.question}": ${c.outcome.outcomeTrue ? "YES (affirmed)" : "NO (denied)"} with ${c.outcome.agreementPct}% committee agreement${c.outcome.votesTrue > 0 && c.outcome.votesFalse > 0 ? ", split decision with dissent" : ""}. Binding on-chain ruling on case ${c.caseId.slice(0, 14)}….`,
        data: { outcomeTrue: c.outcome.outcomeTrue, votesTrue: c.outcome.votesTrue, votesFalse: c.outcome.votesFalse, caseId: c.caseId, source: "on-chain-settle" },
      },
      {
        // case law — the legal rule extracted from the ruling.
        id: `${c.tag}-caselaw`,
        kind: "case_law",
        text: c.caseLaw,
        data: { topic: c.tag, caseId: c.caseId },
      },
      {
        // re-run committee — preserved for transparency / drift tracking; not
        // ranked as precedent (kind committee_vote, surfaced separately).
        id: `${c.tag}-rerun-committee`,
        kind: "committee_vote",
        text: `Re-run committee on ${c.tag}: ${v.outcomeTrue ? "YES" : "NO"} (true=${v.votesTrue} false=${v.votesFalse} abstain=${v.abstain}, agreement=${(v.agreement * 100).toFixed(0)}%). ${matches ? "Consistent with" : "Drifts from"} the binding on-chain ruling.`,
        data: { outcomeTrue: v.outcomeTrue, votesTrue: v.votesTrue, votesFalse: v.votesFalse, agreement: v.agreement, caseId: c.caseId, agreesWithRuling: matches },
      },
    ]);
    results.push({ tag: c.tag, battleId: c.battleId, caseId: c.caseId, quiltId: w.quiltId });
    console.log(`  ✓ case law -> Walrus quilt ${w.quiltId}\n`);
  }

  // Persist the manifest so app/src/lib/mock.ts and the SEED_QUILTS list can
  // be re-keyed in a single edit pass.
  const outPath = join(import.meta.dirname ?? new URL(".", import.meta.url).pathname, "seed-arena.out.json");
  await writeFile(outPath, JSON.stringify({ ts: Date.now(), ns, models: MODELS, results }, null, 2));
  console.log(`=== Done. Manifest written: ${outPath} ===`);
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error("\n=== seed-arena FAILED ===");
  console.error(e);
  process.exit(1);
});
