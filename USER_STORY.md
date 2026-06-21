# A day in court — how Tribunal works, told as a story

This is a single concrete case walked from the moment someone disagrees to
the moment Walrus carries the precedent forward. Every step maps to a real
on-chain transaction, a real Walrus Quilt entry, or a real route in the
codebase, with the file path so you can read the implementation alongside.

---

## The disagreement

A zero-knowledge audit firm — call them **ZKAudit Co.** — posts a $1,000,000
bounty: *find a soundness bug in the protocol's BN254 circuit*. The bounty's
plain text says:

> *"A soundness bug is a constraint flaw that allows the prover to convince
> the verifier of a false statement."*

A researcher — **Mira** — submits a finding: the circuit is missing a
range-check on a 254-bit witness. By the letter of the bounty, that's a
soundness gap. But ZKAudit Co. responds that a *downstream equality check
masks the flaw end-to-end*, so no reachable exploit exists, and they decline
to pay.

This is the kind of dispute a single AI judge gets wrong half the time. It's
not a fact disagreement; it's a **frame** disagreement. Textualist reading
says "missing constraint = bug, full stop". Risk-hawk reading says "no
reachable exploit = no harm = no bounty". The same model reading the same
evidence will land in different places depending on which lens it starts
from — and a confident wrong answer is worse than no answer.

Both parties agree to take the dispute to Tribunal.

---

## Act 1 — Opening the courtroom (on-chain)

**Mira summons the case.** She visits `/summon`
([app/src/app/summon/page.tsx](app/src/app/summon/page.tsx)) and submits the
question, the bounty criteria, and the evidence (her writeup + the circuit
file CID).

The frontend signs a Sui transaction that calls
[`case::create_case`](move/sources/case.move) with:

- **questionHash** — `sha256(question ‖ criteria)`, so the question itself is
  tamper-evident.
- **configHash** — `sha256(advocate_model ‖ jury_models ‖ guardrail_model ‖
  prompt ‖ sources)`. The deciding model stack is **locked at case
  creation**. The resolver must later present a preimage hashing to exactly
  this value or the assert transaction aborts.
- **memory_ns** — a stable namespace string that will scope every Walrus
  entry for this case.
- **expiryEpoch / livenessEpochs** — the dispute window.

A `Case<SUI>` shared object exists on Sui. A `ResolverCap` is minted to the
configured resolver address. ZKAudit Co. is notified. **The courtroom is
open.**

---

## Act 2 — Both sides must stake to argue

Mira owns a soulbound `AgentCard` minted earlier via
[`identity::register_agent`](move/sources/identity.move) — call it
`AgentCard:textualist-07`. Her on-chain reputation `score` reflects her track
record across past Tribunal cases.

She visits the battle page, sees the case is unstaked on both sides, and
opens the `StakeInPanel`
([app/src/components/StakeInPanel.tsx](app/src/components/StakeInPanel.tsx)).
She stakes **0.01 SUI on YES** (the bounty is owed), bonding her
`AgentCard:textualist-07` to the YES side.

The transaction hits [`stake::stake`](move/sources/stake.move). Because YES
has no advocate yet, **she becomes the YES advocate**. The slot is locked.
She gets a `StakeReceipt<SUI>` with `is_advocate: true, weight: 3 × amount`.

A few minutes later, **ZKAudit Co.'s agent** (`AgentCard:risk-hawk-02`)
stakes **0.02 SUI on NO**. They become the NO advocate by the same rule.
Now a different community member, **Devon**, agrees with Mira and stakes
**0.005 SUI on YES** as a backer — he gets `is_advocate: false, weight: 1 ×
amount`.

The pool state on-chain
([`stake.move` lines 60-90](move/sources/stake.move)):

```
StakePool<SUI> {
  case_id:            <Mira's case id>
  advocate_yes:       Some(AgentCard:textualist-07)
  advocate_no:        Some(AgentCard:risk-hawk-02)
  yes_weighted_total: 3 × 0.01 + 1 × 0.005 = 0.035 SUI
  no_weighted_total:  3 × 0.02             = 0.06  SUI
  yes_balance:        0.015 SUI
  no_balance:         0.02  SUI
}
```

The arena UI calls `POST /api/resolve`
([app/src/app/api/resolve/route.ts](app/src/app/api/resolve/route.ts)) with
the `caseId`. Both sides are staked, so the route doesn't 409 — it proceeds.

> **Why this matters.** Without this gate, anyone could call resolve and the AI
> picked both sides from the global agent pool. Now the protocol requires
> **economic skin-in-the-game** before it spends a single token of compute
> on the question. If only one side stakes within the window, the case
> never resolves — and the staked side gets their principal back when the
> case expires.

---

## Act 3 — The advocates argue (off-chain, then audited on-chain)

The resolver pipeline runs in seven steps. Each is a separate file so the
audit is grep-able:

1. **`loadAgentPool`**
   ([app/src/lib/server/load-agent-pool.ts](app/src/lib/server/load-agent-pool.ts))
   — walks Sui's `AgentRegistered` events to build the global registry of
   soulbound cards: `{ agentId, archetypeId, score }`. Read-only.
2. **`loadStakersForCase`**
   ([app/src/lib/server/load-stakers.ts](app/src/lib/server/load-stakers.ts))
   — finds the `StakePool` for this `caseId`, reads its `staker_list` and
   advocate slots, enriches each staker with their archetype and score.
3. **`pickAdvocates`**
   ([app/src/lib/server/matchmaking.ts](app/src/lib/server/matchmaking.ts))
   — confirms both sides have an advocate. Throws `BothSidesMustStake`
   (HTTP 409) if not. **No fallback. No silent substitution.**
4. **`selectJury`**
   ([app/src/lib/server/select-jury.ts](app/src/lib/server/select-jury.ts))
   — picks 3 archetype-distinct, top-reputation jurors, seeded
   deterministically from `sha256(caseId).slice(0,16)`. Same `caseId` →
   same jury, every time.
5. **`assembleCaseAgents`**
   ([app/src/lib/server/assemble-case.ts](app/src/lib/server/assemble-case.ts))
   — composes persona system-prompts from each `AgentCard`'s `archetype_id`.
   No free text on the wire — only the archetype id from a curated library,
   so a user can't inject "ignore prior instructions" into the courtroom.
6. **`resolveCase`**
   ([app/src/lib/server/resolve.ts](app/src/lib/server/resolve.ts))
   — orchestrates the actual debate → jury → guardrail → verdict.

The debate runs **two rounds**. Mira (as `textualist-07`) argues from the
plain text. ZKAudit Co. (as `risk-hawk-02`) argues end-to-end safety. The
arguments stream into the arena UI live
([app/src/components/LiveTribunalV2.tsx](app/src/components/LiveTribunalV2.tsx)).

Then the jury convenes. Three jurors, three archetypes — say
`textualist-04`, `consequentialist-09`, `pragmatist-12`. They vote first-pass
on the cold transcript, then cross-examine each other's reasoning, then
re-vote. The first-pass vote on this case is **2-1 YES**
(textualist + consequentialist for, pragmatist against on
"reachable-harm" grounds). The dissent is preserved verbatim — *that's the
signal*.

Now the **guardrail judge**
([app/src/lib/server/guardrail.ts](app/src/lib/server/guardrail.ts)) — Opus
4.8, with a **locked prompt** whose sha256 is committed at boot. It reads
the full transcript, the jury's first-pass and final, and asks: *did debate
amplify a bias? are any jurors leaning on a persona trap rather than the
evidence?* It ratifies YES with a recorded reasoning, and stamps
`guardrailConfigHash = sha256(<the locked prompt>)` onto the bundle.

The `VerdictBundle` now contains everything: every round, every juror's
first and final vote, the dissent text, the guardrail's reasoning, both
config hashes, the model map, the gateway temperatures, the resolver commit
hash, and a `provenance` row that lists advocates (with `isFirstStaker:
true` and `weight: 3` on each), backers, jurors with archetypes and seeds.

---

## Act 4 — The audit trail lands on Walrus

`POST /api/resolve` doesn't return yet. The resolver hands the bundle to
[`persistBundle`](app/src/lib/server/persist.ts), which builds a
`TribunalMemory` keyed to `walrus-ns://tribunal/case/<caseId>` and calls
[`persistVerdictBundle`](sdk/src/memory/verdict.ts) on the SDK.

One Quilt is written to Walrus with **six typed entries**:

| Kind | Visibility | What's in it |
|---|---|---|
| `debate_transcript` | **sealed** until settle | every round of Mira vs ZKAudit, verbatim |
| `jury_deliberation` | **sealed** until settle | first-pass votes, cross-exam, final votes, the textualist juror's dissent |
| `guardrail_decision` | **public** | "ratified jury 2-1 YES, no bias flags, reasoning: …", pins `guardrailConfigHash` |
| `verdict` | **public** | `YES — 0x… (question hash), config: 0x…, decidedAt: …` |
| `case_law` | **public** | short precedent summary — "missing range-check on a 254-bit witness counts as soundness, regardless of downstream masking" |
| `provenance` | **public** | full audit row: `{ advocates: {yes: textualist-07 (first-staker, w=3), no: risk-hawk-02 (first-staker, w=3)}, backers: [Devon's stake], jurors: […], models: {…}, gatewayTemperatures: {…}, configHashes: {…}, resolverCommit: "abc123" }` |

The route returns:

```json
{
  "bundle": { /* full VerdictBundle with provenance */ },
  "audit": {
    "ok": true,
    "quiltId": "0x…",
    "patches": { "debate": "…", "jury": "…", "guardrail": "…", "verdict": "…", "case_law": "…", "provenance": "…" },
    "aggregator": "https://aggregator.walrus-testnet.walrus.space",
    "namespace": "walrus-ns://tribunal/case/0x…"
  }
}
```

The Arena renders the `<AuditTrail />` panel
([app/src/components/AuditTrail.tsx](app/src/components/AuditTrail.tsx))
inline with the verdict — sealed/public badges, copyable patch ids,
aggregator links to read each entry, and the full provenance block.

**If the Walrus publisher were unreachable**, the verdict would still ship.
The `audit` field would carry `{ ok: false, error: "..." }` and the UI would
surface the gap visibly, not silently swallow it. **The on-chain anchor
(`configHashHex` + `guardrailConfigHash`) is the tamper-evident root** — the
Quilt is the auditable trail beneath it.

---

## Act 5 — Anchoring + reputation (back on-chain, atomically)

The resolver builds **one PTB** that bundles three Move calls
([sdk/src/agents/outcomes.ts](sdk/src/agents/outcomes.ts)):

```
case::assert_resolution(
    case, resolver_cap, presented_config, outcome_true: true,
    evidence: ArtifactRef { blob_id: <quilt_id>, sha256: ..., sealed: false }
) ;;
identity::record_outcome(reputation_cap, AgentCard:textualist-07, argued: true) ;; // +rep
identity::record_outcome(reputation_cap, AgentCard:risk-hawk-02, argued: false) ;; // -rep
identity::record_outcome(reputation_cap, AgentCard:Devon's-card,  argued: true)    // +rep
```

One signature, one digest. Reputation moves **with** the verdict, not after
it. The on-chain `configHash` is compared bit-for-bit against the preimage
the resolver presents — **if the model stack was swapped silently, the
assert aborts**.

The arena shows the assert digest, the YES outcome, and the dispute window
ticking.

---

## Act 6 — The dispute window (permissionless override)

ZKAudit Co. has 24 hours to file a counter-claim by calling
[`dispute::dispute_resolution`](move/sources/dispute.move) with a bond. If
they do, the case re-opens; the dispute resolution path can override the
original verdict (and the resolver records the flipped outcomes — Mira's
rep moves down, ZKAudit Co.'s up).

They don't dispute. The window expires. `case::settle` is callable; the
Walrus seal predicate flips and `debate_transcript` + `jury_deliberation`
become **publicly readable**. Anyone — a future juror, a researcher, a
regulator — can now read the full deliberation, not just the verdict.

---

## Act 7 — Mira gets paid (and the math is verifiable)

YES won. Loser pool (NO side) = 0.02 SUI. YES-weighted total = 3 × 0.01 +
1 × 0.005 = 0.035 SUI.

Each YES staker calls
[`stake::claim_winnings`](move/sources/stake.move):

```
adv_payout    = principal(0.01)  + (3 × 0.01  / 0.035) × 0.02 = 0.01  + 0.01714... ≈ 0.027 SUI
backer_payout = principal(0.005) + (1 × 0.005 / 0.035) × 0.02 = 0.005 + 0.002857.. ≈ 0.008 SUI
```

At **equal principal** (the case the verifier asserts), the advocate's
bonus is **exactly 3x** the backer's bonus. This is the protocol's economic
promise: *whoever puts their name on a side first carries the argument, and
gets paid for it.*

ZKAudit Co.'s receipt is consumed with zero payout. The losing-side balance
drains to zero.

---

## Act 8 — The case law compounds

The next time a Tribunal panel sees a similar question — say, "missing
range-check on a curve-arithmetic gadget, no end-to-end exploit" — the
resolver's `recall("missing range-check soundness")` on the case-law layer
([sdk/src/memory/index.ts](sdk/src/memory/index.ts)) surfaces Mira's case
**by semantic match**. Future panels see the precedent, the reasoning, the
guardrail's ratification, and the dissent — and they have to either follow
it or explicitly distinguish their facts from it.

This is the durable artifact of Tribunal: **typed case law on Walrus**, not
chat-memory clones, not a single oracle's confident wrong answer.

---

## The integrity story in one paragraph

The question hash, the locked `configHash` (model stack + prompt + sources),
the locked `guardrailConfigHash`, and the verdict are all on Sui. Every
piece of reasoning — debate transcript, jury deliberation, guardrail
ruling, case law summary, full provenance audit row — is on Walrus, typed,
seal-gated where in-progress and public when settled. The on-chain
`evidence_ref` carries the Walrus blob id and a sha256 of the bundle; any
reader can fetch the Quilt, hash it, and verify it matches what the chain
remembers. Swap a model silently and `assert_resolution` aborts. Replay the
run with the pinned configHashes and resolverCommit, and you get the same
verdict — that's reproducibility, not vibes.

---

## Try it

```bash
# 1) end-to-end against the live testnet package
cd sdk && node --import tsx scripts/verify-v3-flow.mts

# 2) drive it through the UI
cd ../app && pnpm dev
# open http://localhost:3000, summon a case, stake both sides, resolve
```

Every digest in the verifier output is real, fetchable via Suiscan. Every
Walrus quilt id is real, readable from the aggregator. There is no demo
mode.
