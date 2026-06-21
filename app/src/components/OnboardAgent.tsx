"use client";

import { useEffect, useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useExecute } from "@/lib/useExecute";
import { buildRegisterAgent, findCreated } from "@/lib/tx";
import { explorerTx, explorerObject } from "@/lib/chain";

interface ArchetypeOption {
  id: string;
  name: string;
  lens: string;
}

export function OnboardAgent() {
  const account = useCurrentAccount();
  const { run, pending } = useExecute();

  const [archetypes, setArchetypes] = useState<ArchetypeOption[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [customText, setCustomText] = useState("");
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanFlags, setScanFlags] = useState<string[]>([]);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ digest: string; cardId?: string } | null>(null);

  // Load curated archetypes for the picker.
  useEffect(() => {
    fetch("/api/persona")
      .then((r) => r.json())
      .then((d) => {
        setArchetypes(d.archetypes ?? []);
        if (d.archetypes?.[0]) setSelected(d.archetypes[0].id);
      })
      .catch(() => setError("failed to load archetypes"));
  }, []);

  const canMint = !!account && !!selected && !pending && !result;

  // Compose + scan server-side, then mint the soulbound AgentCard.
  async function onboard() {
    setError(null);
    setScanError(null);
    setScanFlags([]);
    setPreview(null);
    setResult(null);
    try {
      // 1) server compose + injection scan -> personaHash + preview
      const pr = await fetch("/api/persona", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archetypeId: selected, customText }),
      });
      const pd = await pr.json();
      if (!pr.ok) {
        setScanError(pd.error ?? "persona rejected");
        setScanFlags(pd.flags ?? []);
        return;
      }
      setPreview(pd.systemPrompt);

      // 2) wallet-signed mint of the soulbound AgentCard
      const tx = buildRegisterAgent(selected, pd.personaHash);
      const res = await run(tx);
      const cardId = findCreated(res, "::identity::AgentCard");
      setResult({ digest: res.digest, cardId });
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Archetype picker */}
      <section className="space-y-2">
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
          Judicial lens
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {archetypes.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setSelected(a.id)}
              className={`rounded-xl border p-3 text-left transition ${
                selected === a.id
                  ? "border-justice bg-justice/10 shadow-glow"
                  : "border-steel/30 hover:border-steel"
              }`}
            >
              <div className="font-medium text-text">{a.name}</div>
              <div className="text-xs text-text-muted">{a.lens}</div>
            </button>
          ))}
        </div>
      </section>

      {/* Custom description */}
      <section className="space-y-2">
        <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-text-faint">
          Custom description (optional)
        </label>
        <textarea
          value={customText}
          onChange={(e) => setCustomText(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="e.g. A former protocol auditor who values precise acceptance criteria."
          className="w-full rounded-xl border border-steel/30 bg-ink p-3 text-sm text-text outline-none focus:border-justice"
        />
        <p className="text-xs text-text-faint">
          Flavor on top of the lens. Scanned for injection — it cannot override case criteria.
        </p>
        {scanError && (
          <div className="rounded-xl border border-verdict-false/40 bg-verdict-false/10 p-3 text-sm text-verdict-false">
            {scanError}
            {scanFlags.length > 0 && (
              <span className="block text-xs text-text-muted">flagged: {scanFlags.join(", ")}</span>
            )}
          </div>
        )}
      </section>

      {!account && <p className="text-sm text-gold">Connect a wallet to mint your agent.</p>}

      <button
        type="button"
        disabled={!canMint}
        onClick={onboard}
        className="w-full rounded-xl bg-justice px-4 py-3 font-medium text-ink transition hover:bg-justice-deep disabled:opacity-40"
      >
        {pending ? "Minting…" : result ? "Onboarded ✓" : "Mint agent identity"}
      </button>

      {error && <p className="text-sm text-verdict-false">{error}</p>}

      {result && (
        <section className="space-y-2 rounded-xl border border-justice/30 bg-justice/5 p-4 text-sm">
          <div className="font-medium text-justice">Agent onboarded</div>
          <a className="block text-text-muted underline" href={explorerTx(result.digest)} target="_blank" rel="noreferrer">
            mint transaction ↗
          </a>
          {result.cardId && (
            <a className="block text-text-muted underline" href={explorerObject(result.cardId)} target="_blank" rel="noreferrer">
              AgentCard object ↗
            </a>
          )}
          {preview && (
            <details className="text-text-muted">
              <summary className="cursor-pointer">persona system prompt</summary>
              <pre className="mt-2 whitespace-pre-wrap text-xs">{preview}</pre>
            </details>
          )}
        </section>
      )}
    </div>
  );
}
