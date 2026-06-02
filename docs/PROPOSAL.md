# Tribunal — Project Proposal

**Sui Overflow 2026 · Walrus track**
**Glorian Labs · Lord Heb (Hebx)**
**Status:** Locked build · **Deadline:** June 21 2026 · **Scope:** Sui-only

![Tribunal](../brand/tribunal-logo.png)

---

## 1. One-liner

**Tribunal is a multi-agent AI arbiter whose committee remembers, learns, and stays accountable — built on Walrus as its verifiable memory layer.** A committee of LLM agents resolves subjective, real-world questions and disputes ("Did the ceasefire hold by July 1?", "Did Project X ship mainnet in Q2?", "Is this grant deliverable met?"). Every member coordinates through a shared, encrypted **Walrus-backed memory namespace** (our own verifiable-memory layer built directly on Walrus + Seal); every verdict's reasoning and evidence persist as durable Walrus artifacts; the model+prompt is locked by an on-chain config-hash; and any decision is contestable through a bonded dispute. The result: an AI decision system you can **audit, reproduce, and challenge** — not trust blindly.

We don't host markets or custody funds. Tribunal is neutral resolution *infrastructure* — a verifiable-memory agent service that any market, DAO, or claims process can plug into.

---

## 2. Why this, why now

### The problem the Walrus track names
The track's thesis: *"AI agents are stateless and fragmented — they lose context across sessions, and their memory is locked inside a single app."* Walrus is positioned as the **Verifiable Data Platform** that fixes this. The track explicitly wants long-term memory, multi-agent coordination, and artifact-driven workflows.

This problem is most acute exactly where it matters most: **when an AI makes a consequential judgment.** An agent that resolves a dispute, settles a market, or approves a claim and then *forgets why* — and leaves no verifiable trail — is unaccountable by construction. Today's AI arbiters decide in isolation, with opaque, unreproducible state. (Research: `~/clawd/research/WALRUS-agent-memory-patterns.md` §0.)

**Tribunal is the answer applied to high-stakes decisions:** a committee of agents that accumulates verifiable *case knowledge* on Walrus, coordinates through shared memory, and produces an auditable artifact for every verdict.

### The tailwind
a16z crypto's **Andrew Hall publicly argued** (Jan 2026) for LLMs as neutral arbiters, explicitly calling for **locked model versions + prompts on-chain** for transparency. Tribunal is a direct, shipping implementation of that thesis — and it goes further by making the agents' *memory itself* verifiable on Walrus. Third-party validation of the exact design; cite it in the pitch. (`SUI-prediction-markets-patterns.md` §3.)

### Differentiates from the incumbents
- **Synapse Vault** already does "Walrus memory for agents" — but for *treasury firewalling*. Tribunal's lane is orthogonal: **verifiable memory for AI judgment** (reasoning traces, accumulated case law, evidence), not fund custody. (`ANALYSIS-synapse-vault-readonly.md`.)
- **TOLDPROOF** ships a *single AI judge* with no committee, no dispute, and no persistent verifiable memory. It owns the bare "an AI decides" headline — not the trust-and-memory machinery underneath. (`SUI-prediction-markets-patterns.md` §1, §5.)

**Nobody has shipped a multi-agent AI arbiter with verifiable, persistent, disputable memory on Walrus.** That's the open lane.

---

## 3. How it maps to the track (judging rubric ahead of features)

The 2026 core-track rubric weights **Real-World Application 50% · Product & UX 20% · Technical 20% · Presentation & Vision 10%**. Tribunal leads with the 70% that isn't crypto-depth:

| Track interest area | How Tribunal delivers it |
|---|---|
| **Long-term verifiable memory** | The committee accumulates typed memory in a **Walrus-backed namespace** — reasoning traces, checkpoints, prior verdicts (case law). It gets sharper across sessions instead of starting cold. |
| **Multi-agent coordination** | N committee-member agents coordinate through one shared, **delegate-scoped** memory namespace — structured shared state, not ad-hoc message passing. |
| **Artifact-driven workflow** | Every verdict emits durable, reusable artifacts (rationale, evidence bundle, dispute record) stored on Walrus (Quilt for the many small facts) and anchored on-chain. |
| **Verifiable / accountable** | On-chain config-hash lock + `ArtifactRef` + Move-side blob-certification = a decision a judge can *inspect on-chain*, not take on faith. |

---

## 4. What makes it differentiated (the trust + memory machinery)

Not "an AI judge decides." Five mechanisms, each grounded in a verified Sui/Walrus primitive:

| Mechanism | What it does | Primitive (source) |
|---|---|---|
| **Walrus-backed memory namespace** | Each committee runs over a shared, encrypted (Seal) memory namespace holding typed memory: reasoning traces, checkpoints, accumulated case law. Built directly on Walrus + Seal (Quilt-batched) — we own the layer. Agents *remember and build over time*. | **Walrus agent memory** (`WALRUS-agent-memory-patterns.md` §5) |
| **Locked resolver config-hash** | `sha256(model_id ‖ prompt ‖ data_sources)` committed on the case object at creation. Resolver must present matching config at settlement or the tx aborts. Makes the deciding AI tamper-evident. | **Switchboard feed-config hashing** (`SUI-prediction-markets-patterns.md` §3–4) |
| **LLM committee (multi-agent)** | N diverse models vote; verdicts + reasoning are signed and written to the shared memory namespace. Diversity + quorum, not a single opaque judge. | **Multi-agent coordination via shared memory** (track brief) |
| **Bonded optimistic dispute** | Resolver posts outcome + bond; a challenge window (N epochs) lets bonded disputers contest; unchallenged → auto-finalizes; loser forfeits bond. Accountability with teeth. | **Bonded dispute on Sui shared objects** (`SUI-prediction-markets-patterns.md` §4 pattern 7) |
| **On-chain verifiable evidence** | Verdict rationale + cited evidence stored on Walrus, anchored by `ArtifactRef{blob_id, sha256, sealed, epoch}`. A Move contract verifies the blob is **certified** before the verdict is trusted. | **Walrus blob + on-chain ref + cert** (proven in `synapse_patterns_probe::register_artifact`) |

Synapse owns treasury-memory; TOLDPROOF owns the single-judge headline. Tribunal owns **disputable, verifiable, persistent agent judgment-memory.**

---

## 5. How it works (end to end)

```
  Author defines a SUBJECTIVE question + resolution criteria + evidence sources
        │
        ▼
  Tribunal Case object created (SHARED) ── locks config-hash(model‖prompt‖sources)
        │                                  ── opens a Walrus memory namespace (delegate-scoped)
        ▼
  At expiry: LLM committee (N agents) reads case memory + evidence, each votes
        │  each member → signed verdict + reasoning  ──▶ written to shared Walrus memory ns
        ▼
  Resolver posts outcome + evidence blob (Walrus, ArtifactRef) + bond ──▶ assert_resolution()
        │
        │  challenge window open (N epochs)
        ├───────────── undisputed ──────────────▶ settle() ──▶ outcome FINAL
        │                                                          │
        └── disputed (bonded) ──▶ committee re-vote / quorum       │
                                       │  (memory of dispute       │
                                       │   accrues to case law)    │
                                  resolve_dispute() ── bond payout ─┘
                                       │
                                       ▼
                         Any consumer (market / DAO / claims) reads FINAL outcome
```

All state transitions are atomic Programmable Transaction Blocks: resolve → mark settled → enable consumption in one PTB; abort = full revert, no half-resolved state. (`SUI-ecosystem-pattern-library.md` §3.)

---

## 6. Scope discipline (the honest part)

A **3-week build**. We protect the core and scope the frontier:

- **Core (must ship):** Move package — shared `Case` object, cap-gated creation, config-hash lock, bonded assert/dispute/settle lifecycle, `ArtifactRef` with on-chain certification check. Off-chain committee runner integrated with **our Walrus-backed memory layer** for shared memory. TS SDK + an end-to-end demo: a question goes in, the committee deliberates over persistent memory, a verifiable verdict comes out, a dispute is raised and resolved. This is the demonstrable, judge-able product.
- **Stretch (v2, scoped explicitly):** **Nautilus enclave** for attested committee execution; a second consumer integration (e.g. resolving a subjective market on a DeepBook Predict-style venue). Nautilus maturity is the biggest technical risk (`SUI-prediction-markets-patterns.md` §3, 🟡) — we architect for it (the config-hash + attestation interface is enclave-ready) but the core ships and demos without a live enclave. The memory layer is thin and built on raw `@mysten/walrus` + Seal, so it carries no third-party beta dependency on the critical path.

De-risked: `synapse_patterns_probe` already proved caps + PTB + Walrus refs in one sitting (7/7 tests) on this exact toolchain (sui 1.72.5).

---

## 7. Why we win the track

1. **Dead-center on the brief.** "AI agents with long-term verifiable memory, multi-agent coordination, artifact-driven workflows" — Tribunal is a verbatim fit, applied to a problem (accountable AI judgment) judges instantly grasp.
2. **Leads with the 50%.** Real-World Application is half the score. "AI decisions that can't be audited or contested are dangerous; Tribunal makes them remembered, explained, and challengeable" is a real problem, not a tech demo.
3. **Differentiation is on-chain and inspectable.** Config-hash + committee + bonded dispute + certified Walrus evidence is something a judge verifies, not a pitch claim. And it's exactly what a16z said the space needs.
4. **Reuse + de-risk.** A fully-designed resolution oracle (WF-1 PRD) rewritten Sui-native, proven Move patterns from the probe, and a documented Walrus agent-memory integration path. Not a blank page.
5. **Tooling contribution.** Our verifiable-memory layer generalizes to "a verifiable decision-log for any agent" — the dev-tooling outcome the track explicitly rewards.

---

## 8. Deliverables (by June 21)

- Audited-style Move package (`tribunal::case`, `tribunal::dispute`, `tribunal::evidence`) with a 40+ test suite.
- Off-chain committee runner + **our Walrus-backed verifiable-memory layer** (Nautilus-ready attestation interface).
- TypeScript SDK + a working end-to-end testnet demo (question → deliberation over persistent memory → verifiable verdict → dispute → resolution).
- This proposal, the Sui-native PRD, the build plan, the brand kit.
- Public GitHub repo + a ≤5-min YouTube demo video (required for submission; carries 30% of the score).

---

## Appendix — Research provenance

All claims trace to on-disk research:
- `~/clawd/research/WALRUS-agent-memory-patterns.md` — Walrus core, integration paths, Quilt, agent-memory architecture patterns, Seal, Move anchoring, track-fit (primary sources verified 2026-06-02).
- `~/clawd/research/SUI-prediction-markets-patterns.md` — competitor map (TOLDPROOF), oracle options, a16z tailwind, config-hash pattern.
- `~/clawd/research/SUI-ecosystem-pattern-library.md` — Sui primitives + gotchas, proven against `synapse_patterns_probe` (7/7 tests).
- `~/clawd/research/ANALYSIS-synapse-vault-readonly.md` — why Tribunal's memory lane is orthogonal to Synapse's treasury lane.
- `~/clawd/research/grants/WF-1-resolution-oracle.PRD.md` — original (EVM) resolution-oracle design, rewritten Sui-native in `docs/PRD.md`.
- Toolchain verified: `sui 1.72.5` · proven Move probe at `~/projects/synapse_patterns_probe`.
