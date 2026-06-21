# Tribunal protocol

The full surface of the protocol — on-chain modules, off-chain pipeline,
configuration locks, audit-trail format, and the integrity guarantees that
hold across all of them.

For the case-walkthrough, see [`USER_STORY.md`](USER_STORY.md).
For the live deployment + verified digests, see [`DEPLOYMENTS.md`](DEPLOYMENTS.md).

## Protocol properties

| Property | What you get | Why it matters |
|---|---|---|
| **Stake-gated resolution** | A case can't be resolved until both sides have a staked advocate. The resolver returns `409 BothSidesMustStake` until both slots are filled. | Compute is gated on conviction. No single-party AI judgments. |
| **First-staker advocacy** | The first wallet to stake YES (or NO) becomes that side's advocate. Locked at the protocol level, immutable thereafter. | Advocates are picked by skin-in-the-game, not by a centralized matchmaker. |
| **3× weighted claim share** | Advocates earn a `3.00×` share of the losing pool; backers earn `1.00×`. Principal is fully returned to all winners. | The advocate carries the argument and gets paid for it. Verified live on every run: advocate bonus / backer bonus = **3.000** at equal stake. |
| **Persona-diverse jury** | Three jurors, three distinct archetypes, deterministically seeded from the case id. Same case → same jury, every time. | Dissent is preserved, not silenced. The textualist juror's "no" against a 2-1 YES stays in the public record. |
| **Locked resolver config-hash** | At case creation the chain commits to `sha256(advocate_model ‖ jury_models ‖ guardrail_model ‖ prompt ‖ sources)`. The resolver must present a matching preimage on assert. | The model stack cannot be swapped silently. |
| **Locked guardrail prompt-hash** | The guardrail judge's full system prompt is sha256-pinned at boot and stamped onto every verdict. | The judge's reasoning floor is reproducible. |
| **6-entry audit trail on Walrus** | Each verdict persists one Quilt with six typed entries (`debate · jury · guardrail · verdict · case_law · provenance`). | Replay a run with the pinned hashes and resolver commit, get the same verdict. |
| **Soulbound persona AgentCards** | Each agent is a non-transferable Sui object with a `persona_hash` and an outcome-based `score`. Score moves only via a `ReputationCap`. | Identity, accountability, and reputation are in the type system, not as runtime checks. |
| **Bundled atomic anchoring** | One PTB carries `assert_resolution + N × record_outcome`. Reputation moves with the verdict. | No window where a verdict is anchored but the agents haven't been credited. |
| **Seal-gated deliberation** | Debate transcript and jury deliberation are Seal-encrypted at rest; decrypt only under an on-chain `seal_approve` predicate that flips public when the case settles. | Reasoning is confidential during the dispute window, auditable forever after. |
| **Bonded dispute** | A counter-party can post a bond and re-open the case during the dispute window. Resolution flips reputation and pool payout accordingly. | Tribunal is not a final-answer oracle — it's a court with appeal. |
| **Graceful Walrus degradation** | If the publisher is unreachable, the verdict still returns and `audit: { ok: false, error }` is surfaced inline. | The trail can fail open. The integrity root (the on-chain hashes) cannot. |

## Move modules

| Module | Responsibility |
|---|---|
| [`identity`](move/sources/identity.move) | Soulbound `AgentCard` + `persona_hash` + score lifecycle. Score moves only through `ReputationCap`. |
| [`case`](move/sources/case.move) | Case lifecycle (create → assert → dispute → settle), the locked `config_hash`, `memory_ns`, evidence anchor, `seal_approve` predicate. |
| [`stake`](move/sources/stake.move) | `StakePool<T>`, `StakeReceipt`, first-staker advocacy, 3×-weighted claim math, anti-double-stake guard. |
| [`dispute`](move/sources/dispute.move) | Bonded optimistic dispute. Permissionless override during the window. |
| [`evidence`](move/sources/evidence.move) | Walrus `ArtifactRef` anchoring + certification. |

50/50 unit tests cover the lifecycle, conservation invariants (`captured == dripped + remaining`-style math for the stake pool), and the 3× advocate-bonus formula at equal stake.

## Off-chain pipeline

The resolver lives in [`app/src/lib/server/`](app/src/lib/server/). Seven steps, each in its own file so the audit is grep-able:

1. [`load-agent-pool`](app/src/lib/server/load-agent-pool.ts) — walks Sui events to build the global `AgentCard` registry.
2. [`load-stakers`](app/src/lib/server/load-stakers.ts) — finds the `StakePool` for a `caseId`, reads its staker list and advocate slots, enriches each staker with archetype + score.
3. [`matchmaking`](app/src/lib/server/matchmaking.ts) — confirms both sides have an advocate. Throws `BothSidesMustStake` otherwise.
4. [`select-jury`](app/src/lib/server/select-jury.ts) — picks 3 archetype-distinct, top-reputation jurors, seeded deterministically from `sha256(caseId).slice(0,16)`.
5. [`assemble-case`](app/src/lib/server/assemble-case.ts) — composes persona system-prompts from each `AgentCard`'s `archetype_id`. No free text on the wire.
6. [`resolve`](app/src/lib/server/resolve.ts) — orchestrates debate (N rounds) → jury (first-pass + cross-exam + final) → guardrail (ratify or override, with bias flags).
7. [`persist`](app/src/lib/server/persist.ts) → SDK [`persistVerdictBundle`](sdk/src/memory/verdict.ts) — writes the 6-entry Quilt to Walrus.

The route is [`POST /api/resolve`](app/src/app/api/resolve/route.ts).

## Audit trail (6 typed entries per case)

| Kind | Visibility | Contents |
|---|---|---|
| `debate_transcript` | sealed until settle | full multi-round advocate transcript |
| `jury_deliberation` | sealed until settle | first-pass + final votes, cross-exam, dissent, disagreement rate |
| `guardrail_decision` | public | binding ruling + bias flags + reasoning; pins `guardrailConfigHash` |
| `verdict` | public | YES/NO + question hash + both config hashes + `decidedAt` |
| `case_law` | public | short precedent summary that future panels recall |
| `provenance` | public | full audit row: advocates (with `isFirstStaker: true, weight: 3`), backers, jurors (archetype + seed), model map, gateway temperatures, both config hashes, resolver commit |

## API contract

```http
POST /api/resolve
Content-Type: application/json

{ "caseId": "0x…", "rounds": 2 }
```

Success response:

```json
{
  "bundle": { /* VerdictBundle with provenance */ },
  "audit": {
    "ok": true,
    "quiltId": "0x…",
    "patches": {
      "debate": "…", "jury": "…", "guardrail": "…",
      "verdict": "…", "case_law": "…", "provenance": "…"
    },
    "aggregator": "https://aggregator.walrus-testnet.walrus.space",
    "namespace": "walrus-ns://tribunal/case/0x…"
  }
}
```

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | — | `caseId` missing or malformed |
| 404 | — | No `StakePool` for this `caseId` (stake first to open the case) |
| 404 | `NoCaseInput` | Case object exists but no resolvable question/criteria/evidence |
| 409 | `BothSidesMustStake` | One or both sides has no advocate yet — response carries `emptySides: ["yes"\|"no"]` |
| 422 | `MissingArchetype` | An advocate or juror references an archetype not in the persona library |
| 500 | — | Anything else (typed message in `error`) |

## Trust boundary

| Layer | What lives there | Why |
|---|---|---|
| **Sui (chain)** | Soulbound `AgentCard` + persona hash · outcome-based reputation (cap-gated) · `StakePool` + `StakeReceipt` + claim math · `Case` lifecycle + binding outcome · locked resolver + guardrail config hashes · memory namespace pointer · resolver bond + dispute window · evidence anchor (blob id + sha256) | Identity, money, accountability, and the deciding-config commitment must be tamper-evident. |
| **Walrus (storage)** | Debate transcript (sealed) · jury first-pass + final + dissent (sealed) · guardrail ruling + bias flags + reasoning (public) · typed case law (public) · provenance audit row (public) · question + evidence text | Reasoning is too large for chain but must be auditable, recallable, and tamper-evident. Verdicts and case law are public the moment a case settles. |
| **App (UI)** | Yes/no framing labels · arena cosmetics · live render of the bundle + audit trail | UI framing is presentation, not protocol. Verdicts never depend on it. |

## Determinism + reproducibility

Given the same `caseId`, the same staker order, and a resolver running the same commit against the pinned model stack:

- Jury composition is identical (seeded from `sha256(caseId).slice(0,16)`).
- The model stack is identical (`config_hash` enforced on assert).
- The guardrail prompt is identical (`guardrailConfigHash` stamped on the bundle).
- The 6-entry Quilt is rewriteable byte-for-byte from the provenance row.

The on-chain anchor commits to all of this. Replay the run with the pinned hashes and the resolver commit — the verdict matches.
