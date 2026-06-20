"use client";

import { useState } from "react";
import Link from "next/link";
import { useCurrentAccount, useSuiClient } from "@mysten/dapp-kit";
import { useExecute } from "@/lib/useExecute";
import {
  buildCreateCase,
  buildAssertResolution,
  configHash,
  sha256Bytes,
  findCreated,
} from "@/lib/tx";
import { explorerTx, explorerObject, CAP_HOLDER } from "@/lib/chain";
import type { Verdict } from "@/lib/types";

const MODELS = "claude-haiku-4.5,claude-sonnet-4.5,minimax-m2.5";
const PROMPT =
  "Resolve the question strictly on the supplied evidence and authoritative sources. Be neutral; do not speculate beyond the evidence.";
const SOURCES = "official-announcements, primary-reporting, on-chain-data";
const BOND = 100_000_000n; // 0.1 SUI

type Step = { label: string; digest?: string; objectId?: string; done: boolean };

export function SummonForm() {
  const account = useCurrentAccount();
  const client = useSuiClient();
  const { run, pending } = useExecute();

  const [challenge, setChallenge] = useState("");
  const [evidence, setEvidence] = useState("");
  const [phase, setPhase] = useState<"idle" | "judging" | "creating" | "asserting" | "done">("idle");
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);

  const isCapHolder = account?.address === CAP_HOLDER;
  const canSubmit = !!account && isCapHolder && challenge.trim().length > 8 && evidence.trim().length > 8 && phase === "idle";

  async function summon() {
    setError(null);
    setVerdict(null);
    setSteps([]);
    try {
      // 1) Real committee verdict
      setPhase("judging");
      const jr = await fetch("/api/judge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: challenge, evidence }),
      });
      const jd = await jr.json();
      if (!jr.ok) throw new Error(jd.error ?? "committee failed");
      const v: Verdict = jd.verdict;
      setVerdict(v);

      // 2) create_case on-chain (cap-gated)
      setPhase("creating");
      const { epoch } = await client.getLatestSuiSystemState();
      const cfg = await configHash(MODELS, PROMPT, SOURCES);
      const ns = `walrus-ns://tribunal/arena-${Date.now()}`;
      const createTx = buildCreateCase({
        questionHash: await sha256Bytes(`${challenge}|${evidence}`),
        configHash: cfg.hash,
        memoryNs: new TextEncoder().encode(ns),
        expiryEpoch: Number(epoch),
        livenessEpochs: 1,
        resolverCapRecipient: account!.address,
      });
      const cr = await run(createTx);
      const caseId = findCreated(cr, "::case::Case<");
      const capId = findCreated(cr, "::case::ResolverCap");
      setSteps((s) => [...s, { label: "create_case", digest: cr.digest, objectId: caseId, done: true }]);
      if (!caseId || !capId) throw new Error("case/cap not found in effects");

      // 3) assert_resolution with the committee outcome (config must hash-match)
      setPhase("asserting");
      const assertTx = buildAssertResolution({
        caseId,
        resolverCapId: capId,
        presentedConfig: cfg.preimage,
        outcomeTrue: v.outcomeTrue,
        evidence: {
          blobId: new TextEncoder().encode(ns),
          sha256: await sha256Bytes(ns),
          sealed: true,
          epoch: 1000,
        },
        bondAmount: BOND,
      });
      const ar = await run(assertTx);
      setSteps((s) => [...s, { label: "assert_resolution", digest: ar.digest, done: true }]);
      setPhase("done");
    } catch (e: any) {
      setError(String(e?.message ?? e));
      setPhase("idle");
    }
  }

  return (
    <div className="max-w-2xl">
      {/* Wallet gating notice */}
      {!account && (
        <div className="hud-panel mb-5 border-justice/40 p-4 text-sm text-text-muted">
          Connect a wallet to bring a question on-chain. Opening a case is gated by the
          <span className="font-mono"> CaseCreatorCap</span> (held by the protocol deployer);
          disputing an existing ruling is open to anyone.
        </div>
      )}
      {account && !isCapHolder && (
        <div className="hud-panel mb-5 border-gold/40 p-4 text-sm text-text-muted">
          <span className="text-gold">Note —</span> opening a case is gated by the
          <span className="font-mono"> CaseCreatorCap</span>, held by the protocol deployer. Connect the
          deployer wallet to summon. Anyone can still <span className="text-text">dispute</span> an existing
          ruling from its battle page.
        </div>
      )}

      <div className="hud-panel space-y-4 p-5">
        <div>
          <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-text-faint">
            The question (subjective, contestable)
          </label>
          <textarea
            value={challenge}
            onChange={(e) => setChallenge(e.target.value)}
            rows={2}
            placeholder="Did the grantee meet the milestone, given the deliverable shipped at 80% of spec?"
            className="w-full resize-none rounded-lg border border-steel/40 bg-ink/60 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-justice/60 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block font-mono text-[11px] uppercase tracking-wider text-text-faint">
            Evidence on record
          </label>
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            rows={4}
            placeholder="The facts the bench must weigh…"
            className="w-full resize-none rounded-lg border border-steel/40 bg-ink/60 px-3 py-2 text-sm text-text placeholder:text-text-faint focus:border-justice/60 focus:outline-none"
          />
        </div>
        <div className="flex items-center justify-between">
          <span className="font-mono text-[11px] text-text-faint">
            committee → on-chain · bond {Number(BOND) / 1e9} SUI
          </span>
          <button onClick={summon} disabled={!canSubmit || pending} className="btn-justice">
            {phase === "judging" && "Convening committee…"}
            {phase === "creating" && "Opening case…"}
            {phase === "asserting" && "Asserting verdict…"}
            {(phase === "idle" || phase === "done") && "Summon the Tribunal"}
          </button>
        </div>
      </div>

      {error && (
        <div className="hud-panel mt-4 border-verdict-false/40 p-4 text-sm text-verdict-false">{error}</div>
      )}

      {verdict && (
        <div className="hud-panel mt-4 p-5 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-text-faint">Committee ruling</div>
          <div className={`my-1 font-display text-3xl font-900 ${verdict.outcomeTrue ? "text-verdict-true" : "text-verdict-false"}`}>
            {verdict.outcomeTrue ? "YES" : "NO"}
          </div>
          <div className="text-sm text-text-muted">
            {verdict.votesTrue}–{verdict.votesFalse}
            {verdict.votesTrue > 0 && verdict.votesFalse > 0 ? " · split decision" : " · unanimous"}
          </div>
        </div>
      )}

      {steps.length > 0 && (
        <div className="mt-4 space-y-2">
          {steps.map((s) => (
            <div key={s.label} className="hud-panel flex items-center justify-between p-3">
              <span className="font-mono text-xs text-text">✓ {s.label}</span>
              <span className="flex gap-2">
                {s.objectId && (
                  <a href={explorerObject(s.objectId)} target="_blank" rel="noreferrer" className="chip-mono hover:border-justice/60 hover:text-justice">
                    case {s.objectId.slice(0, 8)}… ↗
                  </a>
                )}
                {s.digest && (
                  <a href={explorerTx(s.digest)} target="_blank" rel="noreferrer" className="chip-mono hover:border-justice/60 hover:text-justice">
                    tx {s.digest.slice(0, 8)}… ↗
                  </a>
                )}
              </span>
            </div>
          ))}
          {phase === "done" && (
            <p className="pt-2 text-center text-sm text-text-muted">
              Case opened, judged, and asserted on Sui.{" "}
              <Link href="/" className="text-justice hover:underline">Back to the arena →</Link>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
