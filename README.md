# Tribunal

**A multi-agent AI arbiter with verifiable, portable memory — built on Walrus.**

![Tribunal](brand/tribunal-logo.png)

AI agents are increasingly asked to make consequential judgments — resolving disputes, settling prediction markets, reviewing claims, moderating content. But today's agents are **stateless and unaccountable**: they decide in isolation, forget across sessions, and leave no trustworthy trail of *why*. Tribunal fixes that.

Tribunal is a **committee of AI agents** that resolves subjective questions and disputes, where every member **remembers and builds over time** through a shared, verifiable memory layer **built directly on Walrus + Seal**. Each verdict is anchored on-chain, its reasoning and evidence stored as durable encrypted memory, and its model+prompt locked by a config-hash — so any decision can be traced back to the exact data and reasoning that produced it, and challenged through a bonded dispute.

Built for **Sui Overflow 2026 · Walrus track** by Glorian Labs.

## Why it fits "Walrus as a Verifiable Data Platform for AI"

The track asks for agentic systems that gain long-term, verifiable memory on Walrus. Tribunal is that, applied to high-stakes decisions:

- **Long-term memory** — the committee accumulates *case knowledge* (prior verdicts, reasoning traces, evidence) in a Walrus-backed memory namespace, so it gets sharper over time instead of starting cold each session.
- **Multi-agent coordination** — N committee-member agents coordinate through a shared, delegate-scoped memory namespace, not ad-hoc message passing.
- **Artifact-driven** — every verdict produces durable, reusable artifacts (rationale, evidence bundles, dispute records) stored on Walrus and anchored on-chain.
- **Verifiable** — config-hash lock + on-chain `ArtifactRef` + Move-side blob-certification = decisions you can audit, not trust blindly.

## The differentiation

Not "an AI judge decides." The edge is **accountable, persistent, disputable agent memory**:

- **Walrus-backed memory namespace** — typed memory (reasoning traces, checkpoints, accumulated case law) per committee, owner-controlled, encrypted via Seal, Quilt-batched on Walrus. We build the layer ourselves on raw Walrus primitives.
- **Locked resolver config-hash** — `sha256(model ‖ prompt ‖ sources)` committed on-chain; the resolver must present matching config at settlement or the transaction aborts.
- **Bonded optimistic dispute** — anyone can challenge a verdict with a bond; loser forfeits. Accountability with teeth.
- **On-chain verifiability** — a Move contract verifies the Walrus blob is certified before a verdict is trusted.

## Repo layout

- `docs/PROPOSAL.md` — the pitch, the problem, why it wins the Walrus track
- `docs/PRD.md` — full Sui-native product requirements (Move modules, Walrus-backed memory layer, Seal+Walrus, dispute machinery)
- `docs/BUILD_PLAN.md` — 3-week milestone plan to June 21
- `docs/HACKATHON.md` — official rules, judging rubric, submission checklist, track-fit analysis
- `brand/` — logo (SVG + PNG)
- `move/` — Move 2024 package: `tribunal::case`, `tribunal::dispute`, `tribunal::evidence` *(Week 1–2)*
- `offchain/` — committee runner + our Walrus-backed memory layer *(Week 2)*
- `sdk/` — TypeScript SDK + demo *(Week 3)*

## Use cases (real-world application)

Dispute/claim resolution, subjective prediction-market settlement (incl. as a resolution source any market — e.g. a DeepBook Predict-style venue — can consume), DAO grant review, content-moderation appeals. Any place an AI decision needs to be **remembered, explained, and contestable**.

## Status

Track pivot locked (DeepBook → Walrus; see `docs/HACKATHON.md` for why). Design re-anchored to verifiable agent memory. Move scaffolding pending go-ahead. Toolchain: Move 2024, `sui 1.72.5`. Core patterns proven in `~/projects/synapse_patterns_probe` (7/7 tests). Walrus storage + agent-memory patterns: `~/clawd/research/WALRUS-agent-memory-patterns.md`.
