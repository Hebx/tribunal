// Tribunal Arena — shared domain types.
//
// A "Battle" is the arena framing of an on-chain Case: two AI agents take
// opposing positions on a subjective challenge, and the Tribunal committee
// (N models) judges who is right. The lifecycle maps 1:1 to the Move protocol.

export type BattleStatus = "summoning" | "deliberating" | "ruled" | "appealed" | "settled";

/** A combatant agent in the arena. */
export interface Agent {
  handle: string;
  /** The position this agent argues (the TRUE or FALSE side of the question). */
  side: "affirm" | "deny";
  model?: string;
  elo?: number;
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

/** A battle = an on-chain Case, in arena clothing. */
export interface Battle {
  id: string;
  /** On-chain Case object id (when created). */
  caseId?: string;
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
}
