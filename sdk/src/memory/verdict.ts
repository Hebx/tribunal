// Persist a v2 VerdictBundle to Walrus as typed entries (M4.3).
//
// One Quilt per case, with typed patches per the design doc:
//   - debate_transcript  (sealed until settle)
//   - jury_deliberation  (sealed until settle)
//   - guardrail_decision (public; the binding ruling + bias flags)
//   - verdict            (public; compact YES/NO + config-hash digest)
//   - case_law           (public; short precedent summary that future panels recall)
//
// Returns the quiltId + the IndexRows for each entry. The same TribunalMemory
// instance can later `recall("…", { kind: "case_law" })` to surface precedents.
//
// SHAPE-COMPATIBLE with the app's `VerdictBundle` (app/src/lib/server/resolve.ts).
// We define a structural interface locally to avoid a cross-package import.

import { TribunalMemory, type IndexRow, type EntryKind } from "./index.js";

// --- structural mirror of app's VerdictBundle (kept loose so we don't couple) ---
interface DebateArgument {
  side: "yes" | "no";
  claim: string;
  reasoning: string;
  rebuttal?: string;
}
interface DebateRound {
  round: number;
  arguments: DebateArgument[];
}
interface DebateLike {
  rounds: DebateRound[];
}
interface JurorVote {
  handle: string;
  vote: boolean | null; // null = abstain
  confidence: number;
  rationale: string;
  revised?: boolean;
}
interface JuryLike {
  firstPass: JurorVote[];
  finalVotes: JurorVote[];
  outcome: boolean;
  votesTrue: number;
  votesFalse: number;
  abstain: number;
  dissent: number;
  disagreementRate: number;
}
interface GuardrailLike {
  finalOutcome: boolean;
  ratifiedJury: boolean;
  overrideReason: string;
  biasFlags: string[];
  confidence: number;
  reasoning: string;
  /** v3 additions — present on bundles built post-M3a; optional for backcompat. */
  personaTrapsRejected?: string[];
  configHash?: string;
}
interface CaseLike {
  question: string;
  criteria: string;
  evidence: string;
}
/**
 * v3 provenance — full audit row capturing exactly who argued, who voted, on
 * which model, with which prompt version. Carried as a typed entry so any
 * reader can reproduce the verdict from on-chain ids alone.
 *
 * Kept loose (Record-shape) here to avoid coupling the SDK to the app's
 * type — the app emits the strict ProvenanceShape and the SDK just round-trips
 * the bytes.
 */
type ProvenanceLike = Record<string, unknown>;
export interface VerdictBundleLike {
  case: CaseLike;
  debate: DebateLike;
  jury: JuryLike;
  guardrail: GuardrailLike;
  finalOutcome: boolean;
  models: { advocate: string; jury: string; guardrail: string };
  configHashHex: string;
  decidedAt: number;
  /** v3 — sha256 of the locked guardrail prompt at decision time. */
  guardrailConfigHash?: string;
  /** v3 — audit row. When present, persisted as a 6th typed entry. */
  provenance?: ProvenanceLike;
}

export interface PersistedBundle {
  quiltId: string;
  rows: IndexRow[];
  /** Map from kind → patch identifier for quick lookup by clients. */
  patches: Record<string, string>;
}

function entryId(kind: string, caseId: string): string {
  // Quilt patch identifiers must start alphanumeric. Strip non [A-Za-z0-9_-].
  const c = caseId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32) || "case";
  return `${kind}__${c}`;
}

function summariseDebate(d: DebateLike): string {
  // Compact textual summary used for the entry's embeddable text. Recall
  // searches over this preview; the structured data lives in `data`.
  const lines: string[] = [];
  for (const r of d.rounds) {
    for (const a of r.arguments) {
      lines.push(`R${r.round}/${a.side.toUpperCase()}: ${a.claim}`);
    }
  }
  return lines.join("\n");
}

function summariseJury(j: JuryLike): string {
  const ratio = `${j.votesTrue}-${j.votesFalse}` + (j.abstain ? `-${j.abstain}` : "");
  return (
    `Jury outcome ${j.outcome ? "YES" : "NO"} (${ratio})` +
    `, dissent=${j.dissent}, disagreementRate=${j.disagreementRate.toFixed(2)}\n` +
    j.finalVotes.map((v) => `${v.handle}: ${v.vote === null ? "ABSTAIN" : v.vote ? "YES" : "NO"} — ${v.rationale}`).join("\n")
  );
}

function compactCaseLaw(b: VerdictBundleLike): string {
  // The "precedent" entry: short, surfaceable, citation-shaped. Public.
  return (
    `Question: ${b.case.question}\n` +
    `Criteria: ${b.case.criteria}\n` +
    `Verdict: ${b.finalOutcome ? "YES" : "NO"} ` +
    `(jury ${b.jury.votesTrue}-${b.jury.votesFalse}, ` +
    `guardrail ${b.guardrail.ratifiedJury ? "ratified" : "overrode"})\n` +
    `Key reasoning: ${b.guardrail.reasoning}`
  );
}

/**
 * Persist a VerdictBundle to Walrus as one Quilt with five typed entries.
 * Confidentiality follows the EntryKind policy (debate + deliberation sealed
 * until settle; guardrail + verdict + case_law public).
 *
 * `caseId` is used only to namespace the entry ids (so the Quilt is
 * self-describing on re-read). The actual on-chain memory_ns is the
 * TribunalMemory's namespace, fixed at construction.
 */
export async function persistVerdictBundle(
  memory: TribunalMemory,
  caseId: string,
  bundle: VerdictBundleLike,
): Promise<PersistedBundle> {
  const ids = {
    debate: entryId("debate", caseId),
    jury: entryId("jury", caseId),
    guardrail: entryId("guardrail", caseId),
    verdict: entryId("verdict", caseId),
    case_law: entryId("caselaw", caseId),
    ...(bundle.provenance ? { provenance: entryId("provenance", caseId) } : {}),
  };

  const baseEntries: Array<{
    id: string;
    kind: EntryKind;
    text: string;
    data: Record<string, unknown>;
  }> = [
    {
      id: ids.debate,
      kind: "debate_transcript" as const,
      text: summariseDebate(bundle.debate),
      data: {
        rounds: bundle.debate.rounds,
        models: bundle.models,
      },
    },
    {
      id: ids.jury,
      kind: "jury_deliberation" as const,
      text: summariseJury(bundle.jury),
      data: { jury: bundle.jury, model: bundle.models.jury },
    },
    {
      id: ids.guardrail,
      kind: "guardrail_decision" as const,
      text:
        `Guardrail (${bundle.models.guardrail}): ` +
        `${bundle.guardrail.ratifiedJury ? "ratified" : "OVERRODE"} jury, ` +
        `final=${bundle.guardrail.finalOutcome ? "YES" : "NO"}. ` +
        `Bias flags: ${bundle.guardrail.biasFlags.join(", ") || "(none)"}. ` +
        `${bundle.guardrail.reasoning}` +
        (bundle.guardrail.overrideReason
          ? `\nOverride reason: ${bundle.guardrail.overrideReason}`
          : ""),
      data: {
        guardrail: bundle.guardrail,
        model: bundle.models.guardrail,
        // v3: pin the prompt version on the public guardrail entry.
        ...(bundle.guardrailConfigHash
          ? { guardrailConfigHash: bundle.guardrailConfigHash }
          : {}),
      },
    },
    {
      id: ids.verdict,
      kind: "verdict" as const,
      text:
        `${bundle.finalOutcome ? "YES" : "NO"} — ${bundle.case.question}\n` +
        `config: ${bundle.configHashHex}`,
      data: {
        finalOutcome: bundle.finalOutcome,
        configHashHex: bundle.configHashHex,
        // v3: pin both hashes (resolver model map + guardrail prompt) on the
        // public verdict entry so anchoring on-chain stays tamper-evident.
        ...(bundle.guardrailConfigHash
          ? { guardrailConfigHash: bundle.guardrailConfigHash }
          : {}),
        models: bundle.models,
        decidedAt: bundle.decidedAt,
      },
    },
    {
      id: ids.case_law,
      kind: "case_law" as const,
      text: compactCaseLaw(bundle),
      data: {
        question: bundle.case.question,
        criteria: bundle.case.criteria,
        finalOutcome: bundle.finalOutcome,
        configHashHex: bundle.configHashHex,
      },
    },
  ];

  // v3: provenance row is the audit trail. PUBLIC (must be readable for anyone
  // to reproduce the verdict from on-chain ids alone). Optional because legacy
  // bundles predate it — when absent, persistVerdictBundle stays a 5-entry
  // Quilt for backcompat.
  if (bundle.provenance && ids.provenance) {
    baseEntries.push({
      id: ids.provenance,
      kind: "provenance" as const,
      text:
        `Provenance for ${bundle.case.question.slice(0, 80)} ` +
        `· verdict ${bundle.finalOutcome ? "YES" : "NO"} ` +
        `· decidedAt ${new Date(bundle.decidedAt).toISOString()}`,
      // Store the full provenance object verbatim so a reader can rebuild the
      // run without trusting the resolver UI.
      data: bundle.provenance as Record<string, unknown>,
    });
  }

  const { quiltId, rows } = await memory.remember(baseEntries);

  // Quilt identifier (the in-quilt name) is the patchIdentifier mapping applied
  // to entryId. TribunalMemory normalises with the same rule, so we replicate
  // it here for the patches map exposed to clients.
  const safe = (s: string) => {
    const t = s.replace(/[^a-zA-Z0-9_-]/g, "_");
    return /^[a-zA-Z0-9]/.test(t) ? t : `e_${t}`;
  };
  const patches: Record<string, string> = {};
  for (const [k, v] of Object.entries(ids)) patches[k] = safe(v);

  return { quiltId, rows, patches };
}
