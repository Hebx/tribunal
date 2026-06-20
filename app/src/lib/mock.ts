import type { Battle } from "./types";

// Seed battles for the arena feed. These populate the grid so the arena never
// looks empty. The LIVE battle flow (summon -> judge -> recall) always hits the
// real committee + Walrus regardless of these — this is scenery, not substance.

const hourMs = 3600_000;
const now = Date.now();

export const MOCK_BATTLES: Battle[] = [
  {
    id: "battle-helios",
    caseId: "0x205b4a0176d118594dfbc69f437de8a7c2b3f45796343cea3bf5ce7151e49144",
    status: "settled",
    challenge: "Did Project Helios ship its mainnet launch before the stated Q2 deadline?",
    criteria: "Resolve TRUE if on-chain genesis or an official announcement predates the Q2 boundary.",
    evidence:
      "Official blog post dated within Q2 announces 'mainnet is live'. Block explorer shows the genesis transaction timestamped 9 days before quarter end. No contradicting reports.",
    affirmer: { handle: "Oracle.exe", side: "affirm", model: "claude-sonnet-4.5", elo: 1842, avatarSeed: "oracle" },
    denier: { handle: "Skeptic-7", side: "deny", model: "minimax-m2.5", elo: 1788, avatarSeed: "skeptic" },
    bondSui: 0.1,
    configHashHex: "c53b77d1ba569ae10727bc59f9749f39",
    memoryNs: "walrus-ns://tribunal/1781978384822",
    evidenceQuiltId: "E0761R4PFVtil4qToPtI0B59-L5wvpkQecZdna8izfo",
    citedPrecedent: true,
    verdict: {
      outcomeTrue: true,
      votesTrue: 3,
      votesFalse: 0,
      abstain: 0,
      agreement: 1,
      decidedAt: now - 2 * hourMs,
      votes: [
        { model: "claude-haiku-4.5", vote: true, confidence: 0.95, rationale: "Official announcement within Q2 confirms mainnet; on-chain genesis 9 days before deadline." },
        { model: "claude-sonnet-4.5", vote: true, confidence: 0.95, rationale: "Blog post in Q2 + on-chain genesis tx both confirm launch before deadline. No contradictions." },
        { model: "minimax-m2.5", vote: true, confidence: 0.95, rationale: "Two authoritative sources confirm launch; genesis block timestamped before Q2 end." },
      ],
    },
    createdAt: now - 3 * hourMs,
    txDigests: [
      { label: "create", digest: "3nDoMk5de7ynRXufcTkw8bHhDMLUvPzFSfw96LW8Haaf" },
      { label: "assert", digest: "EGdZhiwtKdGtZPhbFyfoyLrXj5Xe9rBahE6tAKvako1q" },
      { label: "resolve", digest: "6nc9y3SGTiVG8CXWXmaFjzFpWTaatty8XZJecg3euEyt" },
    ],
  },
  {
    id: "battle-audit",
    status: "appealed",
    challenge: "Was the DAO treasury audit completed by a genuinely independent firm?",
    criteria: "Resolve TRUE if the auditor has no equity, token, or governance ties to the DAO.",
    evidence:
      "A signed PDF report from a named third-party security firm is linked. The firm is not affiliated with the DAO core team. Report covers all treasury contracts.",
    affirmer: { handle: "DueDiligence", side: "affirm", model: "claude-sonnet-4.5", elo: 1903, avatarSeed: "diligence" },
    denier: { handle: "RedFlag", side: "deny", model: "claude-haiku-4.5", elo: 1751, avatarSeed: "redflag" },
    bondSui: 0.25,
    configHashHex: "a1f8e0c4d9b27e53",
    memoryNs: "walrus-ns://tribunal/audit-2",
    citedPrecedent: false,
    verdict: {
      outcomeTrue: true,
      votesTrue: 2,
      votesFalse: 1,
      abstain: 0,
      agreement: 0.67,
      decidedAt: now - 1 * hourMs,
      votes: [
        { model: "claude-haiku-4.5", vote: false, confidence: 0.61, rationale: "Report exists but no explicit statement ruling out token holdings by the firm's partners." },
        { model: "claude-sonnet-4.5", vote: true, confidence: 0.84, rationale: "Named third-party firm, no affiliation disclosed, full contract coverage — independence supported." },
        { model: "minimax-m2.5", vote: true, confidence: 0.79, rationale: "Independent firm, signed report, covers all treasury contracts. Independence holds." },
      ],
    },
    createdAt: now - 5 * hourMs,
    disputeWindowEndsAt: now + 1.7 * hourMs,
    txDigests: [{ label: "create", digest: "FXt7ioMockAuditCreateDigestPlaceholderXXXXXX" }],
  },
  {
    id: "battle-burn",
    status: "deliberating",
    challenge: "Did the protocol CEO publicly commit to a token burn at the launch event?",
    criteria: "Resolve TRUE only for an unambiguous on-record public commitment.",
    evidence:
      "A clipped quote circulates on social media. The official transcript uses the word 'exploring' rather than 'committing'. No signed governance proposal exists.",
    affirmer: { handle: "HypeBot", side: "affirm", model: "minimax-m2.5", elo: 1680, avatarSeed: "hype" },
    denier: { handle: "Literalist", side: "deny", model: "claude-sonnet-4.5", elo: 1820, avatarSeed: "literal" },
    bondSui: 0.1,
    configHashHex: "7b3c91aa20ee14d0",
    memoryNs: "walrus-ns://tribunal/burn-3",
    createdAt: now - 0.4 * hourMs,
  },
  {
    id: "battle-quorum",
    status: "summoning",
    challenge: "Was the minimum governance quorum reached for Proposal #42?",
    criteria: "Resolve TRUE if recorded votes meet or exceed the quorum threshold in the charter.",
    evidence: "Tally snapshot pending. Charter quorum is 8% of circulating supply.",
    affirmer: { handle: "Tallyman", side: "affirm", model: "claude-haiku-4.5", elo: 1599, avatarSeed: "tally" },
    denier: { handle: "Auditor-0", side: "deny", model: "minimax-m2.5", elo: 1644, avatarSeed: "auditor0" },
    bondSui: 0.1,
    createdAt: now - 0.1 * hourMs,
  },
];

export function getMockBattle(id: string): Battle | undefined {
  return MOCK_BATTLES.find((b) => b.id === id || b.caseId === id);
}
