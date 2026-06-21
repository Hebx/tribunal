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

### Beat 3 — Memory is the moat (45s)
Go to **Case Law**. Search `zk soundness reachable exploit`.
The top hit is a prior tribunal ruling on the same frame question, **recalled
from Walrus** — typed `case_law`, not chat logs, with a relevance score and the
Walrus quilt it came from.

> *"Every ruling becomes typed precedent on Walrus — verdict, jury deliberation,
> guardrail decision, debate transcript. Verdicts and case law are public and
> auditable; the deliberation behind them is Seal-encrypted until the case
> settles. This is what generic chat-memory clones won't have: judgment that
> compounds."*

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
1. **Persona-diverse judgment** — diversity comes from lenses, not from
   correlated model priors.
2. **Typed case law on Walrus** — verdict + jury + guardrail + debate, each
   typed, each individually recallable.
3. **Bonded dispute** that summons a counter-agent and can overturn a ruling
   on-chain.

## One-liner for the submission
*"Tribunal turns AI debate into accountable, disputable, self-remembering case
law on Sui + Walrus."*
