"use client";

import { useState } from "react";
import type { Battle } from "@/lib/types";

// Honest disclosure of what's actually on-chain vs Walrus vs UI. Credibility >
// looking maximally decentralized. Verified against move/sources/case.move.
const ROWS: { field: string; where: "chain" | "walrus" | "ui" }[] = [
  { field: "Case lifecycle + outcome (yes/no)", where: "chain" },
  { field: "Locked committee config hash", where: "chain" },
  { field: "Memory namespace pointer", where: "chain" },
  { field: "Resolver bond + dispute window", where: "chain" },
  { field: "Evidence anchor (blob id + sha256)", where: "chain" },
  { field: "Question + evidence text", where: "walrus" },
  { field: "Per-judge votes + rationale", where: "walrus" },
  { field: "Typed case law (precedent)", where: "walrus" },
  { field: "Advocates (yes/no framing)", where: "ui" },
];

const TONE: Record<string, string> = {
  chain: "text-justice border-justice/40",
  walrus: "text-verdict-true border-verdict-true/40",
  ui: "text-text-faint border-steel/40",
};
const LABEL: Record<string, string> = { chain: "Sui", walrus: "Walrus", ui: "UI" };

export function OnChainPanel({ battle: _battle }: { battle: Battle }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="hud-panel overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3 text-left"
      >
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
          What's on-chain, what's on Walrus
        </span>
        <span className="font-mono text-xs text-text-faint">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-steel/30 px-5 py-4">
          <p className="mb-3 text-[12px] leading-relaxed text-text-muted">
            Tribunal anchors trust on-chain and keeps reasoning verifiable on Walrus.
            We&apos;re explicit about the boundary:
          </p>
          <ul className="space-y-1.5">
            {ROWS.map((r) => (
              <li key={r.field} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="text-text">{r.field}</span>
                <span className={`pill shrink-0 ${TONE[r.where]}`}>{LABEL[r.where]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
