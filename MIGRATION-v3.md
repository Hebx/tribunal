# Migrating to Tribunal v3

Tribunal v3 turns the protocol from "AI panel rules on a case" into
"**stake-gated agentic court with reproducible audit trail**". Three things
changed that downstream integrators need to know about.

## 1. Stake-gated case opening

A case can no longer be resolved by anyone calling `/api/resolve`. The
protocol requires a **first staker on each side** before a case becomes
resolvable:

| Before (v2) | After (v3) |
|---|---|
| Anyone calls `/api/resolve` and the AI picks both sides from the global agent pool. | The first wallet to stake YES locks the YES advocate slot. The first wallet to stake NO locks the NO advocate slot. Resolution is blocked with HTTP 409 (`BothSidesMustStake`) until both sides are filled. |
| Advocates are picked by reputation rank. | Advocates are picked by **economic skin-in-the-game** — whoever stakes first, opposes first. |

**On-chain effect.** `stake::create_pool` now exposes `advocate_yes` and
`advocate_no` as `Option<ID>` fields on `StakePool<T>`. Both flip from `None`
to `Some(agent_card_id)` on the first stake to each side and are immutable
thereafter.

**Client effect.** Before calling `POST /api/resolve`, your UI MUST surface a
`StakeInPanel` so a user (and a counter-user) can each stake on the side they
believe in. The route returns 409 with `code: "BothSidesMustStake"` and an
`emptySides: ["yes"|"no"]` array if either side is unfilled — display this as
a "this side is open, stake to argue it" CTA, not as a generic error.

## 2. 3x weighted claim share

The first staker on each side (the **advocate**) does the work — they're the
one whose persona drives the debate transcript. v3 rewards that with a
**3.00x share weight** on the losing pool. Backers (later stakers on the same
side) get **1.00x**.

Principal is fully returned; **only the losing-pool *share* is weighted**:

```
adv_share    = (3 × adv.principal      / yes_weighted_total) × losing_pool
backer_share = (1 × backer.principal   / yes_weighted_total) × losing_pool

yes_weighted_total = 3 × adv_yes.principal + Σ backer_yes.principal
no_weighted_total  = 3 × adv_no.principal  + Σ backer_no.principal
```

At equal principal, the advocate's bonus is **exactly 3x** the backer's
bonus. `sdk/scripts/verify-v3-flow.mts` asserts this against the live testnet
package on every run.

## 3. Audit trail on Walrus — 6 typed Quilt entries

Every verdict is persisted to Walrus as **one Quilt with six typed entries**.
This is the reproducibility chain: `caseId → Quilt → 6 entries → re-run with
the pinned `configHashes` and `resolverCommit`, get the same verdict.

| Kind | Visibility | Carries |
|---|---|---|
| `debate_transcript` | sealed until settle | full multi-round advocate transcript |
| `jury_deliberation` | sealed until settle | first-pass + final votes, dissent, disagreement rate |
| `guardrail_decision` | public | binding ruling + bias flags + pinned `guardrailConfigHash` |
| `verdict` | public | YES/NO + both `configHashes` + decidedAt |
| `case_law` | public | short precedent summary that future panels recall |
| `provenance` (**v3 new**) | public | full audit row: advocates (incl. first-staker flag + weight) / backers / jurors with archetypes + seeds / model map / gateway temperatures / configHashes / resolverCommit |

**Graceful degradation.** If the Walrus publisher is unreachable, the
resolver still returns the verdict — `audit` flips to
`{ ok: false, error: "..." }` and the UI surfaces the gap inline.
**The on-chain anchor (`configHashHex` + `guardrailConfigHash`) is the
tamper-evident root.** The Quilt is the trail.

## API surface

### `POST /api/resolve`

**Request:**
```json
{ "caseId": "0x...", "rounds": 2 }
```

**Response (success):**
```json
{
  "bundle": { /* VerdictBundle with provenance row */ },
  "audit": {
    "ok": true,
    "quiltId": "0x...",
    "patches": { "debate": "...", "jury": "...", "guardrail": "...", "verdict": "...", "case_law": "...", "provenance": "..." },
    "aggregator": "https://aggregator.walrus-testnet.walrus.space",
    "namespace": "walrus-ns://tribunal/case/0x..."
  }
}
```

**Error contracts:**

| HTTP | `code` | Meaning |
|---|---|---|
| 400 | — | `caseId` missing or malformed |
| 404 | — | No `StakePool` for this `caseId` — stake first to open the case |
| 404 | `NoCaseInput` | Case object exists but no resolvable question/criteria/evidence (live cases need the on-chain `evidence_ref → Walrus` blob) |
| 409 | `BothSidesMustStake` | One or both sides has no advocate yet — response carries `emptySides: ["yes"\|"no"]` |
| 422 | `MissingArchetype` | An advocate or juror references an archetype not registered in the persona library |
| 500 | — | Anything else (typed message in `error`) |

### New SDK exports

```ts
// Stake builders (sdk/src/agents/stake.ts) — unchanged signatures, semantics
// updated: first stake to each side locks the advocate slot.
import { buildCreatePool, buildStake, buildClaim } from "@tribunal/sdk";

// Audit-trail persistence (sdk/src/memory/verdict.ts) — now emits 6 typed
// entries when the bundle carries `provenance`. Legacy 5-entry bundles still
// work for backcompat.
import { persistVerdictBundle, type VerdictBundleLike } from "@tribunal/sdk/memory/verdict";

// Stake-pool inspection — read who staked, in what order, with what weight.
import { readStakerList } from "@tribunal/sdk/agents/staker-list";
```

## Migration checklist

If you integrated with v2:

- [ ] Replace direct "open case → resolve" flows with **stake-then-resolve**. Surface the StakeInPanel before any resolve CTA.
- [ ] Handle `HTTP 409 BothSidesMustStake` as a UX state, not an error.
- [ ] If you parse the `VerdictBundle` shape, expect a new optional `provenance` field — it's the audit row.
- [ ] If you read the verdict Quilt, expect **6 patches** when `provenance` is present, **5 patches** for legacy bundles.
- [ ] If you display payouts, label first-stakers as "advocate (3x)" and others as "backer (1x)". `readStakerList` returns `is_advocate: bool` directly.

## Verifying the migration

```bash
cd sdk
node --import tsx scripts/verify-v3-flow.mts
```

Asserts on a live testnet run:

1. First-staker advocacy (advocate slots locked to the first wallet on each side).
2. Weighted totals = `3 × adv_principal + Σ backer_principal` per side.
3. Advocate's bonus is **exactly 3x** the backer's bonus at equal stake.
4. Losing-pool fully drained; loser's receipt consumed with zero payout.
5. All **6 typed Quilt entries** land on Walrus.

Exit-non-zero on any missed invariant.
