# Contributing to Tribunal

Thanks for your interest in Tribunal. This document describes how to set up the
toolchain, propose changes, and keep the project's quality bar.

## Workspace layout

| Path | Stack | Notes |
|------|-------|-------|
| `move/` | Sui Move 2024 | On-chain protocol (`case`, `identity`, `stake`, `evidence`, `dispute`) |
| `sdk/` | TypeScript (Node 22, `@mysten/sui` 2.x) | PTB builders, event subscription, memory layer |
| `app/` | Next.js 14 (App Router), Tailwind, dapp-kit | The Arena — UI + `/api/resolve` persona-debate pipeline |
| `offchain/`, `scripts/` | TypeScript | Operator scripts; not user-facing |
| `docs/` | Markdown | Internal planning + research |

## Prerequisites

- **Sui CLI** pinned to `mainnet-v1.72.5` (matches CI). Install:
  `curl -sSf https://install.mystenlabs.com | sh`
- **Node 22+** and **pnpm 9** (for `app/`), **npm** (for `sdk/`).
- For end-to-end testnet runs: a funded testnet wallet — set `TRIBUNAL_PRIVKEY`
  or use the Sui CLI keystore.

## Local setup

```bash
# Move
cd move && sui move build && sui move test

# SDK
cd ../sdk && npm install && npm run typecheck && npm test

# App
cd ../app && pnpm install && pnpm typecheck && pnpm test && pnpm build
```

The app's `/api/resolve` pipeline needs the gateway reachable at
`KIRO_GATEWAY_BASE_URL` (default `http://127.0.0.1:8000`) with
`KIRO_GATEWAY_API_KEY` set in `app/.env.local` (or `~/.hermes/.env`). Without
a key the resolver surfaces an inline error — the rest of the UI still loads.

## Branch + PR workflow

- Branch from `main`. Use `feat/<topic>`, `fix/<topic>`, `chore/<topic>` prefixes.
- Keep PRs focused. Move + SDK + App in one PR is OK if they ship a single
  feature; sweeping unrelated cleanups belong in their own PR.
- Commit author + committer must match the canonical identity recorded for the
  repo. The PR template (`.github/pull_request_template.md` when added) is the
  acceptance form.
- All PRs must pass CI:
  - `move-ci`: `sui move build` + `sui move test` (currently 46/46)
  - `app-ci`: typecheck + unit tests + `next build` (currently 43/43)
  - SDK typecheck (gated inside `move-ci`)

## Code style + quality bar

- **Match the surrounding style.** Don't introduce new libraries, formatters,
  or patterns unless the change explicitly needs them.
- **TDD for new modules.** SDK and app code ships with unit tests; PTB builders
  must have a `tx.getData()` shape assertion (call set, ordering, pure-arg
  decode) so the inner test loop stays offline.
- **One real testnet verifier per feature.** When a new on-chain capability
  lands, add `sdk/scripts/verify-<feature>.mts` that runs the full lifecycle
  against testnet and records the digest in `DEPLOYMENTS.md`.
- **No fabricated tool output.** If a build, install, or testnet call fails,
  report the blocker — never paper over with synthesised results.

## Security and safety

- **No secrets in commits.** `.env.local`, `~/.hermes/.env`, and any
  `KIRO_GATEWAY_API_KEY` / `GEMINI_API_KEY` / `TRIBUNAL_PRIVKEY` value must
  never be committed. Use `.env.example` as the template.
- **Audit changes that touch capability gates.** `CaseCreatorCap`,
  `ReputationCap`, and the `seal_approve` policy are load-bearing — changes
  to these surfaces require an explicit review note in the PR body.
- **Disclose externally before publishing.** Anything that posts on behalf
  of the protocol (X, blog, Discord) is opt-in by the deployer, not a side
  effect of a PR.

## Issues

Open an issue with a minimal reproduction, expected behavior, and observed
behavior. For protocol bugs, include the package id, tx digest, and the
SuiScan link to the failing transaction.

## Releases + versioning

The repo uses [SemVer](https://semver.org). Current state: pre-1.0
(`0.x.y` — public API may change between minor versions). See
[`DEPLOYMENTS.md`](DEPLOYMENTS.md) for the canonical on-chain release record.

## License

By contributing, you agree your contributions are licensed under the MIT
license (see [`LICENSE`](LICENSE)).
