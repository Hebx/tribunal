"use client";

import { useState } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import { useExecute } from "@/lib/useExecute";
import { buildDispute } from "@/lib/tx";
import { explorerTx } from "@/lib/chain";
import type { Battle } from "@/lib/types";

const BOND = 100_000_000n; // 0.1 SUI — must match the resolver bond

// Permissionless bonded dispute. Posts dispute_resolution<SUI> on-chain for a
// case that has a real on-chain id and an asserted ruling. Anyone can challenge.
export function DisputeButton({ battle }: { battle: Battle }) {
  const account = useCurrentAccount();
  const { run, pending } = useExecute();
  const [digest, setDigest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Only meaningful for a real on-chain case that isn't already settled.
  if (!battle.caseId || battle.status === "settled") return null;

  async function dispute() {
    if (!battle.caseId) return;
    setError(null);
    try {
      const tx = buildDispute(battle.caseId, BOND);
      const res = await run(tx);
      setDigest(res.digest);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    }
  }

  return (
    <div className="hud-panel border-gold/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-wider text-gold">Challenge this ruling</div>
          <p className="mt-1 text-[13px] text-text-muted">
            Post a matching {Number(BOND) / 1e9} SUI bond to dispute. Permissionless — anyone can challenge.
          </p>
        </div>
        <button
          onClick={dispute}
          disabled={!account || pending || !!digest}
          className="btn-ghost border-gold/50 text-gold hover:border-gold hover:text-gold"
        >
          {!account ? "Connect to dispute" : pending ? "Disputing…" : digest ? "Disputed ✓" : "Dispute ruling"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-verdict-false">{error}</p>}
      {digest && (
        <a
          href={explorerTx(digest)}
          target="_blank"
          rel="noreferrer"
          className="chip-mono mt-3 inline-flex hover:border-justice/60 hover:text-justice"
        >
          dispute tx {digest.slice(0, 10)}… ↗
        </a>
      )}
    </div>
  );
}
