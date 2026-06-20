# Tribunal Memory — Verifiable Agent Memory on Walrus

The off-chain layer that makes Tribunal's AI judgment **persistent, recallable,
restorable, and auditable** — the Walrus-track thesis in working code.

A committee of N diverse models decides a subjective question; the full panel
(every model's vote + rationale + the aggregate verdict) is written to Walrus as
a namespaced Quilt, bound to the case's on-chain `memory_ns`. The verdict trail
is durable on Walrus, recallable by semantic query, and rebuildable from Walrus
alone — proving the vector index is a cache and **Walrus is the source of truth**.

## Pieces (`sdk/src/memory/`)

| File | Role |
|---|---|
| `walrus.ts` | Walrus store over the publisher/aggregator HTTP path. `writeBlob`, `writeQuilt`, `readBlob`, `readPatch`, `readByIdentifier`. |
| `index.ts` | `TribunalMemory` — `remember` / `recall` / `restore` over Quilts, namespaced to the on-chain `memory_ns`, with a self-describing per-quilt manifest. Confidential entry kinds are Seal-encrypted at rest; public kinds stay readable. |
| `seal.ts` | `SealAdapter` contract + tiers: `PassthroughSeal` (public, readable), `AesSeal` (real AES-256-GCM, per-identity HKDF keys), and the production threshold-Seal path. |
| `embeddings.ts` | Pluggable embedder: Gemini (`gemini-embedding-001`) when keyed, deterministic local hash fallback otherwise. The index is a rebuildable cache. |
| `committee.ts` | `Committee` — N models (Kiro gateway, OpenAI-compat) vote in parallel → majority verdict + the config-hash preimage. `resolve()` accepts optional `priorContext` so recalled case law informs new verdicts. |
| `env.ts` | Zero-dep `.env` reader for sourcing keys. |

## Operations

- **`remember(entries)`** — Seal-encrypt confidential kinds (`committee_vote`,
  `reasoning_trace`, `evidence_note`), batch as one Quilt, embed each entry,
  write to Walrus. Returns the `quiltId` + index rows. Writes a `_manifest`
  entry so `restore` is self-describing.
- **`recall(query, {k, kind})`** — embed query, cosine-rank the index, fetch the
  top-k entries back from Walrus (by patch id, or by `quiltId`+identifier after a
  restore), transparently Seal-decrypting sealed entries.
- **`restore(quiltIds)`** — wipe the index, re-read every entry from Walrus, and
  re-embed. No centralized memory DB; the namespace's blobs are the truth.

## Confidentiality policy (mirrors on-chain `evidence::can_decrypt`)

In-progress deliberation (`committee_vote`, `reasoning_trace`) is **encrypted at
rest** on public Walrus; the final `verdict` and accumulated `case_law` stay
**public and auditable** — the transparency half of the thesis. Three encryption
tiers behind one `SealAdapter` interface:

1. **`PassthroughSeal`** — no-op; correct for public entries.
2. **`AesSeal`** — real AES-256-GCM. Per-entry key = `HKDF-SHA256(masterSecret,
   salt=namespace:entryId)`, so leaking one derived key never exposes another
   case. Bytes on Walrus are genuine ciphertext + auth tag (tamper-detected).
   Enabled by `TRIBUNAL_SEAL_SECRET`.
3. **Threshold Seal** (production) — `@mysten/seal` `SealClient`, decryption
   gated by the on-chain `seal_approve` policy and a t-of-n key-server committee
   (no single key holder). Drops in behind the same interface.

## On-chain Seal policy

`case.move::seal_approve<T>(id, caller, case)` is what the Seal key servers call.
It gates decryption on **stable facts only** (Seal is not atomic across servers):

1. The Seal identity `id` must be prefixed by the case's `memory_ns`, so a key
   released for one case can never decrypt another case's blobs.
2. Access is granted iff the case is **settled** (verdict is public + auditable)
   **or** the caller is the recorded **resolver** (committee operator working the
   in-progress case). Both are terminal/monotonic — never tx-order sensitive.

Pure predicates `evidence::can_decrypt` and `evidence::is_prefix` are unit-tested
(`test_seal_can_decrypt_gates`, `test_seal_identity_prefix_bind`).

## Run the demo (live testnet)

```bash
cd sdk && npm install && npm run memory-demo
```

No WAL token and no Walrus CLI are required — the public testnet publisher
sponsors storage. The committee runs on local Kiro-gateway models, so no external
LLM key is needed. Embeddings use `GEMINI_API_KEY` if present, else the local
fallback. The demo: resolves two subjective cases, remembers both to Walrus,
recalls the right verdict semantically, then wipes the index and restores it from
Walrus alone — recall still works post-restore.
