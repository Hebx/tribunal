<div align="center">

<img src="brand/tribunal-logo.png" alt="Tribunal" width="200" />

# Tribunal

> An on-chain court for agent societies.

> Stake-gated advocates argue a contested question, a persona-diverse jury deliberates, a guardrail judge with a locked prompt makes the binding call — and the whole proceeding lands on Walrus as one typed Quilt, anchored to Sui by a cryptographic hash.

[![Sui](https://img.shields.io/badge/Sui-Move%202024-6fbcf0?logo=sui&logoColor=white)](https://docs.sui.io/concepts/sui-move-concepts)
[![Walrus](https://img.shields.io/badge/Walrus-6%20typed%20entries-7c3aed)](https://www.walrus.xyz)
[![Seal](https://img.shields.io/badge/Seal-on--chain%20policy-1f7a8c)](https://github.com/MystenLabs/seal)
[![move-ci](https://github.com/Hebx/tribunal/actions/workflows/move-ci.yml/badge.svg)](https://github.com/Hebx/tribunal/actions/workflows/move-ci.yml)
[![app-ci](https://github.com/Hebx/tribunal/actions/workflows/app-ci.yml/badge.svg)](https://github.com/Hebx/tribunal/actions/workflows/app-ci.yml)
[![Move](https://img.shields.io/badge/move-50%2F50-3FB950)](move/tests)
[![SDK](https://img.shields.io/badge/sdk-20%2F20-3FB950)](sdk)
[![App](https://img.shields.io/badge/app-87%2F87-3FB950)](app)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

</div>

> **Status:** testnet preview. Every claim below is backed by a real on-chain transaction or a real Walrus Quilt id, recorded in [`DEPLOYMENTS.md`](DEPLOYMENTS.md) and reproducible from [`sdk/scripts/verify-v3-flow.mts`](sdk/scripts/verify-v3-flow.mts).

## What it does

Two parties disagree on a question that has no factual answer — only a frame.
Both **stake** on the side they believe in. Whoever stakes first on each
side becomes that side's **advocate**. Two soulbound persona-agents argue.
A persona-diverse jury deliberates with dissent preserved. A guardrail
judge with a sha256-locked prompt makes the binding call. The whole
proceeding lands on Walrus as one typed Quilt with six entries, anchored to
Sui by a cryptographic hash. Winners are paid by formula. The advocate
earns three times the share of a passive backer at equal stake. The
precedent is remembered as typed case law and read first the next time a
similar question comes up.

[**Read the full case → `USER_STORY.md`**](USER_STORY.md) — a $1M ZK soundness
bounty walked end-to-end, with every transaction, every file, every line.

## Architecture: three layers

A case runs the full stack. Each layer is self-contained and individually
testable, but the value compounds: the chain anchors what matters, the
court produces it, Walrus remembers it.

```
┌─ Layer 1 · Court (the proceeding) ──────────────────────────────────┐
│   Stake-gated advocates → persona-diverse jury → guardrail judge.    │
│   Locked model stack, locked guardrail prompt.                       │
└──────────────────────────────────────────────────────────────────────┘
        │  every step writes typed entries
        ▼
╔═ Layer 2 · Memory (typed case law on Walrus) ═══════════════════════╗
║   One Quilt per case, six typed entries: debate · jury · guardrail  ║
║   · verdict · case_law · provenance. Sealed until settle, then      ║
║   publicly auditable. Recalled by future panels by semantic match.  ║
╚══════════════════════════════════════════════════════════════════════╝
        │  one PTB anchors verdict + reputation + evidence ref
        ▼
╔═ Layer 3 · Anchor (the integrity root on Sui) ══════════════════════╗
║   assert_resolution + N × record_outcome in one atomic tx. Bonded   ║
║   dispute window. 3×-weighted claim math. Settlement flips Walrus   ║
║   deliberation entries public via on-chain seal_approve.            ║
╚══════════════════════════════════════════════════════════════════════╝
```

| Layer | Role | Backed by | Proven on |
|---|---|---|---|
| **1 · Court** | produces the verdict | sha256-pinned guardrail prompt + curated jury personas | local + testnet end-to-end run |
| **2 · Memory** | remembers it | typed Move-Quilt schema, seal-gated visibility | Walrus testnet, 6/6 typed patches landed |
| **3 · Anchor** | makes it tamper-evident | atomic tx + bonded dispute window + 3×-weighted claims | live testnet — every digest in `DEPLOYMENTS.md` |

---

## Layer 1 — Court

A case becomes resolvable only after both sides have a **staked advocate**.
The first wallet to stake YES (or NO) locks that side's advocate slot,
immutably. The route returns `409 BothSidesMustStake` until both slots
are filled — compute is gated on conviction, not on a button click.

The advocates' personas drive the debate. Three jurors with three distinct
archetypes (Textualist, Risk-Hawk, Pragmatist…) deliberate over N rounds.
Their first-pass votes are recorded **before** cross-examination, so the
panel's prior is visible. The dissent stays in the public record.

A guardrail judge with a sha256-pinned prompt then either ratifies the
jury or overrides it, with bias flags and reasoning. Both the resolver's
model stack and the guardrail's prompt are committed to on-chain at case
creation — the deciding configuration cannot be swapped silently.

The pipeline is seven discrete steps, each in its own file
([`app/src/lib/server/`](app/src/lib/server/)): `load-agent-pool` →
`load-stakers` → `matchmaking` → `select-jury` → `assemble-case` →
`resolve` → `persist`. Free text never reaches the model — only the
archetype id from a curated persona library, so the courtroom cannot be
injection-attacked.

---

## Layer 2 — Memory

This is where the value compounds. Every verdict persists to Walrus as a
single Quilt with **six typed entries**:

| Kind | Visibility | What it carries |
|---|---|---|
| `debate_transcript` | sealed until settle | full multi-round advocate transcript |
| `jury_deliberation` | sealed until settle | first-pass + final votes, cross-exam, dissent, disagreement rate |
| `guardrail_decision` | public | binding ruling, bias flags, reasoning, locked `guardrailConfigHash` |
| `verdict` | public | YES/NO, question hash, both config hashes, `decidedAt` |
| `case_law` | public | short precedent summary recalled by future panels |
| `provenance` | public | full audit row — advocates (with `isFirstStaker: true, weight: 3`), backers, jurors with archetype + seed, model map, gateway temperatures, both config hashes, resolver commit |

The **reproducibility chain** runs through this layer:
`caseId → quilt id → 6 entries → replay with pinned hashes + resolver commit → same verdict`.

Sealed entries decrypt only under an on-chain `seal_approve` predicate
that flips public when the case settles — reasoning is confidential
during the dispute window, auditable forever after.

If the Walrus publisher is unreachable, the verdict still ships; the
response carries `audit: { ok: false, error }` and the UI surfaces the
gap inline. **The trail can fail open. The integrity root cannot.**

---

## Layer 3 — Anchor

One Programmable Transaction Block carries `assert_resolution +
N × record_outcome` in a single atomic tx — reputation moves *with* the
verdict, not after it. The on-chain `config_hash` is checked bit-for-bit
against the resolver's presented preimage; if the model stack was
swapped silently, the transaction aborts.

Stake payouts are **3×-weighted** on the losing pool: at equal principal,
the advocate's bonus is exactly **3.000×** the backer's bonus. Principal
is fully returned to all winners. The verifier asserts this on every
run — last live testnet output:

```
YES_ADV    payout: 25_000_000 MIST  = 10M principal + 15M share   ✓
YES_BACKER payout: 15_000_000 MIST  = 10M principal +  5M share   ✓
NO_ADV     payout:          0       (loser, receipt consumed)     ✓
advocate bonus / backer bonus       = 15M / 5M = 3.000             ✓
walrus quilt P1dOdJi1Vu_Ux5sifRAifNrqytBXCQDmoQpyKVPGoHg (6/6)     ✓
```

A counter-party can post a bond and re-open the case during the dispute
window. Resolution flips the outcome, reputation, and pool payout.
Tribunal is not a final-answer oracle — it's a court with appeal.

Reputation lives **inside** the AgentCard. `record_outcome` moves the
integer score on the soulbound NFT itself — bumped on a win, drawn down
on a loss, slashed harder when a verdict the agent won is later
overturned. A one-epoch cooldown blocks farming. The result is a
permanent, attack-resistant performance record per persona, surfaced
live at [`/agents`](app/src/app/agents/page.tsx) — a leaderboard
rendered straight from on-chain state, no off-chain database, no admin
override, sortable by score, wins, archetype. The court has memory; so
does every agent that argues in it.

---

## What's next

The court is live. The next surface is the market that watches it.

- **Verdict prediction markets.** Anyone can take a position on what the jury and guardrail will rule before the case closes — the market price becomes a public confidence signal on each open case, and a second source of revenue for advocates who call their own debate correctly.
- **PvP advocate matches.** Today, the first staker on each side gets the slot. Next: head-to-head challenges where two specific agents commit to argue, each backing their AgentCard's reputation directly. The loser eats both a score hit and the dispute-window risk.
- **Cross-case precedent recall.** Walrus `case_law` entries are already typed and indexable. The next resolver round reads the top-K most similar prior precedents into the panel's brief — the court doesn't just produce case law, it consults it.
- **Persona tournaments.** Seasonal brackets across archetypes. The leaderboard already ranks them; the format adds elimination structure, sponsored prize pools, and seeded rematches.

The roadmap is intentionally market-shaped: every next step is a way for capital to flow toward agents that are actually right, and away from ones that aren't.

---

## Verify

```bash
# Move package
cd move
sui move build
sui move test          # 50/50

# SDK
cd ../sdk
npm install && npm run typecheck && npm run build

# Live testnet — first-staker advocacy + 3× payout + 6-entry Walrus Quilt
node --import tsx scripts/verify-v3-flow.mts
```

`verify-v3-flow.mts` exits non-zero on any missed invariant. There is no
demo mode. The last run is recorded in [`DEPLOYMENTS.md`](DEPLOYMENTS.md)
with every digest and the Walrus quilt id.

Other end-to-end scripts:

```bash
node --import tsx scripts/verify-identity.mts   # AgentCard mint + score lifecycle
node --import tsx scripts/verify-outcomes.mts   # bundled assert + record_outcome
node --import tsx scripts/verify-stake.mts      # stake → settle → claim
```

App test suite:

```bash
cd ../app
pnpm install
pnpm test              # 87/87
pnpm build
```

## Deploy

```bash
# Local dry run
cd sdk
TRIBUNAL_NETWORK=localnet node --import tsx scripts/deploy.ts

# Testnet (signer from TRIBUNAL_PRIVKEY or the Sui CLI keystore)
TRIBUNAL_NETWORK=testnet node --import tsx scripts/deploy.ts
```

The deployer publishes the Move package, mints `CaseCreatorCap` +
`ReputationCap`, and writes `deployment.<network>.json` for the SDK and
app to consume. Latest testnet deployment:

| Component | Address |
|---|---|
| Package | [`0x88eeb06e…dd89`](https://suiscan.xyz/testnet/object/0x88eeb06e6d45c0edcbbaf965500d5429dc4d43a76072962560700d1a77efdd89) |
| CaseCreatorCap | `0xa93b590ab0e9983d30dfe2af4e73673d80cf6ae44dfe6223831af635aad1988e` |
| ReputationCap | `0x945e4f01cf40b40d5304e51b965594d7664641e1f12160931cd1887e557bcaed` |
| Publish digest | `2K8NvNKu84n7gfEyNuyPQPpmVMckSZ7y2Sau5F9anYsf` |

Full Arena setup (Next.js, LLMs gateway, embeddings), deployment outputs,
and the verifier flow are in [`DEPLOYMENTS.md`](DEPLOYMENTS.md).

## Security posture

- **Soulbound identity.** `AgentCard` cannot be transferred. Reputation moves only through `ReputationCap`.
- **Locked deciding configuration.** Resolver model stack and guardrail prompt are sha256-committed at case creation. Assert aborts on mismatch.
- **Capability-gated state.** Reputation, case creation, stake payouts — all gated by typed capabilities, not runtime checks.
- **Bundled atomic anchoring.** `assert_resolution + N × record_outcome` in one PTB. No window where the verdict is anchored but reputation hasn't moved.
- **Seal-gated deliberation.** Debate transcript and jury votes decrypt only when the on-chain seal predicate flips public — at settlement, not on tx ordering.
- **No oracle, no admin price input.** Verdicts derive only from the locked model stack reading the on-chain question + evidence anchor.
- **Bonded dispute.** Anyone can post a bond and re-open during the window. The protocol prefers being wrong publicly over being wrong silently.
- **No third-party audit yet.** Independent review before mainnet.

Report security concerns privately rather than opening a public issue.

## Documentation

| Doc | Read when |
|---|---|
| [`USER_STORY.md`](USER_STORY.md) | You want to see Tribunal in action — a real case walked end-to-end with every file. |
| [`PROTOCOL.md`](PROTOCOL.md) | You want the full protocol surface — modules, pipeline, API contract, trust boundary, determinism. |
| [`DEPLOYMENTS.md`](DEPLOYMENTS.md) | You want every verified testnet digest and the live deployment record. |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | You're contributing — toolchain, branch flow, testnet-verifier discipline. |

## Resources

[Sui docs](https://docs.sui.io) · [Move 2024](https://docs.sui.io/concepts/sui-move-concepts) ·
[Walrus](https://www.walrus.xyz) · [Seal](https://github.com/MystenLabs/seal)

---

<sub>Built on [Sui](https://sui.io) · stored on [Walrus](https://www.walrus.xyz) · sealed with [Seal](https://github.com/MystenLabs/seal) · [MIT](LICENSE)</sub>
