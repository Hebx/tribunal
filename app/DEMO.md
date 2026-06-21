# Tribunal Arena — Demo Script

**Hook (say this first):** *"Most AI judges decide in isolation and forget.
Tribunal is agentic PvP debate that remembers its own rulings — persona-agents
argue, a persona-diverse jury deliberates, and a single guardrail judge makes
the binding call. Disputable on-chain, indexed on Walrus."*

Lead with **persona-diversity + typed case law**. Config hashing is one sentence
near the end.

---

## The arc (≈3 min)

### Beat 1 — A genuinely hard question (30s)
Open the Arena. Click the **Milestone** case (the ZK soundness bounty):

> *"A $1M zk-rollup audit bounty pays for finding a 'soundness bug — a constraint
> flaw allowing the prover to convince the verifier of a false statement.' An
> auditor found a missing range-check on a 254-bit BN254 witness — but a
> downstream equality check silently masks it, so no end-to-end exploit is
> reachable today. Do they earn the bounty?"*

Point out: this is **not** a fact you can settle with a block explorer. A reasonable
agent could rule either way — it's a frame disagreement (constraint-system view
vs reachable-exploit view), not a fact disagreement. Show the two **persona-agents**
(Risk-Hawk-02 argues YES, Textualist-07 argues NO) and "the standard the jury
must apply." This is a courtroom, not a market.

### Beat 2 — The jury splits (40s)
Scroll to **The Bench (v2)**. The pre-loaded ruling is **YES, but 2–1 with a
recorded dissent** (gold). Read the dissent aloud — Textualist juror argues the
bounty's plain text demands a verifier-accepted false proof, and none exists.

> *"This is why diversity comes from personas, not models. A textualist juror
> and a risk-hawk juror reading the same evidence with the same model will land
> in different places — and that's the signal. A single oracle hides it; we
> surface it, then a guardrail judge makes the binding call."*

### Beat 3 — The audit trail is the moat (45s)
Scroll to **Audit Trail** under the verdict. Six typed Quilt entries land on
Walrus for every case: `debate · jury · guardrail · verdict · case_law ·
provenance`. Click `provenance` → patch id is copy-able, aggregator link
opens the raw entry. Expand the provenance block in the panel: it lists each
advocate (with `isFirstStaker: true, weight: 3`), each backer, each juror
with archetype + seed, the model map, gateway temperatures, both
configHashes (`configHashHex` for the resolver stack, `guardrailConfigHash`
for the judge's locked prompt), and the resolver commit.

> *"This is the v3 audit chain. caseId → Quilt → six typed entries → re-run
> with the pinned hashes and commit, and you get the same verdict. That's
> reproducibility, not vibes. And it compounds — go to Case Law, search
> `zk soundness reachable exploit`, the top hit is a prior tribunal ruling
> on the same frame question, recalled from Walrus by semantic match."*

Note for the audience: deliberation entries (`debate_transcript` +
`jury_deliberation`) are **sealed until settle** — they decrypt only under
the on-chain `seal_approve` predicate. The verdict, case_law, guardrail
ruling, and provenance are **public the moment the case settles**.

### Beat 4 — Dispute is summoning a counter-agent (45s)
Back on the battle page, click **"Dispute → recall precedent"** (legacy committee)
or the **"Dispute ruling"** flow (wallet-signed, on-chain).
Walk through: (1) recall the prior ruling from Walrus, (2) show the cited
precedent inline, (3) re-convene the panel **with that precedent as context**,
(4) render a fresh ruling that's consistent with — or knowingly overturns — the
recalled case law.

> *"A dispute isn't a re-roll. It's summoning a counter-agent into the case.
> The tribunal pulls its own precedent and is pushed to rule consistently — or
> to explicitly overturn, on-chain. That's accountability with memory."*

### Beat 5 — It's real, and it's honest (20s)
Expand **"What's on-chain, what's on Walrus."** Walk the boundary: identity,
reputation, stake pool, case lifecycle, config hash, bond, evidence anchor on
**Sui**; debate transcript, jury deliberation, guardrail decision, typed case
law on **Walrus** (sealed until settle); UI framing in the **UI**. Click a tx
chip → real SuiScan transaction from the verified end-to-end run.

> *"The config that decided this is hash-locked on-chain — the deciding model
> stack can't be swapped silently. And the whole lifecycle — register, assert,
> stake, dispute, settle, claim — is bonded and live on Sui testnet."*

---

## What to have running

- `KIRO_GATEWAY_*` reachable (advocate/jury/guardrail models). `GEMINI_API_KEY`
  optional for higher-quality recall embeddings.
- Case law seeded on Walrus: `cd sdk && npm run seed-arena` (done; quilt ids
  wired into `app/src/app/api/recall/route.ts`).
- App: `cd app && pnpm dev`.

## The three differentiators (repeat at the close)
1. **Stake-gated, first-staker advocacy** — the protocol picks advocates by
   conviction (whoever stakes first on each side argues that side and gets a
   3× share of the losing pool). No matchmaker, no fallback.
2. **Persona-diverse judgment** — diversity comes from lenses, not from
   correlated model priors. The dissent is preserved on Walrus.
3. **Six-entry typed audit trail on Walrus** — `debate · jury · guardrail ·
   verdict · case_law · provenance`. Replay with the pinned configHashes +
   resolverCommit, get the same verdict.

Bonded dispute is the safety net: summons a counter-agent, can overturn the
ruling on-chain.

## One-liner
*"Tribunal turns AI debate into accountable, disputable, self-remembering case
law on Sui + Walrus."*
