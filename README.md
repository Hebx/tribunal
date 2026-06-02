# Tribunal

**A credibly-neutral, disputable AI resolution oracle with verifiable, persistent memory — on Sui + Walrus.**

![Tribunal](brand/tribunal-logo.png)

AI agents are increasingly asked to make consequential judgments: resolving disputes, settling subjective prediction markets, reviewing claims, moderating content. But most agents decide in isolation, forget across sessions, and leave no trustworthy trail of *why*. Tribunal makes AI judgment **accountable, persistent, and contestable**.

A committee of independent models resolves a subjective yes/no question, locks the deciding configuration on-chain, writes the full panel reasoning to verifiable storage, and exposes the verdict to a bonded dispute window. Every decision can be traced back to the exact models, prompt, and evidence that produced it — and overturned if it's wrong.

## How it works

1. **Create a case.** A subjective question is registered as a shared Sui object. At creation it permanently locks a `config_hash = sha256(models ‖ prompt ‖ sources)` and a `memory_ns` (the verifiable-memory namespace for this case). The deciding configuration is now tamper-evident.
2. **The committee resolves.** N independent models each vote TRUE/FALSE with a rationale; votes aggregate into a verdict by majority.
3. **Assert on-chain.** The resolver posts the outcome with a bond and an `ArtifactRef` anchoring the off-chain evidence bundle (rationale, per-model votes, sources) stored on Walrus.
4. **Dispute window.** Anyone may challenge the verdict with a matching bond during the liveness window. A disputed case is re-resolved; the loser forfeits their bond, and the outcome flips if the challenge succeeds.
5. **Settle.** If undisputed past the window, the case settles and the bond is returned. Downstream consumers read the final `(is_settled, outcome_true)`.

## What makes it trustworthy

- **Locked resolver config-hash** — the resolver must present config matching the on-chain hash at settlement, or the transaction aborts. The deciding AI cannot be swapped silently.
- **Bonded optimistic dispute** — accountability with teeth: incorrect verdicts are economically challengeable.
- **Verifiable memory on Walrus** — the committee's judgment (every vote, rationale, and verdict) is persisted as namespaced [Walrus](https://www.walrus.xyz) Quilts, semantically recallable, and rebuildable from Walrus alone. The vector index is a cache; Walrus is the source of truth.
- **Seal-gated access** — sealed evidence decrypts only under an on-chain policy: a verdict is public once settled, and otherwise readable only by the recorded resolver. Access is gated on stable facts, never tx-ordering-sensitive state.
- **On-chain certification** — a Move contract can verify a Walrus blob is certified and unexpired before a verdict's evidence is trusted, stronger than a bare hash.

## Repository layout

```
move/                    Move 2024 package
  sources/
    case.move            Case lifecycle, config-hash lock, settlement, seal_approve policy
    dispute.move         Bonded optimistic dispute + payout math
    evidence.move        Walrus ArtifactRef anchoring + certification + Seal predicates
  tests/                 25 unit tests
sdk/                     TypeScript SDK (@mysten/sui 2.x)
  src/
    client.ts            Programmable-transaction builders + event queries
    signer.ts            Key loading + config-hash helpers
    types.ts             Shared types
    memory/              Verifiable agent-memory layer (Walrus + committee)
  scripts/
    deploy.ts            Publish the package to a network
    e2e.ts               Full on-chain lifecycle (disputed + undisputed)
    memory-demo.ts       Committee resolve -> remember -> recall -> restore
brand/                   Logo assets
```

See [`sdk/src/memory/README.md`](sdk/src/memory/README.md) for the memory layer and committee internals.

## Quick start

Requires the [Sui CLI](https://docs.sui.io/guides/developer/getting-started/sui-install) and Node 22+.

```bash
# Move package
cd move
sui move build
sui move test            # 25/25

# TypeScript SDK
cd ../sdk
npm install
npm run typecheck

# Deploy to a network (signer from TRIBUNAL_PRIVKEY or the Sui CLI keystore)
TRIBUNAL_NETWORK=testnet npm run deploy
npm run e2e              # full lifecycle against the deployed package

# Verifiable-memory demo (committee -> Walrus -> recall -> restore)
npm run memory-demo
```

The memory demo uses the public Walrus testnet publisher (no WAL token or Walrus CLI required) and runs the committee against a local OpenAI-compatible gateway, so no external LLM key is needed. Embeddings use `GEMINI_API_KEY` if present, otherwise a deterministic local fallback.

## Use cases

Dispute and claim resolution, subjective prediction-market settlement, DAO grant review, content-moderation appeals — anywhere an AI decision needs to be **remembered, explained, and contestable**.

## Deployments

Current testnet package ID and verified end-to-end transactions are recorded in [`DEPLOYMENTS.md`](DEPLOYMENTS.md).

## License

MIT
