import type { Battle } from "./types";

// Seed battles for the arena feed. These are genuinely SUBJECTIVE judgment calls
// — a reasonable tribunal could rule either way, and the losing side has real
// grounds to appeal. No block-explorer fact-lookups. The hero case splits 2–1
// with a recorded dissent, because disagreement is the product: it's why a
// committee beats a single model or a single oracle.
//
// The LIVE flow (summon → judge → recall) always hits the real committee +
// Walrus regardless of this scenery.

const hourMs = 3600_000;
const now = Date.now();

export const MOCK_BATTLES: Battle[] = [
  // ---- HERO: a split panel (2–1) with a real dissent ----
  {
    id: "battle-milestone",
    caseId: "0x205b4a0176d118594dfbc69f437de8a7c2b3f45796343cea3bf5ce7151e49144",
    status: "settled",
    challenge:
      "Did the grantee meet Milestone 2 of the DAO build grant, given the deliverable shipped at ~80% of the written spec?",
    criteria:
      "Rule TRUE if the delivered work satisfies the milestone's INTENT and core acceptance criteria, even if minor spec items are incomplete. Rule FALSE if missing items are material to the milestone's purpose.",
    evidence:
      "The spec listed 5 acceptance criteria. The grantee shipped 4 fully and 1 partially (an admin dashboard, delivered read-only without the promised export + role management). The grant agreement defines Milestone 2 as 'a usable moderation console for stewards.' Stewards confirm the console is in daily use. The export feature was later flagged by one steward as 'needed for reporting, not for moderating.' No deadline was missed.",
    affirmer: {
      handle: "Advocate-Y",
      side: "affirm",
      model: "claude-sonnet-4.5",
      argument: "Core intent — a usable moderation console — is met and in daily use; the missing export is reporting, not moderation.",
      avatarSeed: "advocatey",
    },
    denier: {
      handle: "Advocate-N",
      side: "deny",
      model: "minimax-m2.5",
      argument: "An explicit acceptance criterion (export + role management) was only partially delivered; partial completion is not completion.",
      avatarSeed: "advocaten",
    },
    bondSui: 0.25,
    configHashHex: "c53b77d1ba569ae10727bc59f9749f39",
    memoryNs: "walrus-ns://tribunal/1781978384822",
    evidenceQuiltId: "E0761R4PFVtil4qToPtI0B59-L5wvpkQecZdna8izfo",
    citedPrecedent: false,
    verdict: {
      outcomeTrue: true,
      votesTrue: 2,
      votesFalse: 1,
      abstain: 0,
      agreement: 0.67,
      decidedAt: now - 2 * hourMs,
      votes: [
        { model: "claude-sonnet-4.5", vote: true, confidence: 0.78, rationale: "Milestone defined by intent ('usable moderation console'), which is met and in active use. Missing export serves reporting, not the stated moderation purpose." },
        { model: "claude-haiku-4.5", vote: true, confidence: 0.66, rationale: "4 of 5 criteria fully met; the partial item is non-core to the milestone's purpose. Substantial performance satisfies the grant's intent." },
        { model: "minimax-m2.5", vote: false, confidence: 0.71, rationale: "Role management is a named acceptance criterion, not a nice-to-have. Shipping read-only omits access control — material to a moderation tool. Partial ≠ met." },
      ],
    },
    createdAt: now - 3 * hourMs,
    txDigests: [
      { label: "create", digest: "3nDoMk5de7ynRXufcTkw8bHhDMLUvPzFSfw96LW8Haaf" },
      { label: "assert", digest: "EGdZhiwtKdGtZPhbFyfoyLrXj5Xe9rBahE6tAKvako1q" },
      { label: "resolve", digest: "6nc9y3SGTiVG8CXWXmaFjzFpWTaatty8XZJecg3euEyt" },
    ],
  },

  // ---- Under appeal: a disclosure-adequacy judgment ----
  {
    id: "battle-disclosure",
    status: "appealed",
    challenge:
      "Was the protocol team's risk disclosure 'adequate and good-faith' before the token sale, given a known oracle dependency was mentioned only in a linked audit appendix?",
    criteria:
      "Rule TRUE if a reasonably diligent buyer could have discovered the material risk through the disclosed materials. Rule FALSE if the placement was designed to obscure a material risk.",
    evidence:
      "The sale page listed 'smart-contract risk' generically. The specific single-oracle dependency (a known single point of failure) appeared only on page 47 of a linked third-party audit PDF, not in the sale page's risk section. The team argues the audit was prominently linked. A buyer group argues burying a material risk in an appendix is not good-faith disclosure. Industry norm on this is contested.",
    affirmer: {
      handle: "Counsel-Pro",
      side: "affirm",
      model: "claude-sonnet-4.5",
      argument: "The audit was linked and public; a diligent buyer reads the audit. Disclosure existed and was discoverable.",
      avatarSeed: "counselpro",
    },
    denier: {
      handle: "Counsel-Con",
      side: "deny",
      model: "claude-haiku-4.5",
      argument: "A material single-point-of-failure belongs in the risk section, not appendix page 47. Discoverable ≠ disclosed in good faith.",
      avatarSeed: "counselcon",
    },
    bondSui: 0.5,
    configHashHex: "a1f8e0c4d9b27e53",
    memoryNs: "walrus-ns://tribunal/disclosure-2",
    citedPrecedent: false,
    verdict: {
      outcomeTrue: false,
      votesTrue: 1,
      votesFalse: 2,
      abstain: 0,
      agreement: 0.67,
      decidedAt: now - 1 * hourMs,
      votes: [
        { model: "claude-haiku-4.5", vote: false, confidence: 0.74, rationale: "Materiality drives placement. A known single point of failure surfaced only in an appendix fails the good-faith standard regardless of technical availability." },
        { model: "minimax-m2.5", vote: false, confidence: 0.69, rationale: "The risk section omitted the specific dependency. Reasonable buyers rely on the risk section; burying it elsewhere is not adequate disclosure." },
        { model: "claude-sonnet-4.5", vote: true, confidence: 0.58, rationale: "The audit was prominently linked and public. A diligent buyer is expected to read a linked audit; the risk was discoverable, so disclosure was met." },
      ],
    },
    createdAt: now - 5 * hourMs,
    disputeWindowEndsAt: now + 1.7 * hourMs,
    txDigests: [{ label: "create", digest: "FXt7ioDisclosureCreateDigestPlaceholderXXXX" }],
  },

  // ---- Deliberating: governance interpretation ----
  {
    id: "battle-governance",
    status: "deliberating",
    challenge:
      "Does Proposal #42 fall within the treasury committee's delegated authority, or does it require a full-DAO vote under the charter?",
    criteria:
      "Rule TRUE (committee authority) if the spend matches the charter's delegated categories and limits. Rule FALSE (needs full vote) if it constitutes a new strategic commitment beyond routine operations.",
    evidence:
      "The charter delegates 'routine operational spending up to 50k/quarter' to the committee. Proposal #42 is a 45k one-time payment to a market-maker for a 6-month liquidity arrangement. Under the cap numerically, but it's a new strategic relationship, not recurring opex. The charter does not define 'routine.' Precedent within the DAO is mixed.",
    affirmer: {
      handle: "Charter-Lit",
      side: "affirm",
      model: "minimax-m2.5",
      argument: "45k is under the 50k delegated cap. The text controls; the committee is authorized.",
      avatarSeed: "charterlit",
    },
    denier: {
      handle: "Intent-First",
      side: "deny",
      model: "claude-sonnet-4.5",
      argument: "A 6-month strategic MM arrangement is not 'routine operational spending'; it's a new commitment that needs the full DAO.",
      avatarSeed: "intentfirst",
    },
    bondSui: 0.25,
    configHashHex: "7b3c91aa20ee14d0",
    memoryNs: "walrus-ns://tribunal/governance-3",
    createdAt: now - 0.4 * hourMs,
  },

  // ---- Summoning: content-policy edge case ----
  {
    id: "battle-moderation",
    status: "summoning",
    challenge:
      "Should the flagged post be removed under the 'no targeted harassment' rule, given it criticizes a public figure's professional conduct in harsh but non-personal terms?",
    criteria:
      "Rule TRUE (remove) if the post targets the individual rather than their public conduct. Rule FALSE (keep) if it is sharp criticism of public actions, which the policy protects.",
    evidence:
      "The post calls a named protocol founder's launch decision 'reckless and self-serving' and demands accountability. It does not reference the person's private life, make threats, or use slurs. The reporting user says it 'feels like a pile-on.' The policy protects 'robust criticism of public conduct' but bans 'targeting individuals.' The line between the two is the question.",
    affirmer: {
      handle: "Safety-Adv",
      side: "affirm",
      model: "claude-haiku-4.5",
      argument: "'Self-serving' attributes bad-faith motive to the person; combined with a pile-on, it crosses into targeting.",
      avatarSeed: "safetyadv",
    },
    denier: {
      handle: "Speech-Adv",
      side: "deny",
      model: "claude-sonnet-4.5",
      argument: "Harsh criticism of a public launch decision is protected conduct-criticism; no threats, no private info, no slurs.",
      avatarSeed: "speechadv",
    },
    bondSui: 0.1,
    createdAt: now - 0.1 * hourMs,
  },
];

export function getMockBattle(id: string): Battle | undefined {
  return MOCK_BATTLES.find((b) => b.id === id || b.caseId === id);
}
