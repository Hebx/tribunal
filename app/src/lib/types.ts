// Tribunal Arena — shared domain types.
//
// A "Battle" is the arena framing of an on-chain Case: two AI agents take
// opposing positions on a subjective challenge, and the Tribunal committee
// (N models) judges who is right. The lifecycle maps 1:1 to the Move protocol.

export type BattleStatus = "summoning" | "deliberating" | "ruled" | "appealed" | "settled";

/** A combatant agent in the arena — an advocate arguing one side. */
export interface Agent {
  handle: string;
  /** The position this agent argues. */
  side: "affirm" | "deny";
  model?: string;
  /** One-line summary of the argument this advocate makes. */
  argument?: string;
  avatarSeed: string;
}

/** One judge's (committee model's) vote on the challenge. */
export interface JudgeVote {
  model: string;
  vote: boolean | null; // null = abstain
  confidence: number; // 0..1
  rationale: string;
  error?: string;
}

/** Aggregate Tribunal verdict. */
export interface Verdict {
  outcomeTrue: boolean;
  votesTrue: number;
  votesFalse: number;
  abstain: number;
  agreement: number; // 0..1
  votes: JudgeVote[];
  configPreimage?: string;
  decidedAt: number;
}

/** True when the panel did not rule unanimously (a dissent was recorded). */
export function isSplit(v: Verdict): boolean {
  return v.votesTrue > 0 && v.votesFalse > 0;
}

/** The dissenting judge(s) — those who voted against the majority outcome. */
export function dissenters(v: Verdict): JudgeVote[] {
  return v.votes.filter((j) => j.vote !== null && j.vote !== v.outcomeTrue);
}

/** A battle = an on-chain Case, in arena clothing. */
export interface Battle {
  id: string;
  /** On-chain Case object id (when created). */
  caseId?: string;
  /** On-chain StakePool object id, if a pool has been created for this case. */
  stakePoolId?: string;
  status: BattleStatus;
  challenge: string; // the subjective yes/no question
  criteria: string; // resolution criteria
  evidence: string;
  affirmer: Agent; // argues TRUE
  denier: Agent; // argues FALSE
  bondSui: number;
  configHashHex?: string;
  memoryNs?: string;
  /** Walrus quilt id holding the panel + verdict evidence bundle. */
  evidenceQuiltId?: string;
  verdict?: Verdict;
  /** Whether this verdict cited prior case law (precedent). */
  citedPrecedent?: boolean;
  createdAt: number;
  disputeWindowEndsAt?: number;
  txDigests?: { label: string; digest: string }[];
}

/** A case-law entry recalled from Walrus memory. */
export interface CaseLawHit {
  score: number;
  kind: string;
  text: string;
  quiltId: string;
  /** On-chain case object id this hit was decided on (if the quilt carries an anchor). */
  caseId?: string;
}
