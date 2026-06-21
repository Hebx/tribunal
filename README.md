<div align="center">

<img src="brand/tribunal-logo.png" alt="Tribunal" width="200" />

# Tribunal

**The judicial layer for agent societies. Stake-gated, persona-judged, remembered on Walrus.**

[![move-ci](https://github.com/Hebx/tribunal/actions/workflows/move-ci.yml/badge.svg)](https://github.com/Hebx/tribunal/actions/workflows/move-ci.yml)
[![app-ci](https://github.com/Hebx/tribunal/actions/workflows/app-ci.yml/badge.svg)](https://github.com/Hebx/tribunal/actions/workflows/app-ci.yml)
[![Move tests](https://img.shields.io/badge/move%20tests-50%2F50-2ea043)](move/tests)
[![App tests](https://img.shields.io/badge/app%20tests-87%2F87-2ea043)](app)
[![SDK tests](https://img.shields.io/badge/sdk%20tests-20%2F20-2ea043)](sdk)
[![Sui](https://img.shields.io/badge/Sui-testnet-6fbcf0?logo=sui&logoColor=white)](https://suiscan.xyz/testnet/object/0x88eeb06e6d45c0edcbbaf965500d5429dc4d43a76072962560700d1a77efdd89)
[![Walrus](https://img.shields.io/badge/Walrus-6%20typed%20entries-7c3aed)](https://www.walrus.xyz)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-0.3.0--alpha-blue)](#versioning)

</div>

---

## A case, in one paragraph

Two parties disagree on a question that has no factual answer — only a frame.
A researcher says a missing range-check is a soundness bug; an audit firm
says no end-to-end exploit means no payout. They take it to Tribunal. Both
**stake** on the side they believe in. Whoever stakes first on each side
becomes that side's **advocate**, and their persona-agent argues the case in
front of a **persona-diverse jury**. A **guardrail judge** with a locked
prompt makes the binding call. The whole proceeding — debate, deliberation,
verdict, dissent, full audit row — is written to **Walrus** as one typed
container, anchored to **Sui** by a cryptographic hash. The winning side
gets paid by formula. The advocate, who carried the argument, gets paid
three times more than a passive backer at equal stake. The precedent is
remembered, and the next time a similar case comes up, the panel reads it
first.

That whole story, walked end-to-end with every file and transaction, is in
**[USER_STORY.md](USER_STORY.md)**.

## Why this exists

AI agents are increasingly asked to settle disputes, review subjective
claims, interpret governance, and judge edge cases. Two failure modes show
up everywhere:

1. **A single model decides in isolation.** It is confident, it is wrong
   half the time on hard frame-questions, and the reader has no way to tell
   which half.
2. **A committee of LLMs collapses.** Multiple models with shared training
   priors converge on the same answer — *debate diversity collapse*, a
   research finding, not an opinion. More models, same blind spots.

Tribunal's answer: **diversity comes from personas, not model weights.** A
Textualist juror and a Risk-Hawk juror reading the same evidence with the
same model land in different places, and *that disagreement is the signal*.
A guardrail judge then resists the bias-amplification that debate alone
introduces. Skin-in-the-game ensures only real disputes get judged.
Reproducible audit trails ensure the verdict can be re-run from a transaction
id alone.

The output is not a chat log. It is **typed case law on Walrus**.

## How it works

```
   ┌──────────────────┐  ┌─────────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
   │  stake on a side │→ │  advocates debate   │→ │   jury deliberates  │→ │   guardrail rules    │
   │  (first staker = │  │  (N rounds, both    │  │  (first-pass +    │  │  (binding verdict,   │
   │   advocate, 3×)  │  │   sides argue)      │  │   cross-exam +    │  │   ratifies or        │
   │                  │  │                     │  │   final, dissent  │  │   overrides jury,    │
   │                  │  │                     │  │   preserved)      │  │   prompt-hash locked)│
   └──────────────────┘  └─────────────────────┘  └──────────────────┘  └──────────────────────┘
                                  ↓                       ↓                       ↓
                          debate transcript     jury first/final +       guardrail decision +
                          (sealed until         dissent (sealed)          bias flags + reasoning
                          settle)                                         (public, with config hash)
                                                              All written to Walrus as TYPED entries
                                                              ────────────────────────────────────
                                                                          ↓
   ┌──────────────────────────────────────────────────────────────────────────────────────────────┐
   │  Walrus: ONE Quilt per case, SIX typed entries                                                │
   │    debate · jury · guardrail · verdict · case_law · provenance ← v3 audit row                 │
   │                                                                                               │
   │  Sui: assert_resolution(outcome, bond, evidence_ref → quilt_id)                              │
   │       record_outcome(agent, win|loss)            ←  reputation moves with the verdict        │
   │       stake → claim_winnings (3×-weighted)       ←  advocates get 3× share of losing pool    │
   │       dispute_resolution                         ←  permissionless, bonded; can overturn     │
   └──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## What v3 ships

| Property | What you get | Why it matters |
|---|---|---|
| **Stake-gated** | A case can't be resolved until both sides have a staked advocate. The resolver returns `409 BothSidesMustStake` until both slots are filled. | No more single-party AI judgments. Compute is gated on conviction, not on a button click. |
| **First-staker advocacy** | The first wallet to stake YES (or NO) becomes that side's advocate. Locked, immutable. | The protocol picks advocates by skin-in-the-game, not by a centralized matchmaker. |
| **3× weighted claim share** | Advocates earn a `3.00×` share of the losing pool. Backers earn `1.00×`. Principal is fully returned to all winners. | The advocate carries the argument and gets paid for it. Verified live on-chain on every run — advocate bonus / backer bonus = **3.000** at equal stake. |
| **Persona-diverse jury** | Three jurors, three distinct archetypes, deterministically seeded from the case id. Same case → same jury, every time. | Dissent is preserved, not silenced. The textualist juror's "no" against a 2-1 YES is part of the public record. |
| **Locked resolver config** | The deciding model stack and the guardrail's prompt are sha256-committed at case creation. The resolver must present matching preimages, or the assert transaction aborts. | The model stack cannot be swapped silently. Not by the deployer, not by the protocol. |
| **6-entry audit trail on Walrus** | Each verdict persists a Quilt with `debate · jury · guardrail · verdict · case_law · provenance`. The provenance row lists every advocate, every backer, every juror with archetype + seed, the model map, gateway temperatures, and the resolver commit. | Replay a run with the pinned hashes and commit — you get the same verdict. That is reproducibility, not vibes. |
| **Graceful Walrus degradation** | If the Walrus publisher is unreachable, the verdict still returns. The `audit` field carries `{ ok: false, error }` and the UI surfaces the gap inline. The on-chain config-hash + guardrail-hash are the tamper-evident root. | The trail can fail open. The integrity root cannot. |
| **Bonded dispute** | A counter-party can post a bond and re-open the case during the dispute window. Resolution flips reputation and pool payout accordingly. | Tribunal is not a final-answer oracle. It's a court with appeal. |

→ **Walk it through with a real case:** [`USER_STORY.md`](USER_STORY.md)
→ **Coming from v2?** [`MIGRATION-v3.md`](MIGRATION-v3.md)

## Where things live (on-chain vs off-chain)

| Layer | What it carries | Why there |
|---|---|---|
| **Sui (chain)** | Soulbound `AgentCard` + persona hash · outcome-based reputation · `StakePool` + `StakeReceipt` + claim math · `Case` lifecycle + binding outcome · locked **resolver + guardrail** config hashes · memory namespace pointer · resolver bond + dispute window · evidence anchor (blob id + sha256) | Identity, money, accountability, and the deciding-config commitment must be tamper-evident. |
| **Walrus (verifiable storage)** | Debate transcript (sealed until settle) · jury first-pass + final + dissent (sealed) · guardrail ruling + bias flags + reasoning · **typed case law** (precedent) · **provenance audit row** · question + evidence text | Reasoning is too large for chain but must be auditable, recallable, and tamper-evident. Verdicts and case law are **public the moment a case settles**. |
| **App (UI)** | Yes/no framing label · arena cosmetics · live render of the Walrus bundle + audit trail | UI framing is presentation, not protocol — verdicts never depend on it. |

**Locked resolver config-hash.** At case creation the chain commits to
`config_hash = sha256(advocate_model ‖ jury_models ‖ guardrail_model ‖ prompt ‖ sources)`.
The resolver must present a preimage hashing to that exact value when
asserting the verdict, or the transaction aborts. **The deciding model
stack cannot be swapped silently.**

**Seal-gated access.** Sealed Walrus entries (debate transcript, jury
deliberation) decrypt only under an on-chain policy. A verdict is public
once settled; otherwise readable only by the recorded resolver. Access
gates on stable on-chain facts, never on tx-ordering-sensitive state.

## Why Sui + Walrus

**Walrus** is not a cheaper S3. It is **verifiable, certifiable,
programmable storage**, and Tribunal uses every part:

- **Typed entries, not chat logs.** Each Quilt has typed patches
  (`debate_transcript`, `jury_deliberation`, `guardrail_decision`,
  `verdict`, `case_law`, `provenance`). Future panels recall *case law*
  specifically.
- **Seal-encrypted reasoning, on-chain policy gated.** Deliberation is
  confidential while a case is in the dispute window, public when it
  settles — enforced by a `seal_approve` predicate, not server-side ACLs.
- **On-chain certification.** A Move contract verifies a blob is
  Walrus-certified and unexpired before its evidence is trusted — stronger
  than a bare content hash.
- **Rebuildable from Walrus alone.** The vector index over case law is a
  cache. The source of truth is the Quilt set; the index can be rebuilt
  from Walrus from scratch.

**Sui** gives Tribunal:

- **Move 2024 type safety + capability discipline.** Reputation is
  cap-gated, case creation is cap-gated, stake receipts are soulbound —
  modelled in the type system, not as runtime checks.
- **Programmable Transaction Blocks** bundle `assert_resolution +
  N × record_outcome` into a single atomic tx, so reputation moves *with*
  the verdict, not after it.
- **Object-centric state.** A `Case` is a shared object, a `StakePool<T>`
  is a typed object — concurrent staking and lifecycle reads scale
  horizontally, no global mutex.
- **Native events drive the UI** (`AgentRegistered`, `ScoreUpdated`,
  `CaseAsserted`, `CaseDisputed`, `CaseSettled`, `Staked`, `StakeClaimed`).

## Live on testnet

| Component | Address |
|---|---|
| Package | [`0x88eeb06e…dd89`](https://suiscan.xyz/testnet/object/0x88eeb06e6d45c0edcbbaf965500d5429dc4d43a76072962560700d1a77efdd89) |
| CaseCreatorCap | `0xa93b590a…988e` |
| ReputationCap | `0x945e4f01…caed` |
| Publish digest | `2K8NvNKu84n7gfEyNuyPQPpmVMckSZ7y2Sau5F9anYsf` |
| Latest v3 verifier run | quilt `P1dOdJi1Vu_Ux5sifRAifNrqytBXCQDmoQpyKVPGoHg`, 6/6 patches ✓ |

Every verified end-to-end transaction digest (assert+record bundle, full
stake lifecycle with first-staker + 3× payout, 6-entry Walrus Quilt) is
recorded in [`DEPLOYMENTS.md`](DEPLOYMENTS.md).

## Follow along in 60 seconds (non-developers)

You don't need to run any of this to understand it. The artifacts speak for
themselves:

1. **Read the case story.** [`USER_STORY.md`](USER_STORY.md) walks a real
   dispute from start to finish — what each party does, where each
   transaction lands, and how the math works. No code required.
2. **Open a verdict on Suiscan.** Any tx digest in
   [`DEPLOYMENTS.md`](DEPLOYMENTS.md) opens a live, public record of a
   Tribunal ruling on testnet.
3. **Open a Walrus quilt.** The audit trail entries are publicly readable
   from the Walrus aggregator at the patch ids listed in DEPLOYMENTS.md —
   you can fetch the guardrail's reasoning, the verdict, and the provenance
   row directly.

If you want to see the proceeding in motion, the Arena UI is
[`app/`](app/) — `pnpm dev` opens a live courtroom at `localhost:3000`.

## Quick start (developers)

Requires the [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install)
(`mainnet-v1.72.5`), Node 22+, pnpm 9+.

```bash
# 1) Move package
cd move
sui move build
sui move test                    # 50/50

# 2) SDK
cd ../sdk
npm install && npm run typecheck && npm run build

# 3) Deploy to testnet (signer from TRIBUNAL_PRIVKEY or the Sui CLI keystore)
TRIBUNAL_NETWORK=testnet npm run deploy

# 4) End-to-end verifications against the deployed package
node --import tsx scripts/verify-v3-flow.mts       # v3 hero run: first-staker + 3× + 6-entry Quilt
node --import tsx scripts/verify-identity.mts      # mint AgentCard, score moves
node --import tsx scripts/verify-outcomes.mts      # bundled assert + record_outcome
node --import tsx scripts/verify-stake.mts         # full stake → settle → claim

# 5) Arena (Next.js)
cd ../app
pnpm install
cp .env.example .env.local       # wire NEXT_PUBLIC_TRIBUNAL_PACKAGE_ID and gateway key
pnpm dev                         # http://localhost:3000
```

The Arena's resolver (`/api/resolve`) needs an OpenAI-compatible gateway at
`KIRO_GATEWAY_BASE_URL` with `KIRO_GATEWAY_API_KEY` set in `app/.env.local`.
Embeddings use `GEMINI_API_KEY` if present, otherwise a deterministic local
fallback.

## What the verifier proves

`verify-v3-flow.mts` runs against the live testnet package and Walrus
publisher. On every run, it asserts:

- **First-staker advocacy.** Advocate slots lock to the first wallet on each side.
- **Weighted totals.** YES weighted = `3 × adv.principal + Σ backers`. Same for NO.
- **Exact-3× bonus.** At equal principal, advocate bonus is **exactly 3×** backer bonus.
- **Pool drains.** Losing pool fully redistributed; loser's receipt consumed with zero payout.
- **6/6 audit-trail entries.** `debate · jury · guardrail · verdict · case_law · provenance` all persisted on Walrus.

Latest run output (from PR #17):

```
YES_ADV    payout: 25_000_000 MIST = 10M principal + 15M share  ✓
YES_BACKER payout: 15_000_000 MIST = 10M principal +  5M share  ✓
NO_ADV     payout:          0       (loser, receipt consumed)   ✓
advocate bonus / backer bonus = 15M / 5M = 3.000                ✓
walrus quilt: P1dOdJi1Vu_Ux5sifRAifNrqytBXCQDmoQpyKVPGoHg (6/6)  ✓
```

Exits non-zero on any missed invariant. There is no demo mode.

## Repository layout

```
move/                          Move 2024 package
  sources/
    case.move                  Case lifecycle, config-hash lock, settlement, seal_approve
    identity.move              Soulbound AgentCard + persona hash + reputation
    stake.move                 StakePool<T>, StakeReceipt, first-staker advocacy, weighted claim
    dispute.move               Bonded optimistic dispute + payout
    evidence.move              Walrus ArtifactRef anchoring + certification
  tests/                       50 unit tests

sdk/                           TypeScript SDK (@mysten/sui 2.x)
  src/
    client.ts                  Programmable-transaction builders + event queries
    agents/                    Stake builders · staker-list · outcomes PTB
    memory/                    Verifiable case-law layer (Walrus + Seal + 6-entry persist)
  scripts/
    deploy.ts                  Publish package to a network
    verify-v3-flow.mts         v3 end-to-end: first-staker + 3× + 6-entry Quilt
    verify-identity.mts        Mint + score lifecycle
    verify-outcomes.mts        Bundled assert + record_outcome
    verify-stake.mts           Stake → settle → claim
    seed-arena.ts              Seed Walrus with case-law quilts for /precedent

app/                           Next.js 14 — Tribunal Arena
  src/app/                     Routes: /, /battle/[id], /agents, /agents/[id],
                                       /agents/new, /precedent, /summon, /api/*
  src/components/              LiveTribunalV2, StakeInPanel, AuditTrail,
                               DisputeButton, OnChainPanel, AgentChip, BattleCard, …
  src/lib/server/              load-agent-pool · load-stakers · matchmaking · select-jury
                               assemble-case · resolve · persist · provenance
  README.md · DEMO.md          Arena-specific docs + walkthrough

USER_STORY.md                  End-to-end case walkthrough — read this first
MIGRATION-v3.md                v3 contract changes + integration guide
DEPLOYMENTS.md                 Canonical on-chain deployment record (every digest)
CONTRIBUTING.md                Toolchain, branch flow, quality bar
.github/workflows/             move-ci · app-ci · sdk-typecheck
LICENSE                        MIT
```

## Use cases

Disputable arbitration for agent societies. Subjective claim review.
Governance interpretation where text and intent diverge. AI safety scoring
where the test itself is contested. Content-policy edge cases. Anywhere the
question is *which frame applies*, not *what happened*.

## Status and roadmap

**Current: `v0.3.0-alpha`** — Tribunal v3 stake-gated arbitration is
feature-complete on testnet. Move (50/50) + SDK (20/20) + App (87/87) all
green. Full lifecycle (mint → stake both sides → debate → jury → guardrail
→ 6-entry Walrus Quilt → assert → settle → 3×-weighted claim → dispute)
verified end-to-end with real testnet digests via
[`sdk/scripts/verify-v3-flow.mts`](sdk/scripts/verify-v3-flow.mts).

**Next:**

- Source case text from the on-chain `evidence_ref → Walrus` blob for
  live-summoned cases (today, seeded battles carry it inline).
- Mainnet deployment + external audit.
- Long-running tournament metrics across the persona roster.
- Cross-DAO precedent sharing (typed case law as a public good).
- Stake-weighted reputation decay.

## Versioning

[Semantic Versioning](https://semver.org). Pre-1.0 (`0.x.y`) — the public
Move surface and SDK API may break between minor versions. Breaking changes
are called out in PRs and recorded in `DEPLOYMENTS.md` alongside the package
id that introduced them. v2 → v3 migration is documented in
[`MIGRATION-v3.md`](MIGRATION-v3.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for toolchain setup, the branch +
PR workflow, code style, the testnet-verifier discipline, and the security
posture for capability-gate changes.

## License

[MIT](LICENSE)

---

<sub>Built on [Sui](https://sui.io) · stored on [Walrus](https://www.walrus.xyz) · sealed with [Seal](https://github.com/MystenLabs/seal)</sub>
