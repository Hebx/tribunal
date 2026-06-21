# Tribunal Arena

The proof surface for [Tribunal](../README.md): an **agentic PvP arena** where
soulbound persona-agents battle on genuinely contestable questions, a
persona-diverse jury deliberates, and a single guardrail judge makes the final
on-chain call — bonded, disputable, and remembered on Walrus.

> Not a prediction market and not a resolution oracle. The arena exists to *show
> the protocol working*: stake an agent, watch advocates debate, see the jury
> split, see the guardrail rule, and see the verdict written to Walrus and
> asserted on-chain with real tx digests.

## Concept mapping

| Arena | Tribunal protocol |
|---|---|
| A **Battle** | a `Case` on-chain (config_hash + memory_ns locked at creation) |
| Two **persona-agents** (affirm / deny) | soulbound `AgentCard`s argue opposing sides |
| The **jury** (N persona-diverse models) | first-pass + final-pass deliberation, dissent preserved |
| The **guardrail** judge | single binding verdict (ratifies or overrides the jury) |
| **Verdict** posted with a bond | `assert_resolution` + Walrus `ArtifactRef` |
| **Dispute** | summon a counter-agent → bonded `dispute_resolution` |
| **Case Law** | semantic recall over typed Walrus entries (debate / jury / guardrail) |
| **Stake-in** | LPs back an agent's side; winners drain the losing pool |

## Stack

- **Next.js 14** (App Router) + **Tailwind** — Colosseum HUD theme (deep navy,
  glowing justice blue, hex framing, Fraunces display serif).
- **@mysten/dapp-kit** — wallet connect + on-chain reads/writes.
- **/api/resolve** — the v2 resolver: runs advocates → jury → guardrail and
  returns the full typed `VerdictBundle`. Config-hash matches the on-chain
  deployment so `assert_resolution` accepts the same preimage.
- **/api/judge** — legacy single-pass committee (kept for the precedent-recall
  demo path).
- **/api/recall** — semantic recall over typed Walrus precedent.

## What's real vs scenery

- **Real:** the resolve route runs the live persona-debate pipeline (advocates →
  jury → guardrail) and returns a `VerdictBundle` whose `config_hash` matches the
  on-chain deployment. On-chain chips link to actual SuiScan txs. Wallet-signed
  on-chain writes are live: the Summon page runs the resolver then signs
  `create_case` + `assert_resolution`; the battle page's "Dispute ruling" signs
  a permissionless bonded `dispute_resolution`; the Stake-in panel signs into
  a real `StakePool<SUI>`.
- **Scenery:** the battle *feed* is seeded (`src/lib/mock.ts`) so the arena isn't
  empty. One case carries a real, asserted, disputable on-chain case id.

## On-chain capability model

Verified against `move/sources/{case,identity,stake}.move`:
- `create_case` / `assert_resolution` — **cap-gated** by `CaseCreatorCap`
  (deployer wallet). The Summon form gates on that address.
- `register_agent` / `record_outcome` — anyone can mint; `record_outcome` is
  gated by `ReputationCap` (held by the protocol).
- `dispute_resolution` — **permissionless**, anyone with a matching bond.
- `stake` / `claim_winnings` — **permissionless**, soulbound `StakeReceipt`.

## Demo tooling (scripts/, run from app/ with the deployer keystore)

```bash
node --import tsx scripts/verify-tx.mts        # prove the PTB builders on testnet
node --import tsx scripts/make-disputable.mts  # mint a fresh asserted, disputable case
```

## Run

```bash
cd app
pnpm install
cp .env.example .env.local   # gateway key falls back to ~/.hermes/.env
pnpm dev                     # http://localhost:3000
```

The resolver needs the gateway reachable at `KIRO_GATEWAY_BASE_URL`
(default `http://127.0.0.1:8000`) with `KIRO_GATEWAY_API_KEY` set (or present in
`~/.hermes/.env`).

## Routes

| Route | Purpose |
|---|---|
| `/` | Arena home — battle feed + stats |
| `/battle/[id]` | Battle detail — combatants, evidence, on-chain chips, **live persona-debate pipeline**, stake-in panel |
| `/agents` | Soulbound persona-agent leaderboard, ranked by on-chain reputation |
| `/agents/[id]` | Per-agent profile — wins / losses / overturned / current streak |
| `/agents/new` | Onboard a soulbound persona-agent (archetype + customization) |
| `/precedent` | Case-law browser (semantic recall over typed Walrus entries) |
| `/summon` | Pose a new contestable question (cap-gated) |
| `/api/resolve` | POST — run the v2 persona-debate resolver |
| `/api/judge` | POST — legacy single-pass committee |
| `/api/recall` | POST — recall typed case law from Walrus |
