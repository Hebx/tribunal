import { notFound } from "next/navigation";
import Link from "next/link";
import { getMockBattle } from "@/lib/mock";
import { StatusBadge } from "@/components/StatusBadge";
import { AgentChip } from "@/components/AgentChip";
import { LiveTribunal } from "@/components/LiveTribunal";
import { explorerTx, explorerObject } from "@/lib/chain";

export default function BattlePage({ params }: { params: { id: string } }) {
  const battle = getMockBattle(params.id);
  if (!battle) notFound();

  return (
    <div className="animate-fade-up">
      <Link href="/" className="mb-5 inline-block font-mono text-xs text-text-muted hover:text-justice">
        ← back to arena
      </Link>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
            {battle.id.replace("battle-", "case · ")}
          </span>
          <h1 className="mt-1 max-w-2xl font-display text-2xl font-700 leading-tight text-text md:text-3xl">
            {battle.challenge}
          </h1>
        </div>
        <StatusBadge status={battle.status} />
      </div>

      {/* Combatants */}
      <div className="hud-panel mb-6 flex items-center justify-between gap-4 p-5">
        <AgentChip agent={battle.affirmer} />
        <div className="flex flex-col items-center">
          <span className="font-display text-base font-700 italic text-text-faint">vs</span>
          <span className="font-mono text-[10px] text-text-faint">{battle.bondSui} SUI bond</span>
        </div>
        <AgentChip agent={battle.denier} align="right" />
      </div>

      {/* Challenge + evidence */}
      <div className="hud-panel mb-6 p-5">
        <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-text-faint">
          Resolution criteria
        </div>
        <p className="mb-4 text-sm text-text-muted">{battle.criteria}</p>
        <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-text-faint">
          Evidence on record
        </div>
        <p className="text-sm leading-relaxed text-text">{battle.evidence}</p>
      </div>

      {/* On-chain / Walrus metadata */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {battle.configHashHex && (
          <span className="chip-mono" title="Locked committee config hash">
            cfg {battle.configHashHex.slice(0, 16)}…
          </span>
        )}
        {battle.caseId && (
          <a href={explorerObject(battle.caseId)} target="_blank" rel="noreferrer" className="chip-mono hover:border-justice/60 hover:text-justice">
            case {battle.caseId.slice(0, 10)}… ↗
          </a>
        )}
        {battle.evidenceQuiltId && (
          <span className="chip-mono" title="Walrus evidence quilt">
            walrus {battle.evidenceQuiltId.slice(0, 12)}…
          </span>
        )}
        {battle.citedPrecedent && (
          <span className="chip-mono border-gold/40 text-gold">⚖ cited precedent</span>
        )}
        {(battle.txDigests ?? []).map((t) => (
          <a key={t.digest} href={explorerTx(t.digest)} target="_blank" rel="noreferrer" className="chip-mono hover:border-justice/60 hover:text-justice">
            {t.label} {t.digest.slice(0, 8)}… ↗
          </a>
        ))}
      </div>

      {/* Live Tribunal */}
      <LiveTribunal battle={battle} />
    </div>
  );
}
