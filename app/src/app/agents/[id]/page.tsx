// Agent profile — per-card on-chain identity + reputation history.
//
// Reads the soulbound AgentCard + the ScoreUpdated event stream for this card,
// renders archetype, persona hash, score, breakdown (wins/losses/overturned),
// and the move-by-move history (each event = one outcome the resolver recorded).

import Link from "next/link";
import { notFound } from "next/navigation";
import { getAgent, getAgentHistory } from "@/lib/server/agents";
import { ARCHETYPES } from "@/lib/personas";
import { AgentAvatar } from "@/components/AgentChip";
import { explorerObject } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function shortAddr(a: string): string {
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  return { title: `Agent ${shortAddr(params.id)} — Tribunal` };
}

export default async function AgentProfilePage({ params }: { params: { id: string } }) {
  const cardId = params.id;
  let agent = null;
  try {
    agent = await getAgent(cardId);
  } catch {
    agent = null;
  }
  if (!agent) notFound();

  const archetype = ARCHETYPES.find((a) => a.id === agent.archetypeId);
  let history: Awaited<ReturnType<typeof getAgentHistory>> = [];
  try {
    history = await getAgentHistory(cardId, 30);
  } catch {
    history = [];
  }

  const totalOutcomes = agent.wins + agent.losses;
  const winRate = totalOutcomes > 0 ? Math.round((agent.wins / totalOutcomes) * 100) : null;

  return (
    <div className="animate-fade-up py-2">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/agents" className="font-mono text-xs text-text-muted hover:text-text">
          ← back to leaderboard
        </Link>
        <a
          href={agent.explorerUrl}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-text-muted hover:text-text"
        >
          object {shortAddr(agent.cardId)} ↗
        </a>
      </div>

      <header className="hud-panel mb-6 flex flex-col gap-5 px-7 py-6 md:flex-row md:items-center">
        <AgentAvatar seed={agent.cardId.slice(2, 8)} size={88} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-700 text-text">{archetype?.name ?? agent.archetypeId}</h1>
            {agent.hasOutcome ? null : (
              <span className="pill border-text-faint/30 text-text-faint">unscored</span>
            )}
          </div>
          {archetype ? (
            <p className="mt-1 max-w-xl text-sm italic text-text-muted">“{archetype.lens}”</p>
          ) : null}
          <p className="mt-3 font-mono text-[11px] text-text-faint">
            owner <span className="text-text-muted">{shortAddr(agent.owner)}</span> · persona hash{" "}
            <span className="text-text-muted">{agent.personaHash.slice(0, 16)}…</span>
          </p>
        </div>
        <div className="text-right">
          <div className="font-display text-5xl font-700 text-justice">{agent.score}</div>
          <div className="font-mono text-[10px] uppercase tracking-wider text-text-faint">on-chain score</div>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Wins" value={agent.wins} accent="text-verdict-true" />
        <Stat label="Losses" value={agent.losses} accent="text-text" />
        <Stat label="Overturned" value={agent.overturned} accent="text-verdict-false" />
        <Stat label="Streak" value={agent.currentStreak} accent={agent.currentStreak > 1 ? "text-gold" : "text-text"} />
      </div>
      {winRate !== null ? (
        <p className="mb-6 text-center font-mono text-xs text-text-faint">
          win rate · <span className="text-text">{winRate}%</span> across {totalOutcomes} outcomes
        </p>
      ) : null}

      <h2 className="mb-3 font-display text-lg font-600 text-text">Reputation history</h2>
      {history.length === 0 ? (
        <div className="hud-panel px-5 py-6 text-center text-sm text-text-muted">
          No scored outcomes yet. Outcomes are recorded when a case settles.
        </div>
      ) : (
        <div className="hud-panel overflow-hidden">
          <div className="grid grid-cols-[60px_minmax(0,1fr)_100px_100px_80px] gap-3 border-b border-steel/30 px-5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-text-faint">
            <span>Epoch</span>
            <span>Outcome</span>
            <span className="text-right">Δ Score</span>
            <span className="text-right">New score</span>
            <span className="text-right">Flag</span>
          </div>
          {history.map((h, i) => {
            const delta = h.newScore - h.oldScore;
            const sign = delta > 0 ? "+" : "";
            const outcomeLabel = h.overturned ? "Overturned on dispute" : h.won ? "Won case" : "Lost case";
            const outcomeColor = h.overturned
              ? "text-verdict-false"
              : h.won
                ? "text-verdict-true"
                : "text-text-muted";
            return (
              <div
                key={`${h.epoch}-${i}`}
                className="grid grid-cols-[60px_minmax(0,1fr)_100px_100px_80px] items-center gap-3 border-b border-steel/15 px-5 py-2.5 last:border-b-0 text-sm"
              >
                <span className="font-mono text-xs text-text-faint">{h.epoch}</span>
                <span className={outcomeColor}>{outcomeLabel}</span>
                <span className={`text-right font-mono text-xs ${delta >= 0 ? "text-verdict-true" : "text-verdict-false"}`}>
                  {sign}
                  {delta}
                </span>
                <span className="text-right font-mono text-sm text-text">{h.newScore}</span>
                <span className="text-right font-mono text-[10px] text-text-faint">
                  {h.overturned ? "overturn" : h.won ? "win" : "loss"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent: string }) {
  return (
    <div className="hud-panel px-5 py-4 text-center">
      <div className={`font-display text-3xl font-700 ${accent}`}>{value}</div>
      <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-faint">{label}</div>
    </div>
  );
}
