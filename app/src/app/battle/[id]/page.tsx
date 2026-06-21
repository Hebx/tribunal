import { notFound } from "next/navigation";
import Link from "next/link";
import { getMockBattle } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import { AgentAvatar } from "@/components/AgentChip";
import { LiveTribunal } from "@/components/LiveTribunal";
import { LiveTribunalV2 } from "@/components/LiveTribunalV2";
import { OnChainPanel } from "@/components/OnChainPanel";
import { DisputeButton } from "@/components/DisputeButton";
import { StakeInPanel } from "@/components/StakeInPanel";
import { explorerTx, explorerObject } from "@/lib/chain";
import type { Agent } from "@/lib/types";

function AdvocateColumn({ agent, align }: { agent: Agent; align: "left" | "right" }) {
  const yes = agent.side === "affirm";
  return (
    <div
      className={`hud-panel flex-1 p-5 ${align === "right" ? "text-right" : ""}`}
      style={{ borderColor: yes ? "rgba(52,211,153,0.3)" : "rgba(244,63,94,0.3)" }}
    >
      <div className={`mb-3 flex items-center gap-2.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
        <AgentAvatar seed={agent.avatarSeed} size={42} />
        <div className={`flex flex-col ${align === "right" ? "items-end" : ""}`}>
          <span className="text-[15px] font-600 text-text">{agent.handle}</span>
          <span className={`font-mono text-[10px] uppercase tracking-wider ${yes ? "text-verdict-true" : "text-verdict-false"}`}>
            argues {yes ? "yes" : "no"}
          </span>
        </div>
      </div>
      <p className="text-[13px] leading-relaxed text-text-muted">{agent.argument}</p>
      {agent.model && (
        <div className="mt-3 font-mono text-[10px] text-text-faint">advocate model · {agent.model}</div>
      )}
    </div>
  );
}

export default function BattlePage({ params }: { params: { id: string } }) {
  const battle = getMockBattle(params.id);
  if (!battle) notFound();

  return (
    <div className="animate-fade-up">
      <Link href="/" className="mb-5 inline-block font-mono text-xs text-text-muted hover:text-justice">
        ← back to arena
      </Link>

      {/* The question on trial */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between gap-4">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
            {battle.id.replace("battle-", "case · ")}
          </span>
          <StatusBadge status={battle.status} />
        </div>
        <h1 className="max-w-3xl font-display text-2xl font-700 leading-tight text-text md:text-[28px]">
          {battle.challenge}
        </h1>
      </div>

      {/* Resolution standard */}
      <div className="hud-panel mb-6 p-5">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-text-faint">
          The standard the bench must apply
        </div>
        <p className="text-sm leading-relaxed text-text">{battle.criteria}</p>
      </div>

      {/* Advocates — the PvP */}
      <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-text-faint">
        The advocates
      </div>
      <div className="mb-6 flex flex-col items-stretch gap-3 md:flex-row">
        <AdvocateColumn agent={battle.affirmer} align="left" />
        <div className="flex items-center justify-center">
          <span className="font-display text-sm font-700 italic text-text-faint">vs</span>
        </div>
        <AdvocateColumn agent={battle.denier} align="right" />
      </div>

      {/* Evidence on record */}
      <div className="hud-panel mb-6 p-5">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-text-faint">
          Evidence on record
        </div>
        <p className="text-sm leading-relaxed text-text">{battle.evidence}</p>
      </div>

      {/* On-chain / Walrus chips */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {battle.caseId && (
          <a href={explorerObject(battle.caseId)} target="_blank" rel="noreferrer" className="chip-mono hover:border-justice/60 hover:text-justice">
            case {battle.caseId.slice(0, 10)}… ↗
          </a>
        )}
        {battle.evidenceQuiltId && (
          <span className="chip-mono" title="Walrus evidence quilt (committee reasoning)">
            walrus {battle.evidenceQuiltId.slice(0, 12)}…
          </span>
        )}
        {battle.citedPrecedent && <span className="chip-mono border-justice/40 text-justice">⚖ cited precedent</span>}
        {(battle.txDigests ?? []).map((t) => (
          <a key={t.digest} href={explorerTx(t.digest)} target="_blank" rel="noreferrer" className="chip-mono hover:border-justice/60 hover:text-justice">
            {t.label} {t.digest.slice(0, 8)}… ↗
          </a>
        ))}
      </div>

      {/* Honest on-chain / off-chain disclosure */}
      <div className="mb-6">
        <OnChainPanel battle={battle} />
      </div>

      {/* Stake-in: wallet-signed opt-in PvP (v2 M5.3) */}
      {battle.caseId && (
        <div className="mb-6">
          <StakeInPanel caseId={battle.caseId} />
        </div>
      )}

      {/* Permissionless bonded dispute (real on-chain cases, not yet settled) */}
      <div className="mb-8">
        <DisputeButton battle={battle} />
      </div>

      {/* The bench — v2 persona-debate pipeline (debate → jury → guardrail) */}
      <div className="mb-10">
        <LiveTribunalV2 battle={battle} />
      </div>

      {/* Legacy single-pass committee (kept for the M3c precedent recall demo) */}
      <details className="mb-8">
        <summary className="cursor-pointer font-mono text-[11px] uppercase tracking-wider text-text-faint hover:text-text-muted">
          Legacy committee (single-pass, with precedent recall)
        </summary>
        <div className="mt-3">
          <LiveTribunal battle={battle} />
        </div>
      </details>
    </div>
  );
}
