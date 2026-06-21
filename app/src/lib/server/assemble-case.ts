// Assemble the resolver inputs for a case from on-chain matchup state.
//
// Inputs:
//   - matchup: the two advocates picked by pickAdvocates() (chain-derived)
//   - jury:    the 3-juror panel picked by selectJury() (chain-derived)
//   - caseInput: the question/criteria/evidence text the resolver judges
//
// Outputs:
//   - agents: ResolveAgents (AdvocatePersona × 2 + JurorPersona × 3) suitable
//     for resolveCase(). System prompts are composed from each agent's
//     archetype_id via composePersona(), so the resolver never receives
//     untrusted text — only injection-scanned archetype prompts.
//   - personaHashes: per-agent persona hash, recorded into provenance.
//
// This is the seam that replaces LiveTribunalV2's DEFAULT_AGENTS: the
// resolver no longer takes hand-rolled system prompts off the wire. The
// matchup AgentCards control the prompts, and the AgentCards came from
// the on-chain registry.

import { composePersona } from "./persona";
import type { PoolAgent, Matchup } from "./matchmaking";
import type { JuryPick } from "./select-jury";
import type { ResolveAgents } from "./resolve";

export interface AssembledAgent {
  agentId: string;
  handle: string;
  archetypeId: string;
  personaHash: string;
  systemPrompt: string;
}

export interface AssembledCase {
  agents: ResolveAgents;
  /** Per-slot persona metadata for provenance. */
  affirmer: AssembledAgent;
  denier: AssembledAgent;
  jurors: AssembledAgent[];
}

/** Thrown when an AgentCard lacks an archetype_id — onboarding-time bug. */
export class MissingArchetypeError extends Error {
  constructor(public agent: PoolAgent, public role: "affirmer" | "denier" | "juror") {
    super(
      `AgentCard ${agent.agentId.slice(0, 10)}… (${agent.handle}) has no archetype_id; ` +
        `cannot compose ${role} persona. Re-onboard the card with a valid archetype.`,
    );
    this.name = "MissingArchetypeError";
  }
}

/** Compose one persona from a PoolAgent. Refuses if archetype is missing or
 *  composePersona rejects the archetype id. */
function composeForAgent(
  agent: PoolAgent,
  role: "affirmer" | "denier" | "juror",
): AssembledAgent {
  if (!agent.archetypeId) {
    throw new MissingArchetypeError(agent, role);
  }
  const r = composePersona(agent.archetypeId, "");
  if (!r.ok) {
    throw new Error(
      `composePersona failed for ${role} ${agent.handle} ` +
        `(archetype=${agent.archetypeId}): ${r.reason}`,
    );
  }
  return {
    agentId: agent.agentId,
    handle: agent.handle,
    archetypeId: agent.archetypeId,
    personaHash: r.personaHash,
    systemPrompt: r.systemPrompt,
  };
}

/**
 * Build the resolver agent bundle from chain-derived matchup + jury picks.
 *
 * Pure (no IO). All agents must carry an archetype_id; missing archetypes
 * throw MissingArchetypeError rather than silently substituting a default —
 * a missing archetype is an onboarding bug we want surfaced.
 */
export function assembleCaseAgents(matchup: Matchup, jury: JuryPick): AssembledCase {
  const affirmer = composeForAgent(matchup.affirmer, "affirmer");
  const denier = composeForAgent(matchup.denier, "denier");
  const jurors = jury.jurors.map((j) => composeForAgent(j, "juror"));

  const agents: ResolveAgents = {
    affirmer: { handle: affirmer.handle, systemPrompt: affirmer.systemPrompt },
    denier: { handle: denier.handle, systemPrompt: denier.systemPrompt },
    jurors: jurors.map((j) => ({ handle: j.handle, systemPrompt: j.systemPrompt })),
  };

  return { agents, affirmer, denier, jurors };
}
