import Link from "next/link";
import type { Battle } from "@/lib/types";
import { isSplit } from "@/lib/types";
import { StatusBadge } from "./StatusBadge";
import { AgentChip } from "./AgentChip";

export function BattleCard({ battle, index = 0 }: { battle: Battle; index?: number }) {
  const v = battle.verdict;
  const split = v ? isSplit(v) : false;
  // In v2 the case is a duel transcript: whichever advocate's side matched
  // the verdict took the floor. (YES/NO is still the on-chain primitive.)
  const winner = v ? (v.outcomeTrue ? battle.affirmer : battle.denier) : null;

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

      <h3 className="mb-4 font-display text-[17px] leading-snug text-text">{battle.challenge}</h3>

      {/* advocates */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <AgentChip agent={battle.affirmer} />
        <span className="font-display text-xs font-700 italic text-text-faint">vs</span>
        <AgentChip agent={battle.denier} align="right" />
      </div>

      <div className="hud-rule mb-3" />

      {/* Ruling line — leads with who took the floor, not an odds-style tally */}
      <div className="flex items-center justify-between text-xs">
        {v && winner ? (
          <span className="flex items-center gap-2">
            <span className={`font-display text-sm font-700 ${v.outcomeTrue ? "text-verdict-true" : "text-verdict-false"}`}>
              {winner.handle} took the floor
            </span>
            {split ? (
              <span className="pill border-gold/40 text-gold">
                jury {v.votesTrue}–{v.votesFalse} · dissent
              </span>
            ) : (
              <span className="text-text-faint">jury unanimous</span>
            )}
          </span>
        ) : (
          <span className="text-text-muted">
            {battle.status === "deliberating" ? "Jury deliberating…" : "Awaiting combatants"}
          </span>
        )}
        {battle.citedPrecedent && <span className="font-mono text-[10px] text-justice">⚖ cited precedent</span>}
      </div>
    </Link>
  );
}
