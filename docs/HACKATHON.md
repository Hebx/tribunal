# Sui Overflow 2026 — Compliance Reference (Tribunal)

> Authoritative facts pulled from the official **Participant Handbook** (`go.sui.io/overflow26-participant-handbook`) and **Detailed Submission Guide** (`mystenlabs.notion.site/overflow2026-submission-guide`). Extracted 2026-06-02. Treat this as the source of truth for what we must deliver; the PRD/PLAN describe *what we build*, this describes *what the hackathon requires*.

## ✅ DECISION LOCKED — Target track: WALRUS ($35K) (2026-06-02)

**Tribunal targets the Walrus track**, not DeepBook Predict. User-confirmed. Track theme: *"rethink how agentic systems are built using Walrus as a Verifiable Data Platform for AI"* — long-term verifiable agent memory, multi-agent coordination, artifact-driven workflows. Tribunal is reframed as **a multi-agent AI arbiter with verifiable, persistent memory on Walrus** (the committee remembers + builds case law in our own Walrus-backed memory layer; verdicts are auditable Walrus artifacts). PROPOSAL/PRD/BUILD_PLAN/README are all re-anchored to this. Walrus storage + agent-memory research: `~/clawd/research/WALRUS-agent-memory-patterns.md`; build skill: `walrus-agent-memory`.

- **Walrus track prizes:** 🥇 **$35,000** · 🥈 $15,000 · 🥉 $7,500 · 4th $5,000 (+ $7,500 honorable mentions). Same top tier as DeepBook.
- **Judging (confirmed 2026 core-track rubric):** Real-World Application **50%** · Product & UX **20%** · Technical **20%** · Presentation & Vision **10%**. Lead with the working system + legible demo, not crypto depth.
- **Differentiation guardrails:** orthogonal to **Synapse Vault** (Walrus-memory for *treasury firewalling* — Tribunal = Walrus-memory for *AI judgment*); ahead of **TOLDPROOF** (single opaque judge, no committee/dispute/persistent memory).
- **Walrus office-hours contact:** Abner (idea validation). Audit/sec: OZ (Daniel, Kose), OtterSec (Michał).
- DeepBook Predict survives only as one *possible* downstream consumer in a v2 stretch demo — never the anchor.

> The section below is retained as the **historical rationale** for the pivot (why DeepBook was rejected). Do not treat it as the current plan.

## ⚠️ HISTORICAL — why Tribunal's thesis does NOT fit the DeepBook track (2026-06-02)

Read the official **DeepBook Predict Problem Statement** (`mystenlabs.notion.site/deepbook-predict-problem-statement`). It invalidates the core composability premise.

**What DeepBook Predict actually is:** a **BTC options / volatility-surface protocol**, not a subjective-event market.
- *"price every strike and expiry against a live volatility surface"*
- *"rolling sub-hour BTC oracles"* — settlement is **objective price via oracle**, period
- *"our programmable, vol-surface-priced prediction protocol on Sui"*
- Live on testnet: `predict-server.testnet.mystenlabs.com`, `dUSDC` quote asset, branch `predict-testnet-4-16`.

**What the track wants you to build (idea bank + "especially interested in"):**
- Vault strategies (Range Ladder, PLP+Hedge, BTC-collateral, 3-protocol margin loop)
- Cross-venue vol-arb bots (Predict ↔ Polymarket / Hyperliquid)
- Alt frontends (Telegram quick-predict bot, streaks PWA)
- Analytics/dev tooling (SVI surface viewer, PLP risk dashboard)
- Keeper services (`predict::redeem_permissionless`, oracle monitors)

**Minimum requirement to qualify:** *"Integrate deepbook predict contract on testnet. Work end to end. Have proper simulation results if building a vault strategy."*

**The mismatch:** Tribunal resolves SUBJECTIVE real-world questions with an AI committee + bonded dispute. DeepBook Predict has **no subjective markets** — it's pure BTC price/vol. So "Tribunal = subjective resolution layer for DeepBook Predict" has no surface to attach to. This differentiator does not belong on this track.

**Decision fork (escalated to Lord Heb 2026-06-02):**
- **Route A — keep Tribunal, change track → Walrus ($35K).** Track theme: *"AI agents and agentic workflows powered by Walrus as a verifiable data and memory layer."* Tribunal's verifiable AI committee + Walrus evidence trail + Seal IS this prompt, near-verbatim. Highest design reuse (~all of PRD survives; reframe "config-hash + committee + Walrus evidence" as Walrus-as-verifiable-memory). Same top prize as DeepBook.
- **Route A' — keep Tribunal, change track → Agentic Web ($30K).** Also a strong thesis fit (autonomous AI arbiter agent). Lower prize; more contested lane (audric.ai etc., noted earlier).
- **Route B — keep DeepBook track ($35K), change project.** Build what they ask: a vol-arb bot, PLP+hedge vault, or settled-redeem keeper on the real Predict protocol. Highest-prize track, now testnet-confirmed, very on-thesis for the 50%-Real-World-Application rubric. But it's a NEW project — Tribunal's resolver concept is discarded (Move/caps/Walrus/probe patterns still reused).

**Recommendation:** **Route A (Tribunal → Walrus track).** Same $35K, preserves nearly all design work, and the fit is almost too clean — Walrus-as-verifiable-evidence-memory for an AI arbiter agent is the literal track prompt. Reframe needed: lead with Walrus as the verifiable memory layer, position DeepBook Predict (if mentioned at all) as just one downstream consumer, not the anchor.

## Prizes (DeepBook track) — CORRECTED

- 🥇 **$35,000** · 🥈 **$15,000** · 🥉 **$7,500** · 4th **$5,000**
- Plus **$7,500** distributed among honorable mentions / special awards.
- (Earlier working notes had 3rd=$10K / 4th=$7.5K — that was the **Agentic Web** tier, not DeepBook. Fixed.)

## Award split model

- **50%** on winner announcement · **50%** after successful **mainnet deployment**.
- **100% upfront** if the team has *already* deployed to mainnet by the August announcement.
- Mainnet deploy must meet minimum functional requirements set by Sui / track sponsor.
- → Strategy: testnet for submission; a working mainnet deploy before Aug 27 unlocks the full prize. Build with mainnet-readiness in mind.

## Timeline (Pacific Time) — CORRECTED

| Date | Milestone |
|---|---|
| May 7 | Launch / track + prize reveal |
| May 7 – **June 21** | Building period |
| **June 21** | **Submission deadline** (changes after may not be reflected in shortlisting) |
| July 8 | Shortlisted teams announced |
| July 20–21 | Demo Day (shortlisted present live, virtual) |
| Aug 27 | Winners announced (pitch at Sui Basecamp 2026) |

- June 21 is the **submission** deadline, not the decision date. Winners land Aug 27. Plan for a polished submission by Jun 21, then keep building toward mainnet.

## Submission checklist (REQUIRED unless noted)

- [ ] **Project Name** — clear + simple → **"Tribunal"** ✅
- [ ] **Description** — what it does, why it matters
- [ ] **Project Logo** — **1:1 ratio**, JPG/PNG → we have 512² + 1024² PNG ✅ (export a JPG too for safety)
- [ ] **Public GitHub repo** — **must be public during the judging period**
- [ ] **Demo video** — **REQUIRED**, YouTube preferred, **≤ 5 minutes** (demo, not slideware)
- [ ] **Website** — optional, highly recommended
- [ ] **Deployment** — **testnet or mainnet** (testnet is acceptable for submission)
- [ ] **Package ID** — required if deployed on-chain
- Submit via **DeepSurge** (deepsurge.xyz/hackathons → Overflow 2026 → Submit Project).

## Eligibility — the one that mattered for us

- Projects must be **built during the official build period (May 7 – June 21, 2026)**.
- **Existing projects allowed only if** substantial new functionality/features/integrations are built **specifically during** the hackathon period.
- → **We're clean.** The WF-1 resolution-oracle doc is *prior design thinking* (a research artifact), not shipped code. Every line of Move/SDK/off-chain for Tribunal is written fresh in this window. Keep commit history inside May 7–Jun 21 to make this auditable.

## Judging criteria — CONFIRMED (2026, from handbook)

Core track projects are evaluated on:

| Criterion | Weight | Focus |
|---|---|---|
| **Real-World Application** | **50%** | Meaningful problem-solving, market relevance, long-term value |
| **Product & UX** | **20%** | Quality, usability, polish, overall user experience |
| **Technical Implementation** | **20%** | Technical quality, reliability, **meaningful integration with Sui** |
| **Presentation & Vision** | **10%** | Clarity of presentation, storytelling, long-term vision |

Handbook's own framing: *"focused on meaningful products and ecosystem impact, **not just technical demos**."* Strong projects: solve meaningful problems, polished UX, leverage Sui meaningfully, strong product thinking, long-term potential.

### STRATEGIC IMPLICATION — re-weight the build
- **Technical sophistication is only 20%.** Real-World Application (50%) + Product & UX (20%) = **70% is "does this solve a real problem, usably."** Our config-hash / committee / bonded-dispute machinery is the 20% Technical bucket — necessary but NOT where the points are.
- **Therefore:** do NOT over-invest in cryptographic depth at the expense of a usable, legible demo that shows a *real subjective market being resolved and paying out*. The winning narrative is "prediction markets can't settle subjective real-world questions trustlessly today — here's the working product that fixes it, plugged into DeepBook Predict," not "here's our clever hashing scheme."
- **Demo video (≤5 min) carries Product/UX + Presentation = 30%.** Budget real time for it. Show the end-to-end human story: question → AI verdict + evidence → dispute → settlement → DeepBook payout.
- A polished frontend / clear UX matters more than a 60-test suite. Keep tests solid (reliability = part of the 20%) but put surplus effort into the product surface and the problem framing.

## DeepBook Predict — testnet IS accessible (risk retired)

The handbook links the live protocol + tooling directly:
- **Predict protocol (current testnet deployment + integration model):** `github.com/MystenLabs/deepbookv3/tree/predict-testnet-4-16/packages/predict`
- **DeepBook sandbox (one-line local deploy of the whole stack):** `github.com/MystenLabs/deepbook-sandbox`
- DeepBook v3 docs: `docs.sui.io/onchain-finance/deepbookv3/deepbook` · Margin: `docs.sui.io/onchain-finance/deepbook-margin`
- **Mysten contact for DeepBook integration:** Tony (office hours). Walrus idea-validation: Abner. Audit/sec guidance: OpenZeppelin (Daniel, Kose), OtterSec (Michał), Scallop (Kris).
- → **The "is Predict testnet-accessible?" risk drops Medium → near-zero.** Build against the real `predict` package on testnet, not a mock. Use the sandbox for local dev. The mock-consumer fallback stays in the plan only as a safety net.
- **Action:** book DeepBook office hours with Tony early (week 1) to confirm the resolution/settlement integration surface — how a Predict market consumes an external resolution source.

## Strategic note — possible Walrus dual-track

- The **Walrus track** is also **$35,000** top prize and is themed *"AI agents and agentic workflows powered by Walrus as a verifiable data and memory layer."*
- Tribunal's **evidence trail is exactly that** — verifiable verdict rationale + sources on Walrus, anchored on-chain, used by an agentic committee.
- The submission guide FAQ has a (collapsed) "Can we submit the same project to multiple tracks?" item, and Sui's prior hackathons allowed one project under a product + a technology track.
- → **Action:** confirm multi-track rules. If allowed, Tribunal is a credible **dual DeepBook + Walrus** submission with near-zero extra work — the Walrus evidence layer is already core, not bolted on.

## University Award

- 10 × **$2,500** for teams with **≥50% student participation**. Likely N/A (42 Network alumni, not current student) — ignore unless a student joins the team.
