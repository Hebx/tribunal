# Tribunal — Build Plan (3 weeks to June 21 2026)

**Glorian Labs · Sui Overflow 2026 · Walrus track**
**Window:** June 2 → June 21 (~19 days) · **Toolchain:** Move 2024, sui 1.72.5

> Companion docs: `docs/PROPOSAL.md`, `docs/PRD.md`, `docs/HACKATHON.md`. Sui patterns from `~/clawd/research/SUI-*-patterns.md`; Walrus storage + agent-memory patterns from `~/clawd/research/WALRUS-agent-memory-patterns.md`; proven probe `~/projects/synapse_patterns_probe`.

---

## 0. Guiding constraints

- **Protect the core, scope the frontier.** The judge-able product is: locked-config-hash case lifecycle + bonded dispute + **our Walrus-backed verifiable committee memory** + Walrus evidence + an end-to-end demo. **Nautilus enclave is stretch** — architect for it, don't block on it.
- **Own the memory layer.** We build verifiable agent memory directly on raw Walrus (Quilt) + Seal — no external memory SDK. This is a stronger Walrus-track artifact, removes third-party beta risk from the critical path, and is the reusable tooling contribution the track rewards.
- **Lead with the 50%.** The rubric is Real-World Application 50% / Product&UX 20% / Technical 20% / Presentation&Vision 10%. Budget real time for a legible, working end-to-end demo and the video — not just contract depth.
- **Demo-first.** Every milestone ends with something runnable on testnet, not just compiling code.
- **Reuse the probe.** `synapse_patterns_probe` already proves caps, PTBs, shared objects, and Walrus `ArtifactRef` on this exact toolchain. Lift those patterns; don't rediscover them.
- **Test as you go.** Target 40+ `sui move test` cases by M2 end. Red-green per module, no end-loaded test crunch.

---

## 1. Target repo scaffold

```
~/projects/tribunal/
├── docs/
│   ├── PROPOSAL.md          ✅ done (Walrus-anchored)
│   ├── PRD.md               ✅ done (Walrus-anchored)
│   ├── BUILD_PLAN.md        ✅ this file
│   └── HACKATHON.md         ✅ done
├── brand/
│   ├── tribunal-logo.svg    ✅ done
│   ├── tribunal-logo.png    ✅ done (512)
│   └── tribunal-logo@1024.png ✅ done
├── move/                    ← Move package (Week 1–2)
│   ├── Move.toml
│   ├── sources/
│   │   ├── case.move        tribunal::case
│   │   ├── dispute.move     tribunal::dispute
│   │   └── evidence.move    tribunal::evidence
│   └── tests/
│       ├── case_tests.move
│       ├── dispute_tests.move
│       └── integration_tests.move
├── offchain/                ← committee runner + memory + evidence (Week 2)
│   ├── committee/           (mc-orchestrator-based, N-model)
│   ├── memory/              (our memory layer: open namespace, scoped writes, remember/recall/restore on raw Walrus + Seal)
│   ├── evidence/            (Walrus write + Seal encrypt)
│   └── resolver/            (holds ResolverCap, builds assert PTB)
└── sdk/                     ← TypeScript SDK + demo (Week 3)
    ├── src/                 (@mysten/sui PTB builders, @mysten/walrus, memory-layer client, event subscribe)
    └── demo/                (end-to-end resolution walkthrough)
```

---

## 2. Week 1 (Jun 2–8) — Core lifecycle on testnet · **M1**

**Goal:** `create_case` → `assert_resolution` (with config-hash check) → `settle`, plus Walrus evidence anchor and `memory_ns` binding, running on testnet with a trusted-stub committee.

- [ ] **Day 1–2: Scaffold + case object.** `Move.toml` (deps: Sui framework; Walrus/Seal stubs as needed). Implement `tribunal::case`: `Case<T>` shared object (incl. `memory_ns`), `CaseState` enum, `CaseCreatorCap` / `ResolverCap`, `create_case` (locks `config_hash` + `memory_ns`). Port cap pattern from probe.
- [ ] **Day 2–3: `tribunal::evidence`.** `ArtifactRef` struct + `new_ref`; on-chain anchor pattern from `synapse_patterns_probe::register_artifact`. Stub `seal_approve` + `assert_certified` signatures.
- [ ] **Day 3–4: assert + settle.** `assert_resolution` with the **config-hash equality check** (hash `presented_config`, assert == `config_hash`, else abort) + bond escrow as `Balance<T>`; `settle` after liveness (Clock-based for demo speed). Emit events.
- [ ] **Day 4–5: tests + testnet deploy + memory-layer spike.** `case_tests.move` (create, config-match pass, config-mismatch abort, assert, settle-undisputed, double-settle abort) — 20+ cases. Publish to testnet; one scripted happy-path PTB. **Memory-layer spike:** stand up `offchain/memory/` on raw `@mysten/walrus` + Seal — open a namespace for a test `memory_ns`, `remember` (Seal-encrypt → Quilt-write → index) + `recall` (embed → index lookup → fetch + decrypt) one reasoning trace, and prove `restore(ns)` rebuilds the index from Walrus. De-risk the memory path before building on it.

**M1 exit criteria:** package publishes on testnet; a scripted PTB runs create → assert → settle and the event log shows a finalized outcome; config-mismatch path provably aborts; 20+ tests green; one memory trace round-trips through our Walrus-backed layer (write → recall → restore).

---

## 3. Week 2 (Jun 9–15) — Dispute machinery + multi-agent committee w/ shared memory · **M2**

**Goal:** bonded dispute/resolve with correct payout math, a real N-agent committee coordinating through our Walrus-backed memory layer, and live Walrus evidence + Seal.

- [ ] **Day 6–7: `tribunal::dispute`.** `Dispute<T>` shared object, `dispute_resolution` (matching bond, liveness-window guard, Case→Disputed), `resolve_dispute` (pot payout minus `protocol_fee_bps`, bond transfer, outcome flip on overturn).
- [ ] **Day 7–8: dispute tests.** `dispute_tests.move`: dispute-within-window, dispute-after-window-aborts, resolver-wins payout, disputer-wins payout + outcome flip, fee math. Push suite to 40+ total.
- [ ] **Day 9–10: multi-agent committee + memory layer.** N-model orchestration on `mc-orchestrator`; **each member reads/writes the case's shared Walrus memory namespace** (scoped/delegate writes) — typed entries (reasoning traces + checkpoints) persist as case law. Aggregate per-member verdicts; produce the canonical `presented_config` matching the locked hash. Attestable (signed) output, enclave-ready interface — **no Nautilus yet**. This memory layer is also the reusable "verifiable decision-log for any agent" tooling artifact.
- [ ] **Day 10–11: evidence packager + Walrus + Seal + cert.** Bundle rationale + sources → write to Walrus (Quilt for many small facts; publisher with `send-object-to` to retain ownership) → `(blob_id, sha256)` → `ArtifactRef`. Seal-encrypt private fields; wire `seal_approve` to stable-fact gating. Wire `assert_certified` to read the Walrus `Blob` object. Resolver client posts `assert_resolution` with the real bond.
- [ ] **Day 11–12: integrated dry run.** Off-chain committee deliberates over the Walrus memory namespace → evidence to Walrus → on-chain assert (cert-checked) → dispute → resolve (re-vote reads memory, writes case law), fully on testnet.

**M2 exit criteria:** a real multi-agent committee verdict — with its reasoning persisted in our Walrus-backed memory namespace and evidence in a certified Walrus blob — lands on-chain; a bonded dispute resolves with correct payouts both ways; recall of prior case memory demonstrably informs a re-vote; 40+ tests green.

---

## 4. Week 3 (Jun 16–21) — SDK, end-to-end demo, submission · **M3**

**Goal:** SDK + a live end-to-end demo (the working system the track wants), indexer, docs, walkthrough — submission-ready.

- [ ] **Day 13–14: TypeScript SDK.** `@mysten/sui` PTB builders for create/assert/dispute/settle/read; `@mysten/walrus` + memory-layer client helpers; event subscription; evidence-hash + certification verification helper; read-case-memory helper.
- [ ] **Day 14–16: end-to-end demo (the working system).** A subjective question goes in → multi-agent committee deliberates over persistent Walrus-backed memory → verifiable verdict written to Walrus → dispute raised → committee re-votes using recalled memory → settlement → a consumer acts on `get_resolution`. **Stretch consumer:** wire a DeepBook Predict-style subjective market as the consumer if time allows; otherwise a minimal consumer object that reads `get_resolution` (keeps the demo whole; documented as scope, not fabricated).
- [ ] **Day 16–17: indexer + docs.** Event indexer over assert/dispute/settle. Write README + integration guide + the ≤5-min demo script. Show memory recall + Walrus evidence + config-hash lock all inspectable.
- [ ] **Day 18–19: polish + submission.** Record walkthrough; final test pass; submission writeup ties together PROPOSAL + PRD + demo; brand assets attached. Buffer for slippage.

**M3 exit criteria:** a judge can watch a subjective question go from creation → multi-agent committee verdict (reasoning persisted in our Walrus-backed memory) → verifiable Walrus evidence → (optional dispute + memory-informed re-vote) → settlement → consumer action, with the memory namespace, the Walrus evidence trail, and the config-hash lock all inspectable.

---

## 5. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| **Memory-layer build effort (we own it)** | Medium | Thin scope: Quilt write + Seal encrypt + a small embed/index + `restore`. Spike Day 4–5 on raw `@mysten/walrus` before building on it; isolate in `offchain/memory/`. The vector index is a rebuildable cache, so bugs there never corrupt the verifiable record. |
| **Nautilus enclave immaturity on Sui** | High | Already scoped to stretch/v2. Core ships with attestable off-chain committee; enclave interface stubbed but not on the critical path. |
| **Walrus/Seal SDK version pinning vs sui 1.72.5** | Medium | Synapse hit `@mysten/messaging` version conflicts; isolate Walrus/Seal clients in `offchain/`, pin versions, keep on-chain `ArtifactRef` decoupled from the SDK version. |
| **On-chain Walrus `Blob` cert check shape** | Medium | Confirm the deployed Walrus package's `Blob` object shape early; if `assert_certified` integration is fiddly, fall back to hash-only anchoring for the demo and document the cert check as the hardening step. |
| **Walrus epoch expiry vs "permanent" audit** | Low | Budget WAL for the retention horizon; document renewal. Demo horizon is short so non-blocking. |
| **Epoch-length vs sub-hour demo settlement** | Low | Clock-based fast liveness window on testnet; production maps to epochs. Documented in PRD §7. |
| **3-week scope overrun** | Medium | Demo-first milestones; M1/M2 each independently demonstrable; Nautilus + mainnet are explicitly post-submission (the 50%-after-mainnet prize tranche). |

---

## 6. Definition of done (submission)

> Mapped to the official submission checklist — see `docs/HACKATHON.md`. Every REQUIRED field below is a hard gate, not a nice-to-have.

**Hackathon-required (hard gates):**
- [ ] **Public GitHub repo** — public for the entire judging period; commit history inside May 7–Jun 21 (proves built-in-window eligibility).
- [ ] **Demo video** — **≤ 5 min**, YouTube, an actual demo (not slides): question → multi-agent committee verdict (memory persisted) → dispute → settlement → consumer action, with the Walrus memory namespace + Walrus evidence + config-hash lock shown. Carries Product/UX + Presentation = 30% of score — budget real time.
- [ ] **1:1 logo** (JPG + PNG) — have PNG ✅; export a square JPG.
- [ ] **Deployment** — testnet package published; **Package ID** recorded in README.
- [ ] **Description** — clear "what it does / why it matters" framing on the submission portal.
- [ ] Submitted before the Jun 21 deadline.

**Product DoD:**
- Move package on testnet: `case` + `dispute` + `evidence`, 40+ tests green.
- A real multi-agent committee coordinating through our Walrus-backed memory layer, with reasoning persisted as verifiable memory.
- One end-to-end subjective resolution demo (consumer = minimal object or DeepBook Predict-style market if time).
- Walrus memory namespace + Walrus evidence trail + on-chain config-hash lock all inspectable.
- SDK + indexer + README + integration guide.
- PROPOSAL.md, PRD.md, BUILD_PLAN.md, HACKATHON.md, brand kit — all in-repo.
- Submission writeup citing the a16z LLM-arbiter tailwind and the verifiable-agent-memory positioning.

**Post-submission (unlocks 2nd 50% of prize):** mainnet deploy meeting sponsor minimums before Aug 27; Nautilus-enclaved committee; harden + open-source the memory layer as standalone tooling.

---

## 7. Immediate next actions (on approval)

1. `cd ~/projects/tribunal/move && sui move new` scaffold (or hand-author `Move.toml`).
2. Lift `OwnerCap` + `register_artifact` patterns from `synapse_patterns_probe` into `case.move` / `evidence.move`.
3. Implement `create_case` + config-hash lock + `memory_ns` binding first — the keystone the differentiation rests on.
4. Write `case_tests.move` alongside, RED-GREEN per function.
5. In parallel, memory-layer spike in `offchain/memory/` (raw `@mysten/walrus` + Seal → open namespace → remember/recall/restore) to de-risk the memory path Day 4–5.

> Per the brainstorming HARD-GATE: this plan + PRD are the design. Get explicit go-ahead before scaffolding Move code in Week 1.
