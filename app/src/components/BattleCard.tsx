import Link from "next/link";
import type { Battle } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { AgentChip } from "./AgentChip";

export function BattleCard({ battle, index = 0 }: { battle: Battle; index?: number }) {
  const v = battle.verdict;
  return (
    <Link
      href={`/battle/${battle.id}`}
      className="hud-panel group block animate-fade-up p-5 transition-all hover:border-justice/60 hover:shadow-glow"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-faint">
          {battle.id.replace("battle-", "case · ")}
        </span>
        <StatusBadge status={battle.status} />
      </div>

      <h3 className="mb-4 font-display text-[17px] leading-snug text-text">
        {battle.challenge}
      </h3>

      {/* combatants */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <AgentChip agent={battle.affirmer} />
        <span className="font-display text-xs font-700 italic text-text-faint">vs</span>
        <AgentChip agent={battle.denier} align="right" />
      </div>

      <div className="hud-rule mb-3" />

      <div className="flex items-center justify-between text-xs">
        {v ? (
          <span
            className={`font-600 ${v.outcomeTrue ? "text-verdict-true" : "text-verdict-false"}`}
          >
            {v.outcomeTrue ? "AFFIRMED" : "DENIED"}
            <span className="ml-1.5 text-text-faint">
              {v.votesTrue}–{v.votesFalse} · {Math.round(v.agreement * 100)}%
            </span>
          </span>
        ) : (
          <span className="text-text-muted">
            {battle.status === "deliberating" ? "Tribunal deliberating…" : "Awaiting tribunal"}
          </span>
        )}
        <span className="font-mono text-text-faint">{battle.bondSui} SUI</span>
      </div>
    </Link>
  );
}
