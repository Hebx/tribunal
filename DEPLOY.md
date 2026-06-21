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

## Environment variables

Set these in **Project Settings → Environment Variables**. Mark them for
*Production* and *Preview*. None of these should be exposed in plain text in
a commit.

### Required (without these, live verdicts will error)

| Key | Value | Notes |
|---|---|---|
| `KIRO_GATEWAY_BASE_URL` | `https://<your-public-gateway-host>` | Must be reachable from Vercel's serverless region. **127.0.0.1 will not work.** See "Gateway exposure" below. |
| `KIRO_GATEWAY_API_KEY` | (secret) | Bearer token the gateway accepts. |

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
| `NEXT_PUBLIC_WALRUS_AGGREGATOR` | unset | Client-side aggregator URL for the legacy committee precedent recall. |

### Demo mode

| Key | Default | Effect |
|---|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | `true` | Home feed shows seeded battles. The live battle flow always hits the real gateway + Walrus. Set to `false` only when wiring the feed to a live source. |

## Gateway exposure

The default `KIRO_GATEWAY_BASE_URL` is `http://127.0.0.1:8000`, which is the
Kiro gateway running on the local dev box. Vercel functions cannot reach that.
Three options, ordered by recommended:

1. **Tailscale Funnel / Cloudflare Tunnel.** Expose the local gateway over a
   public HTTPS hostname, set `KIRO_GATEWAY_BASE_URL` to it. Lowest friction.
2. **Run the gateway on a small VPS** (Fly, Railway, EC2 micro). Same effect,
   permanent.
3. **Mock the gateway** for the public preview — the home feed already works
   without it; only `/api/resolve` (live verdict) needs it. If the preview is
   read-only walkthrough, skip the gateway entirely and the dead routes will
   throw a clean 500 with a "gateway not configured" message.

## CLI deploy

```bash
# from repo root, the first time
vercel link                              # answer "yes" to "is this directory a monorepo" → app
vercel env add KIRO_GATEWAY_BASE_URL production
vercel env add KIRO_GATEWAY_API_KEY production
vercel --prod
```

After link, `.vercel/project.json` will record root = `app`. Subsequent
`vercel --prod` deploys read from there. Build output lands in `app/.next`.

## Verifying the deploy

After the first prod build:

- `https://<deploy>/` — home feed renders, hero case shows the v3 verified
  digests (`DVCo…`, `6rrh…`, `Csrc…`) and Walrus quilt `P1dOdJi1Vu_…`.
- `https://<deploy>/agents` — leaderboard pulls live on-chain reputation
  from testnet. Empty until the first agent is registered.
- `https://<deploy>/precedent` — typed case-law browser.
- `https://<deploy>/api/judge` — should respond with 405 or 400 on GET (it's
  POST-only). A 500 with "gateway not configured" means env vars aren't set.

## What `app/vercel.json` does

- Pins framework to Next.js (skips re-detection).
- Pins serverless region to `iad1` (us-east-1, lowest latency to most Sui RPCs).
- Limits auto-deploy to the `main` branch — feature branches do not trigger
  preview builds unless explicitly enabled in the dashboard.

