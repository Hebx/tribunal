# Tribunal — Deploy to Vercel

The arena is a single Next.js app under `app/`. Move package and SDK are not
deployed — they're already on Sui testnet and consumed at runtime via the
package id baked into `chain.ts`.

## Project setup

1. From the Vercel dashboard: **Add New → Project** and select this repo.
2. **Root Directory:** set to `app`. This is the single most important setting
   — without it, Vercel will try to build from the repo root and fail because
   there's no `package.json` there.
3. **Framework Preset:** Next.js (auto-detected once root is set).
4. **Build Command / Install Command / Output Directory:** leave on auto. The
   `app/vercel.json` already pins the framework and region; pnpm is detected
   from the lockfile.
5. **Node version:** 20.x (default).

## LLM provider

Tribunal supports two interchangeable providers — the runtime picks one at
boot based on which key is present.

| Provider | When | Selector |
|---|---|---|
| **OpenRouter** | Vercel / any cloud deploy | `OPENROUTER_API_KEY` present |
| **Kiro local gateway** | Local dev only (loopback `127.0.0.1:8000`) | no `OPENROUTER_API_KEY` |

Tests pin the provider with `TRIBUNAL_GATEWAY_PROVIDER=kiro` so the
ambient env doesn't bleed into them.

### Model roles

The three role functions resolve to provider-specific default slugs unless
overridden. The high-tier judge slot goes to a frontier reasoning model;
advocates and jurors share an efficient flash-class model.

| Role | OpenRouter default | Kiro default | Override env |
|---|---|---|---|
| Guardrail (high-tier judge) | `z-ai/glm-5.2` | `claude-opus-4.8` | `TRIBUNAL_GUARDRAIL_MODEL` |
| Jury | `deepseek/deepseek-v4-flash` | `claude-sonnet-4.6` | `TRIBUNAL_JURY_MODEL` |
| Advocates | `deepseek/deepseek-v4-flash` | `claude-haiku-4.5` | `TRIBUNAL_ADVOCATE_MODEL` |

GLM-5.2 is a reasoning model that hides its answer in `message.reasoning` by
default. The gateway client sends `reasoning: { enabled: false }` on all
OpenRouter calls so the answer comes back in `message.content` where the
prompt-parsers expect it. If you ever want to surface the reasoning trace,
drop the override in `app/src/lib/server/gateway.ts` and read
`message.reasoning` from the response.

## Environment variables

Set these in **Project Settings → Environment Variables**. Mark them for
*Production* and *Preview*.

### Required (live verdicts won't work without these)

| Key | Value | Notes |
|---|---|---|
| `OPENROUTER_API_KEY` | `sk-or-v1-…` | The repo-owner's key lives in `~/.hermes/.env` locally — never commit. Add the same value to Vercel as a secret. |

### Optional OpenRouter attribution

| Key | Value | Effect |
|---|---|---|
| `OPENROUTER_HTTP_REFERER` | `https://<deploy>.vercel.app` | Surfaces the deploy on the OpenRouter leaderboard. |
| `OPENROUTER_X_TITLE` | `Tribunal Arena` | Display name on the leaderboard. |

### Required for on-chain reads (already have safe testnet defaults)

| Key | Default | Set when |
|---|---|---|
| `NEXT_PUBLIC_SUI_NETWORK` | `testnet` | Always — pin to `testnet` for the preview. |
| `NEXT_PUBLIC_TRIBUNAL_PACKAGE_ID` | (bundled testnet id) | Override only if you redeploy the Move package. |
| `NEXT_PUBLIC_TRIBUNAL_CREATOR_CAP` | (bundled) | Same. |
| `NEXT_PUBLIC_TRIBUNAL_REPUTATION_CAP` | (bundled) | Same. |
| `NEXT_PUBLIC_TRIBUNAL_CAP_HOLDER` | (bundled) | Same. |

### Optional — Walrus audit-trail persistence

| Key | Default | Set when |
|---|---|---|
| `WALRUS_PUBLISHER` | unset | If unset, `/api/resolve` returns `audit: { ok: false }` but the verdict still ships. Set to a Walrus publisher URL to land typed quilts. |
| `WALRUS_AGGREGATOR` | unset | Same; needed to read sealed entries server-side. |
| `NEXT_PUBLIC_WALRUS_AGGREGATOR` | unset | Client-side aggregator URL for precedent recall. |

### Optional — model overrides

Use only if you want to swap models without editing code.

| Key | Effect |
|---|---|
| `TRIBUNAL_GUARDRAIL_MODEL` | Override the high-tier judge slug. |
| `TRIBUNAL_JURY_MODEL` | Override the jury slug. |
| `TRIBUNAL_ADVOCATE_MODEL` | Override the advocate slug. |
| `TRIBUNAL_GATEWAY_PROVIDER` | Force `openrouter` or `kiro` regardless of which keys are set (used by tests). |

### Demo mode

| Key | Default | Effect |
|---|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | `true` | Home feed shows seeded battles. The live battle flow always hits the real gateway + Walrus. Set to `false` only when wiring the feed to a live source. |

## Kiro stays local

The default Kiro gateway base is `http://127.0.0.1:8000`. **Do not expose it
to Vercel.** It's the personal dev-box gateway and is intentionally
loopback-only. The OpenRouter path exists so the public deploy doesn't need
to touch the local gateway at all.

## CLI deploy

```bash
# from repo root, the first time
vercel link                                              # set Root Directory = app
vercel env add OPENROUTER_API_KEY production preview
vercel env add OPENROUTER_HTTP_REFERER production preview
vercel env add OPENROUTER_X_TITLE production preview
vercel --prod
```

After link, `.vercel/project.json` records the project. Subsequent
`vercel --prod` deploys reuse it. Build output lands in `app/.next`.

## Verifying the deploy

After the first prod build:

- `https://<deploy>/` — home feed renders, hero case shows the v3 verified
  digests (`DVCo…`, `6rrh…`, `Csrc…`) and Walrus quilt `P1dOdJi1Vu_…`.
- `https://<deploy>/agents` — leaderboard pulls live on-chain reputation
  from testnet. Empty until the first agent is registered.
- `https://<deploy>/precedent` — typed case-law browser.
- `https://<deploy>/api/judge` — should respond with 405 or 400 on GET (it's
  POST-only). A 500 with "OPENROUTER_API_KEY not configured" means the env
  var is missing from the Vercel project settings.

To force a live verdict end-to-end, hit `/battle/[id]` for any case with
`caseId` set and trigger a resolve — it will route through OpenRouter and
write a Walrus Quilt if `WALRUS_PUBLISHER` is set.

## What `app/vercel.json` does

- Pins framework to Next.js (skips re-detection).
- Pins serverless region to `iad1` (us-east-1, lowest latency to most Sui RPCs).
- Limits auto-deploy to the `main` branch — feature branches do not trigger
  preview builds unless explicitly enabled in the dashboard.
