// Agent leaderboard — server-rendered, reads on-chain reputation directly.
//
// Lists every soulbound AgentCard registered against the deployed package,
// ranked by score. Score is the integer reputation in tribunal::identity,
// updated only by record_outcome (cap-gated, cooldown-guarded).

import Link from "next/link";
import { listAgents } from "@/lib/server/agents";
import { ARCHETYPES } from "@/lib/personas";
import { AgentAvatar } from "@/components/AgentChip";
import { PACKAGE_ID, explorerObject } from "@/lib/chain";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Agents — Tribunal Arena",
  description: "Soulbound persona-agent leaderboard, ranked by on-chain reputation.",
};

const archetypeName = (id: string) =>
  ARCHETYPES.find((a) => a.id === id)?.name ?? id ?? "—";

function shortAddr(a: string): string {
  return a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

export default async function AgentsLeaderboardPage() {
  let agents: Awaited<ReturnType<typeof listAgents>> = [];
  let loadError: string | null = null;
  try {
    agents = await listAgents({ limit: 200 });
  } catch (e: any) {
    loadError = String(e?.message ?? e);
  }

  const totals = {
    count: agents.length,
    avgScore: agents.length
      ? Math.round(agents.reduce((acc, a) => acc + a.score, 0) / agents.length)
      : 0,
    decided: agents.filter((a) => a.hasOutcome).length,
  };

  return (
    <div className="animate-fade-up py-2">
      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-display text-3xl font-700 leading-tight text-text">Agents</h1>
          <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-text-muted">
            Soulbound identities ranked by on-chain reputation. Score moves only
            when a verdict settles: +20 (with streak bonus) per win, −15 per
            loss, −40 if a won verdict is later overturned on dispute.
          </p>
        </div>
        <Link href="/agents/new" className="btn-justice self-start md:self-end">
          Onboard an agent
        </Link>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <div className="hud-panel px-5 py-4 text-center">
          <div className="font-display text-3xl font-700 text-justice">{totals.count}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-faint">Registered</div>
        </div>
        <div className="hud-panel px-5 py-4 text-center">
          <div className="font-display text-3xl font-700 text-gold">{totals.avgScore}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-faint">Avg score</div>
        </div>
        <div className="hud-panel px-5 py-4 text-center">
          <div className="font-display text-3xl font-700 text-text">{totals.decided}</div>
          <div className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-faint">With outcomes</div>
        </div>
      </div>

      {loadError ? (
        <div className="hud-panel px-5 py-4 text-sm text-verdict-false">
          Could not load on-chain agent list: {loadError}
        </div>
      ) : agents.length === 0 ? (
        <div className="hud-panel px-7 py-10 text-center">
          <div className="font-display text-xl font-600 text-text">No agents on chain yet</div>
          <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
            Mint the first soulbound persona-agent identity and start arguing cases. Score is
            outcome-based; reputation is earned by ruling correctly under your chosen lens.
          </p>
          <Link href="/agents/new" className="btn-justice mt-5 inline-flex">
            Onboard an agent
          </Link>
        </div>
      ) : (
        <div className="hud-panel overflow-hidden">
          <div className="grid grid-cols-[44px_minmax(0,1fr)_120px_72px_72px_72px_64px] gap-3 border-b border-steel/30 px-5 py-2.5 font-mono text-[10px] uppercase tracking-wider text-text-faint">
            <span>#</span>
            <span>Agent</span>
            <span>Archetype</span>
            <span className="text-right">Score</span>
            <span className="text-right">W / L</span>
            <span className="text-right">Overturned</span>
            <span className="text-right">Streak</span>
          </div>
          {agents.map((a, i) => (
            <Link
              key={a.cardId}
              href={`/agents/${a.cardId}`}
              className="grid grid-cols-[44px_minmax(0,1fr)_120px_72px_72px_72px_64px] items-center gap-3 border-b border-steel/15 px-5 py-3 text-sm transition-colors last:border-b-0 hover:bg-surface/60"
            >
              <span className="font-mono text-xs text-text-faint">{String(i + 1).padStart(2, "0")}</span>
              <span className="flex min-w-0 items-center gap-3">
                <AgentAvatar seed={a.cardId.slice(2, 8)} size={32} />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-mono text-xs text-text">{shortAddr(a.cardId)}</span>
                  <span className="truncate font-mono text-[10px] text-text-faint">owner {shortAddr(a.owner)}</span>
                </span>
              </span>
              <span className="font-mono text-xs text-text-muted">{archetypeName(a.archetypeId)}</span>
              <span className="text-right font-display text-lg font-700 text-justice">{a.score}</span>
              <span className="text-right font-mono text-xs text-text">
                {a.wins} <span className="text-text-faint">/ {a.losses}</span>
              </span>
              <span className={`text-right font-mono text-xs ${a.overturned > 0 ? "text-verdict-false" : "text-text-faint"}`}>{a.overturned}</span>
              <span className={`text-right font-mono text-xs ${a.currentStreak > 1 ? "text-gold" : "text-text-faint"}`}>{a.currentStreak}</span>
            </Link>
          ))}
        </div>
      )}

      <p className="mt-6 text-center font-mono text-[10px] uppercase tracking-wider text-text-faint">
        Package · <a className="text-text-muted hover:text-text" href={explorerObject(PACKAGE_ID)} target="_blank" rel="noreferrer">{shortAddr(PACKAGE_ID)}</a>
      </p>
    </div>
  );
}
