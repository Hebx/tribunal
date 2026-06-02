# Tribunal — Product Requirements Document (Sui-native)

**Glorian Labs · Sui Overflow 2026 · Walrus track**
**Scope: Sui-only. No EVM, no EigenLayer, no UMA, no EAS, no Solidity.**
**Toolchain: Move 2024 · sui 1.72.5 · deadline June 21 2026**

> Supersedes the EVM design in `~/clawd/research/grants/WF-1-resolution-oracle.PRD.md` (retained only as lineage). Every mechanism below is re-expressed in native Sui primitives. Walrus storage + agent-memory patterns: `~/clawd/research/WALRUS-agent-memory-patterns.md`.

---

## 1. Summary, goals, non-goals

**Tribunal** is a **multi-agent AI arbiter with verifiable, persistent memory on Walrus.** A locked-version **LLM committee** of agents resolves subjective, real-world questions; the committee **coordinates through and accumulates knowledge in a shared, Walrus-backed memory namespace** (our own verifiable-memory layer, built directly on Walrus + Seal — no external memory SDK); any bonded human or agent can dispute a verdict within a liveness window; undisputed verdicts finalize automatically; disputed ones escalate to a committee re-vote with a bonded payout. Every verdict is **tamper-evident** (on-chain config-hash commitment), **remembered** (reasoning traces + accumulated case law in the Walrus memory namespace), **auditable** (full rationale + evidence anchored on Walrus, certified on-chain), and **verifiable** (committee execution attested in a Nautilus enclave — stretch). The finalized outcome is consumed by **any downstream system** — a prediction market, a DAO process, a claims pipeline.

This is dead-center on the Walrus track thesis — "Walrus as a Verifiable Data Platform for AI" — applied to the highest-stakes agent task: making a judgment you can audit, reproduce, and challenge.

### Goals
- Give an AI arbiter **long-term verifiable memory**: the committee remembers prior verdicts, reasoning traces, and evidence across sessions (our Walrus-backed memory layer), getting sharper instead of starting cold.
- Resolve subjective questions with median undisputed settlement under one hour (liveness-window-bounded, tunable).
- Make every verdict **tamper-evident**: the model + prompt + data sources are hashed and locked on the case object at creation; the resolver must present matching config at settlement or the transaction aborts.
- Make every verdict **artifact-driven**: rationale + evidence persist as durable, reusable Walrus artifacts anchored by an on-chain `ArtifactRef`, certified before trust.
- Preserve economic security through matched bonds on the dispute path (loser forfeits bond to winner, minus protocol fee).
- Ship a thin Move + SDK + memory-adapter integration so any consumer can request a Tribunal resolution and any agent system can reuse the verifiable-memory pattern.

### Non-goals
- Tribunal does **not** host markets, custody bets, mint outcome positions, or provide liquidity. It is a neutral resolution + verifiable-memory service only.
- **No new token at launch.** Bonds use an established asset (SUI or a USDC-class `Coin<T>`); the model is fee-based.
- We do not resolve **objective price** questions — those belong to native price oracles (Pyth / Switchboard / a venue's own feed). Tribunal is for subjective, real-world questions where judgment and evidence matter.
- Nautilus enclave execution is **scoped as stretch/v2** (see §10). The core ships with an attestable off-chain committee, our Walrus-backed memory layer, and enclave-ready interfaces.

---

## 2. Users & personas

- **Question author (integrator).** Registers a subjective question for resolution and wires the finalized outcome to their consumer (a market, a DAO vote, a claims record). Defines question text, resolution criteria, evidence sources, bond size, liveness window. Wants a drop-in, predictable, *auditable* resolution source.
- **Agent consumer / disputer.** An autonomous agent that consumes resolutions *and* has standing + incentive to dispute a bad verdict — reading the case's verifiable memory and evidence to decide. First-class persona; pays via the SDK.
- **Human watchdog / disputer.** Posts a bond to challenge an incorrect committee verdict; earns the loser's bond when correct.
- **Committee operator.** Runs the multi-agent LLM committee (off-chain, attested; Nautilus enclave in v2), whose members read/write the shared **Walrus-backed memory namespace**, signs verdicts, posts the resolution + bond on-chain. Earns per-resolution fees; forfeits bond if overturned.
- **Downstream consumer.** Any market / DAO / claims system that reads the finalized Tribunal outcome to trigger its own action (payout, execution, approval).

---

## 3. User stories

- *As a question author*, I register a subjective question with criteria + evidence sources and a locked resolver config, and I receive a finalized outcome with a Walrus evidence trail + a persistent case memory so my consumer can act on it and anyone can audit *why*.
- *As an agent consumer*, I read the asserted resolution, its `evidence_ref` (certified Walrus blob), and the committee's reasoning trace from the case's Walrus memory namespace so I can decide whether to dispute before the liveness window closes — programmatically, paying the fee via the SDK.
- *As a human watchdog*, I bond against a wrong verdict and recover the resolver's bond when the dispute resolves in my favor.
- *As a committee operator*, I run the locked-version multi-agent committee over the case's shared Walrus memory namespace, post a bonded resolution, and get paid per resolution — knowing my bond is slashed to the disputer if my verdict is overturned, and that every member's reasoning is persisted for audit.
- *As a downstream consumer*, I call `get_resolution(case)` and, once `Settled`, act on the finalized outcome in one PTB.

---

## 4. System architecture

On-chain holds the case object, config-hash lock, assertion lifecycle, bonds, settlement, and the memory-namespace pointer (all Sui Move objects). Off-chain runs the multi-agent committee, its **Walrus-backed shared memory** (our memory layer), attestation, evidence packaging, and indexing.

```
                  ┌───────────────────────────────────────────────────────────────┐
                  │                   OFF-CHAIN (verifiable + remembered)            │
  question +      │   ┌──────────── Multi-Agent LLM Committee (N agents) ─────────┐  │
  criteria +      │   │  Nautilus enclave (STRETCH/v2) — execution attested        │  │
  evidence srcs   │   │  config = (model_id ‖ prompt ‖ data_sources)               │  │
                  │   │  each member reads/writes the SHARED Walrus memory ns:     │  │
                  │   │     reasoning traces · checkpoints · accumulated case law  │  │
                  │   │  each member → signed verdict + reasoning                  │  │
                  │   └───────────────┬───────────────────────────────────────────┘  │
                  │                   │ aggregate → outcome + rationale + evidence     │
                  │   Memory layer ───┤ (entries Seal-encrypted, Quilt-batched on Walrus)│
                  │   Evidence pkgr ──┘ write evidence bundle → Walrus (blob_id,sha256) │
                  └───────────────────┼───────────────────────────────────────────────┘
                                      │ assert_resolution(outcome, evidence_ref, bond, config)
                                      ▼
   ┌──────────────────────────────────────────────────────────────────────────────────┐
   │                              ON-CHAIN (Sui, Move)                                   │
   │                                                                                     │
   │  tribunal::case::Case (SHARED object)                                               │
   │     ├─ config_hash (locked at creation: sha256(model ‖ prompt ‖ sources))           │
   │     ├─ memory_ns: vector<u8>  (Walrus memory namespace for this case's committee)  │
   │     ├─ state: Open → Asserted → [Disputed] → Settled{True|False}                    │
   │     ├─ evidence_ref: ArtifactRef{ blob_id, sha256, sealed, epoch } (Walrus anchor)  │
   │     └─ bond escrow (Balance<T> held in object)                                      │
   │                                                                                     │
   │  assert_resolution() ── verifies presented config == config_hash, else ABORT        │
   │        │              ── verifies evidence blob is CERTIFIED on Walrus before trust  │
   │        ├── liveness window (N epochs) ── undisputed ──▶ settle()  ──▶ FINAL          │
   │        └── dispute_resolution(bond) ──▶ tribunal::dispute::Dispute (shared)          │
   │                    │  committee re-vote / quorum (dispute accrues to case memory)    │
   │              resolve_dispute() ── loser bond → winner (− protocol fee)               │
   │                    ▼  Case.state = Settled{...}                                      │
   └──────────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
                  Any consumer (market / DAO / claims) ── reads get_resolution() ──▶ acts
```

Key Sui-native properties: the case is a **shared object** (consensus-ordered); authority is a **non-copyable capability** (not a stored address); every lifecycle transition is an **atomic PTB** (abort = full revert); the committee's working memory is a **Walrus-backed memory namespace** (Seal-encrypted, Quilt-batched, delegate-scoped writes); evidence is a **Walrus blob anchored by an on-chain `ArtifactRef` and verified certified before trust**; private evidence fields are gated by a **Seal `seal_approve` policy**.

---

## 5. Move package spec

Move 2024, `sui 1.72.5`. Signatures + key structs; not full implementation. Three modules + shared types.

### `tribunal::case` — case object, config lock, memory pointer, assertion + settlement

```move
module tribunal::case;

use sui::balance::Balance;
use sui::clock::Clock;
use sui::event;
use tribunal::evidence::ArtifactRef;

/// Lifecycle states.
public enum CaseState has copy, drop, store {
    Open,            // created, awaiting resolution at/after expiry
    Asserted,        // resolver posted outcome + bond; liveness window open
    Disputed,        // a bonded disputer challenged; escalation in progress
    SettledTrue,
    SettledFalse,
}

/// Shared case object. One per subjective question to be judged.
public struct Case<phantom T> has key {
    id: UID,
    question_hash: vector<u8>,     // sha256(question_text ‖ resolution_criteria)
    config_hash: vector<u8>,       // sha256(model_id ‖ prompt ‖ data_sources) — LOCKED at creation
    memory_ns: vector<u8>,         // Walrus memory namespace for this case's committee
    state: CaseState,
    outcome_true: bool,            // meaningful only once Settled*
    evidence_ref: Option<ArtifactRef>,  // Walrus anchor for the verdict rationale + evidence
    resolver: Option<address>,     // who asserted (committee operator)
    resolver_bond: Balance<T>,     // escrow posted with the assertion
    expiry_epoch: u64,             // earliest epoch a resolution may be asserted
    liveness_epochs: u64,          // challenge window length
    asserted_at_epoch: u64,
    consumer_id: Option<ID>,       // the downstream object this resolves for (market / DAO / claim)
}

/// Non-copyable authority to create cases under this deployment.
public struct CaseCreatorCap has key, store { id: UID }

/// Per-case resolver authority, minted to the designated committee operator.
public struct ResolverCap has key, store { id: UID, case_id: ID }

public struct ResolutionAsserted has copy, drop {
    case_id: ID, resolver: address, outcome_true: bool,
    evidence_blob: vector<u8>, memory_ns: vector<u8>, bond: u64,
    liveness_epochs: u64, asserted_at_epoch: u64,
}
public struct CaseSettled has copy, drop { case_id: ID, outcome_true: bool, disputed: bool }

/// Create a subjective-question case. config_hash + memory_ns are locked here, never mutated.
public fun create_case<T>(
    _cap: &CaseCreatorCap,
    question_hash: vector<u8>,
    config_hash: vector<u8>,
    memory_ns: vector<u8>,
    expiry_epoch: u64,
    liveness_epochs: u64,
    consumer_id: Option<ID>,
    ctx: &mut TxContext,
): (ID, ResolverCap);  // shares the Case, returns its ID + the resolver cap

/// Committee operator posts the outcome + evidence + bond.
/// `presented_config` MUST hash-match the locked config_hash or the tx ABORTS.
/// The evidence blob SHOULD be verified certified on Walrus before trust (see evidence module).
public fun assert_resolution<T>(
    case: &mut Case<T>,
    cap: &ResolverCap,
    presented_config: vector<u8>,   // raw (model_id ‖ prompt ‖ data_sources); hashed and compared
    outcome_true: bool,
    evidence_ref: ArtifactRef,
    bond: Balance<T>,
    clock: &Clock,
    ctx: &mut TxContext,
);

/// Callable after liveness if undisputed. Returns resolver bond, marks Settled.
public fun settle<T>(case: &mut Case<T>, clock: &Clock, ctx: &mut TxContext);

/// Read path for any downstream consumer.
public fun get_resolution<T>(case: &Case<T>): (CaseState, bool);
```

### `tribunal::dispute` — bonded optimistic dispute + escalation

```move
module tribunal::dispute;

use sui::balance::Balance;
use sui::clock::Clock;
use tribunal::case::{Case, ResolverCap};

/// Shared dispute object created when someone challenges an assertion.
public struct Dispute<phantom T> has key {
    id: UID,
    case_id: ID,
    disputer: address,
    disputer_bond: Balance<T>,
    raised_at_epoch: u64,
    resolved: bool,
    resolver_won: bool,
}

public struct ResolutionDisputed has copy, drop { case_id: ID, disputer: address, bond: u64 }
public struct DisputeResolved has copy, drop { case_id: ID, resolver_won: bool, payout: u64 }

/// Challenge an Asserted case within its liveness window. Bond must match resolver bond.
/// Moves the Case to Disputed; creates a shared Dispute object.
public fun dispute_resolution<T>(
    case: &mut Case<T>,
    bond: Balance<T>,
    clock: &Clock,
    ctx: &mut TxContext,
): ID;

/// Committee re-vote / quorum result is submitted by the resolver cap holder
/// (v2: result is itself an attested-enclave output with a fresh config-hash check).
/// The re-vote reads the case's Walrus memory namespace; the dispute outcome is written back as case law.
/// Pays the full pot to the winner minus `protocol_fee_bps`; flips Case state if overturned.
public fun resolve_dispute<T>(
    case: &mut Case<T>,
    dispute: &mut Dispute<T>,
    cap: &ResolverCap,
    resolver_won: bool,
    protocol_fee_bps: u64,
    ctx: &mut TxContext,
);
```

### `tribunal::evidence` — Walrus anchor + on-chain certification + Seal-gated access

```move
module tribunal::evidence;

/// On-chain anchor to an off-chain Walrus blob holding the verdict rationale + evidence bundle.
public struct ArtifactRef has copy, drop, store {
    blob_id: vector<u8>,   // Walrus blob id
    sha256: vector<u8>,    // content hash — tamper-evidence
    sealed: bool,          // true if private fields are Seal-encrypted
    epoch: u64,            // Walrus storage epoch (renewal horizon)
}

public fun new_ref(blob_id: vector<u8>, sha256: vector<u8>, sealed: bool, epoch: u64): ArtifactRef;

/// Trust-minimized check: read the Walrus Blob Sui object and assert it is certified
/// (PoA reached) and not expired before a verdict's evidence is trusted on-chain.
/// (Stronger than a bare hash — the chain proves availability. Walrus cert method #3.)
public fun assert_certified(evidence: &ArtifactRef, blob_obj: &/* walrus::blob::Blob */ ID, clock: &sui::clock::Clock);

/// Seal policy: who may decrypt sealed evidence / memory fields. Gated on stable facts only
/// (case participation / disputer standing), never tx-ordering-sensitive state.
entry fun seal_approve(id: vector<u8>, viewer: address, case_id: ID, ctx: &TxContext);
```

**Design notes (each maps to a verified pattern):**
- **Config-hash lock** (Switchboard feed-config hashing): `config_hash` set once in `create_case`, compared in `assert_resolution`. The resolver can't silently swap models/prompts.
- **Walrus memory namespace** (`WALRUS-agent-memory-patterns.md` §5): `memory_ns` binds the case to a delegate-scoped, Seal-encrypted, Quilt-batched memory namespace we build on raw Walrus. Committee members write typed entries (reasoning traces + checkpoints) there; the namespace is recorded on-chain so the verifiable memory is discoverable and the on-chain object is the source of truth for *which* memory belongs to this case. No external memory SDK — we own the layer.
- **On-chain Walrus certification** (`WALRUS-agent-memory-patterns.md` §1, §7): `assert_certified` reads the Walrus `Blob` object to confirm PoA before trusting evidence — verifiable availability, not just a hash.
- **Consumer-agnostic** — Tribunal never models outcome tokens or positions. It produces a boolean + evidence any consumer reads. A prediction-market venue (e.g. a DeepBook Predict-style market) is just one possible `consumer_id`.
- **Cap-gated creation + atomic settle PTB** (`SUI-ecosystem-pattern-library.md` §2–3; proven in probe): `CaseCreatorCap` / `ResolverCap` non-copyable; resolve→settle is one PTB.
- **Walrus-as-evidence + memory** (`synapse_patterns_probe::register_artifact`): every verdict anchors an `ArtifactRef`; the committee's working memory lives in its Walrus namespace (Quilt + Seal). Disputers fetch both to challenge.
- **Bonded optimistic dispute**: bonds held as `Balance<T>` inside the shared objects; loser forfeits to winner minus fee.

---

## 6. Off-chain services

- **Multi-agent committee runner.** Orchestrates N diverse model-agents; each reads the case's shared **Walrus-backed memory namespace** (prior case law + this case's accumulating reasoning) and produces a per-member verdict + reasoning written back to that namespace. v0: trusted attestable service. v2: runs inside a **Nautilus enclave** (attested). Built on the `mc-orchestrator` base.
- **Verifiable memory layer (ours).** A thin module over raw Walrus + Seal that we build — no external memory SDK. Opens the case memory namespace (`memory_ns`), grants committee-member agents scoped (delegate) write capability, and exposes `remember(ns, type, content)` (Seal-encrypt → Quilt-write → index) / `recall(ns, query, type?)` (embed query → vector-index lookup → fetch + decrypt) / `restore(ns)` (rebuild the index from Walrus). Typed entries (`reasoning_trace`, `checkpoint`, `verdict`, `case_law`) are stored as Quilt tags so recall can filter by kind; reasoning traces and dispute outcomes accrue as case law. The vector index is a rebuildable cache — the durable truth is the Walrus blobs. *This module is also the reusable "verifiable decision-log for any agent" tooling contribution.*
- **Evidence packager.** Bundles rationale + cited sources, writes to **Walrus** (Quilt for the many small facts; `writeBlob` for large single artifacts via `@mysten/walrus` or a publisher with `send-object-to` to retain ownership), returns `(blob_id, sha256)`; Seal-encrypts private fields when `sealed = true`; surfaces the blob object so the contract can verify certification.
- **Resolver client.** Holds the `ResolverCap`, presents the raw config for the on-chain hash check, posts `assert_resolution` with the bond.
- **Indexer.** Watches `ResolutionAsserted` / `ResolutionDisputed` / `CaseSettled` events so integrators and agents track liveness windows in real time.
- **SDK (TypeScript, `@mysten/sui` + `@mysten/walrus`).** Build PTBs for create / assert / dispute / settle / read; subscribe to settlement; fetch + verify the evidence blob hash and certification; read the case memory via our memory layer. Drop-in for agent consumers and human integrators.
- **Fee path.** Per-resolution fee paid by integrators/agents. (An x402-style agent-payment endpoint is a post-hackathon nicety; not required for the demo.)

---

## 7. Core flows

### Flow A — Undisputed resolution (happy path)
1. Question author calls `create_case` with `question_hash`, `config_hash`, `memory_ns`, `expiry_epoch`, `liveness_epochs`, and an optional `consumer_id`. Case is shared `Open`; author receives the `ResolverCap` (or assigns it to the committee operator). The committee opens the Walrus memory namespace for `memory_ns` and grants scoped write capability to members.
2. At/after `expiry_epoch`, the multi-agent committee reads the case memory + evidence sources, deliberates (writing reasoning traces to the Walrus memory namespace), and produces an outcome; the evidence packager writes the bundle to Walrus → `ArtifactRef`.
3. Resolver calls `assert_resolution` with `presented_config`, `outcome_true`, `evidence_ref`, and a **bond** (e.g. 50 SUI). The contract hashes `presented_config` and asserts equality with `config_hash` — mismatch aborts; optionally `assert_certified` confirms the blob reached PoA. State → `Asserted`; `ResolutionAsserted` emitted.
4. Liveness window opens (e.g. **4 epochs**). Agents/watchdogs read the outcome, fetch the Walrus evidence, and inspect the committee's reasoning in the Walrus memory namespace.
5. Window closes undisputed → anyone calls `settle`; state → `SettledTrue/False`; resolver bond returned. Any consumer reads `get_resolution` and acts.

### Flow B — Disputed resolution
1. Steps 1–4 as above.
2. Within liveness, a disputer calls `dispute_resolution` posting a **matching bond**. State → `Disputed`; shared `Dispute` created; `ResolutionDisputed` emitted.
3. The committee re-votes — reading the case's Walrus memory namespace (including the original reasoning) and writing the dispute deliberation back as case law (v2: re-vote is an attested-enclave output with a fresh config-hash check). The result is submitted via `resolve_dispute`.
4. `resolve_dispute` pays the **full pot to the winner minus `protocol_fee_bps`**; if the original verdict is overturned, the resolver's bond goes to the disputer and `Case.outcome_true` flips. State → `Settled*`; `DisputeResolved` + `CaseSettled` emitted.
5. Any consumer reads the finalized outcome.

### Flow C — Integration
1. Integrator records their consumer object's `ID` (a market, a DAO proposal, a claim record) as `consumer_id` on the Tribunal case.
2. SDK subscribes to `CaseSettled` and triggers the consumer's logic (payout / execution / approval) in one PTB on settlement.

**Default parameters (tunable):** resolver bond 50 SUI; liveness 4 epochs (low-stakes) up to 24 epochs (high-stakes); disputer bond = resolver bond; protocol fee 0.5% (50 bps) of the pot on disputes.

> Epoch note: Sui epochs are ~24h on mainnet. For sub-hour demo settlement, the testnet uses short liveness and a `Clock`-based fast window; production maps liveness to epochs. Walrus storage epochs are independent (mainnet = 2 weeks) and govern evidence/memory retention — budget WAL accordingly. Documented so judges aren't surprised by the time units.

---

## 8. Economic model

No native token at launch. Bonds and fees use SUI or a USDC-class `Coin<T>`.

- **Resolver bond:** committee operator posts a bond per assertion; returned on undisputed settlement, forfeited to the disputer if overturned.
- **Disputer bond:** matches the resolver bond; winner takes the pot minus protocol fee. Makes frivolous disputes costly while funding the mostly-undisputed economics.
- **Operator rewards:** per-resolution fees paid by integrators/agents.
- **Protocol fee:** small fee (default 50 bps) on disputes funds ongoing operation; no token emission.
- **Storage cost (WAL):** evidence blobs + the committee memory namespace consume WAL over their epoch horizon. Budgeted into operator economics; long-lived case law needs renewal or a long epoch budget.
- **No slashing module:** unlike the EVM design (which leaned on EigenLayer Operator Sets), economic security here is **pure bonded dispute** — the resolver's own bond is the stake at risk. Simpler, fully on-chain, no external restaking dependency. Deliberate Sui-native simplification.

---

## 9. Tech stack (Sui-only)

- **On-chain:** Move 2024, `sui 1.72.5`. Modules `tribunal::case`, `tribunal::dispute`, `tribunal::evidence`. Test suite target **40+** (`sui move test`).
- **Objects/auth:** shared `Case` / `Dispute`; non-copyable `CaseCreatorCap` / `ResolverCap`; bonds as `Balance<T>`.
- **Atomicity:** Programmable Transaction Blocks for every multi-step action.
- **Verifiable memory:** **our own memory layer** built directly on **Walrus** (Quilt-batched, Seal-encrypted typed entries) + an off-chain vector index for semantic recall; namespace anchored on-chain via `memory_ns`. No external memory SDK on the critical path.
- **Evidence storage:** **Walrus** (`@mysten/walrus`, Quilt batching) + on-chain `ArtifactRef` + on-chain certification check; **Seal** `seal_approve` policy for private fields.
- **Verifiable compute (stretch/v2):** **Nautilus** enclave for attested committee execution.
- **Consumption:** consumer-agnostic — any market / DAO / claims object referenced by `consumer_id`. A DeepBook Predict-style subjective market is one possible v2 demo consumer.
- **Off-chain:** TypeScript + `@mysten/sui`; `mc-orchestrator` for committee coordination; event indexer.
- **Network:** Sui testnet for the hackathon; mainnet deploy is the 50%-on-mainnet milestone.

---

## 10. Milestones → MVP scope

- **M1 (week 1):** `tribunal::case` + `tribunal::evidence` — create_case, config-hash lock, `memory_ns` binding, assert_resolution (with hash check), settle; Walrus `ArtifactRef` anchor; `sui move test` 20+. Trusted-stub committee + memory-layer spike (open namespace, `remember`/`recall` one trace on raw Walrus + Seal). **Proves the core lifecycle + memory binding on testnet.**
- **M2 (week 2):** `tribunal::dispute` — bonded dispute/resolve, payout math, protocol fee; multi-agent committee runner (real N-model, attestable, *not yet enclaved*) coordinating through the Walrus memory namespace; evidence packager → Walrus (Quilt); Seal policy; on-chain certification check; test suite to 40+.
- **M3 (week 3):** SDK + an end-to-end testnet demo (question → committee deliberates over persistent Walrus memory → verifiable verdict on Walrus → dispute raised → resolved → consumer acts); indexer; docs + ≤5-min YouTube demo video; brand kit. **Submission-ready.**
- **Stretch / post-submission:** Nautilus-enclaved committee (attested execution); harden + open-source the memory layer as standalone tooling; a DeepBook Predict-style market as a live consumer; mainnet deploy (50%-after-mainnet milestone); agent-payment fee endpoint.

---

## 11. Security considerations

- **LLM-committee collusion / prompt injection.** N diverse models; the **config-hash lock** makes a swapped model/prompt detectable (tx aborts on mismatch); memory-recorded reasoning + Walrus evidence make every verdict auditable. Nautilus attestation (v2) binds model+prompt+output to the enclave. Informed by `agentguard-wdk` work.
- **Verdict manipulation.** Economic security via **matched bonds**; high-value cases use longer liveness + larger bonds. No external restaking trust assumption.
- **Liveness failure (committee down).** Case stays `Open`/`Asserted`; no false finalization — the system never silently reaches a wrong-resolution state. Disputes always have a bonded path to overturn.
- **Public-blob leakage (Walrus).** All Walrus blobs are public by default — private evidence / memory entries MUST be Seal-encrypted before write (our memory layer enforces encrypt-before-store; the evidence packager must too). The #1 Walrus footgun. (`WALRUS-agent-memory-patterns.md` §1.)
- **Blob/memory expiry.** Walrus blobs (evidence + memory entries) expire by epoch; for permanent audit trails, budget WAL for the retention horizon or renew. (`WALRUS-agent-memory-patterns.md` §6.)
- **Memory-index integrity.** The off-chain vector index is a rebuildable cache, never the source of truth — it can be reconstructed from the namespace's Walrus blobs (`restore(ns)`). A corrupted/lost index never corrupts the verifiable memory; the chain-anchored `memory_ns` + certified blobs are authoritative.
- **Seal non-atomicity.** `seal_approve` is not evaluated atomically across key servers — gate only on **stable facts** (case participation, disputer standing), never tx-ordering-sensitive state. (`WALRUS-agent-memory-patterns.md` §9.)
- **Regulatory.** Tribunal is a neutral resolution + memory service; it does not host markets or take bets. Integrators carry jurisdictional compliance.
- **Audit.** Small contract surface by design. Full external audit (track offers OtterSec/OZ credits post-hackathon) before mainnet.

---

## 12. Open questions

- Committee size N and provider diversity vs. cost/latency per resolution.
- Memory schema: how to type "case law" so recall is precise (per-question-class namespaces? Quilt tags by criteria?), and how to tune the embedding/index for cross-case recall quality.
- Dispute escalation: single committee re-vote vs. multi-round; whether a second dispute can re-open a `resolve_dispute` outcome.
- Bond-size curve as a function of consumer notional — deter manipulation without pricing out small cases.
- How to price subjective-question resolution where ground truth is genuinely contested.
- Whether the full evidence bundle lives on Walrus (current plan) or only a hash, balancing auditability vs. WAL cost + retention; same question for memory depth.
- Nautilus maturity on Sui at build time — confirm the enclave attestation interface is testnet-usable before committing M-stretch effort; keep the off-chain attestable path as the guaranteed fallback.
- On-chain Walrus certification: confirm the `Blob` object shape + a clean way to pass it into `assert_certified` against the deployed Walrus package at build time.

---

## Appendix — lineage & provenance

- Rewritten from `~/clawd/research/grants/WF-1-resolution-oracle.PRD.md` (EVM/EigenLayer/UMA/EAS design) into native Sui primitives. Mapping: EigenLayer AVS → Nautilus enclave (attested compute); UMA OOv3 assertion → bonded optimistic dispute on Sui shared objects; UMA DVM fallback → committee re-vote (no external DVM); EAS reasoning hashes → Walrus `ArtifactRef` + our Walrus-backed memory namespace; Solidity contracts → Move modules; `onlyOwner` → capabilities; ERC-1155 outcome tokens → consumer's own positions (not ours).
- Track pivot DeepBook → Walrus rationale recorded in `docs/HACKATHON.md`; Walrus storage + agent-memory patterns grounded in `~/clawd/research/WALRUS-agent-memory-patterns.md`.
- Patterns grounded in `~/clawd/research/SUI-prediction-markets-patterns.md`, `~/clawd/research/SUI-ecosystem-pattern-library.md`, and the working probe `~/projects/synapse_patterns_probe` (7/7 tests, sui 1.72.5).
