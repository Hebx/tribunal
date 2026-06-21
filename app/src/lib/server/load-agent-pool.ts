// Global AgentCard pool — the set of registered persona agents the resolver
// can draw a jury from. Adapter over listAgents() in ./agents.ts, normalised
// to the PoolAgent shape pickAdvocates() + selectJury() consume.
//
// Deleted/mis-versioned cards are silently dropped by listAgents(), so they
// won't appear here either — which is the correct behaviour: a retired card
// must not be conscripted into jury duty.

import { listAgents, type AgentRow } from "./agents";
import type { PoolAgent } from "./matchmaking";

export function agentRowToPoolAgent(row: AgentRow): PoolAgent {
  return {
    agentId: row.cardId,
    handle: handleForRow(row),
    score: row.score,
    archetypeId: row.archetypeId,
  };
}

/** Public-facing handle. AgentCard has no display name on chain; we derive
 *  one from archetype + a short id suffix so the UI surfaces something stable. */
function handleForRow(row: AgentRow): string {
  const arch = row.archetypeId || "agent";
  const tag = row.cardId.slice(2, 8);
  return `${capitalize(arch)} ${tag}`;
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Load the full registered AgentCard pool. `limit` caps the leaderboard walk
 *  for very large registries (default matches listAgents). */
export async function loadAgentPool(opts: { limit?: number } = {}): Promise<PoolAgent[]> {
  const rows = await listAgents({ limit: opts.limit ?? 200 });
  return rows.map(agentRowToPoolAgent);
}
