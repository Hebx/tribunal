# Tribunal Arena — Demo Script

**Hook (say this first):** *"Most AI judges decide in isolation and forget. Tribunal
is AI judgment that remembers its own rulings — and is forced to stay consistent
with them, or get overturned on-chain."*

Lead with **memory + typed case law**. Config hashing is one sentence near the end.

---

## The arc (≈3 min)

### Beat 1 — A genuinely hard question (30s)
Open the Arena. Click the **Milestone** case:

> *"Did the grantee meet Milestone 2, given the deliverable shipped at ~80% of spec?"*

Point out: this is **not** a fact you can settle with a block explorer. A reasonable
judge could rule either way. Show the two **advocates** (argues YES vs argues NO)
and "the standard the bench must apply." This is a courtroom, not a market.

### Beat 2 — The bench splits (40s)
Scroll to **The Bench**. The pre-loaded ruling is **YES, but 2–1 with a recorded
dissent** (gold). Read the dissent aloud — minimax argues role management is a named
criterion, not a nice-to-have.

> *"This is why it's a committee, not one model. The disagreement is the signal.
> A single oracle hides this; we surface it and make it disputable."*

### Beat 3 — Memory is the moat (45s)
Go to **Case Law**. Search `milestone delivered at 80% of spec`.
The top hit is the tribunal's own prior ruling, **recalled from Walrus** — typed
`case_law`, not chat logs, with a relevance score and the Walrus quilt it came from.

> *"Every ruling becomes typed precedent on Walrus. Verdicts and case law are public
> and auditable; the deliberation behind them is Seal-encrypted until the case settles.
> This is what MemWal / generic chat-memory clones won't have: judgment that
> compounds."*

### Beat 4 — Dispute recalls precedent (45s)
Back on the Milestone battle, click **"Dispute → recall precedent."**
Watch it: (1) recall the prior ruling from Walrus, (2) show the cited precedent
inline, (3) re-convene the live committee **with that precedent as context**, (4)
render a fresh ruling that is consistent with the recalled case law.

> *"A dispute doesn't just re-roll the dice. The tribunal pulls its own precedent
> and is pushed to rule consistently — that's accountability with memory."*

### Beat 5 — It's real, and it's honest (20s)
Expand **"What's on-chain, what's on Walrus."** Walk the boundary: case lifecycle,
config hash, bond, evidence anchor on **Sui**; question/votes/case-law on **Walrus**;
advocate framing in the **UI**. Click a tx chip → real SuiScan transaction from the
verified end-to-end run.

> *"The config that decided this is hash-locked on-chain — the deciding AI can't be
> swapped silently. And the whole lifecycle — assert, dispute, settle — is bonded
> and live on Sui testnet."*

---

## What to have running

- `KIRO_GATEWAY_*` reachable (committee). `GEMINI_API_KEY` optional (better recall).
- Case law already seeded on Walrus: `cd sdk && npm run seed-arena` (done; quilt ids
  wired into `app/src/app/api/recall/route.ts`).
- App: `cd app && pnpm dev`.

## The three differentiators (repeat at the close)
1. **Typed case law** that compounds — not generic memory.
2. **Bonded dispute** that can overturn a ruling on-chain.
3. **Judgment under genuine disagreement** — committees split, dissent is recorded.

## One-liner for the submission
*"Tribunal turns AI judgment into accountable, disputable, self-remembering case law
on Sui + Walrus."*
