import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { resolveCase } from "@/lib/server/resolve";
import { loadStakersForCase } from "@/lib/server/load-stakers";
import { loadAgentPool } from "@/lib/server/load-agent-pool";
import { pickAdvocates, BothSidesMustStake } from "@/lib/server/matchmaking";
import { selectJury } from "@/lib/server/select-jury";
import { assembleCaseAgents, MissingArchetypeError } from "@/lib/server/assemble-case";
import { persistBundle } from "@/lib/server/persist";
import { getMockBattle } from "@/lib/mock";
import type { CaseInput } from "@/lib/server/debate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/resolve — v3 stake-gated judgment pipeline.
//
// Request:  { caseId, rounds? }
// Response: { bundle: VerdictBundle (with provenance row) }
//
// Server flow:
//   1. loadAgentPool()         — global AgentCard registry (jury candidates)
//   2. loadStakersForCase()    — pool + stakers + advocate slots from chain
//   3. pickAdvocates()         — enforces "both sides must stake" rule
//   4. selectJury()            — top-rep, archetype-distinct, deterministic
//   5. assembleCaseAgents()    — composes personas from each AgentCard's
//                                archetype_id (no untrusted free text on wire)
//   6. caseInputFor(caseId)    — sources the question/criteria/evidence
//   7. resolveCase(..., { provenance }) — debate → jury → guardrail + audit row
//
// Error contracts:
//   400 — caseId missing or malformed
//   404 — no Case object for caseId (no pool created yet, or unknown id)
//   409 — BothSidesMustStake (one or both sides has no advocate yet)
//   500 — anything else (typed message in body.error)
//
// QUESTION/EVIDENCE SOURCE (transitional in v3):
//   Seeded demo battles in @/lib/mock carry the question/criteria/evidence
//   inline — they precede the on-chain `evidence_ref → Walrus` blob layer.
//   Real cases summoned via /summon will eventually pull the case text from
//   the on-chain `evidence_ref` Walrus blob; that wiring lands with M3b
//   (Walrus typed Quilts). Until then the route resolves seeded battles by
//   matching `caseId` against MOCK_BATTLES[].caseId and rejects unknown ids
//   with a typed 404.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const caseId = String(body.caseId ?? "").trim();
    if (!caseId || !/^0x[0-9a-fA-F]+$/.test(caseId)) {
      return NextResponse.json(
        { error: "caseId is required and must be a 0x-prefixed hex object id" },
        { status: 400 },
      );
    }
    const rounds = Number.isFinite(body.rounds)
      ? Math.max(1, Math.min(4, Number(body.rounds)))
      : 2;

    // 1 — global AgentCard pool (jury candidates + staker enrichment).
    const pool = await loadAgentPool();

    // 2 — per-case stake state. Needs the pool to enrich stakers with
    // score/archetype, so this is intentionally serial.
    const loaded = await loadStakersForCase(caseId, pool);
    if (!loaded) {
      return NextResponse.json(
        { error: `no stake pool exists for case ${caseId}; stake first to open the case` },
        { status: 404 },
      );
    }

    // 3 — enforce "both sides must stake".
    let matchup;
    try {
      matchup = pickAdvocates(
        loaded.advocateYesId,
        loaded.advocateNoId,
        loaded.stakers,
        pool,
      );
    } catch (e) {
      if (e instanceof BothSidesMustStake) {
        return NextResponse.json(
          {
            error: "both sides must have a staked advocate before resolution",
            code: "BothSidesMustStake",
            emptySides: e.emptySides,
          },
          { status: 409 },
        );
      }
      throw e;
    }

    // 4 — deterministic, archetype-distinct, top-rep panel of 3.
    const seed = createHash("sha256").update(caseId).digest("hex").slice(0, 16);
    const jury = selectJury([matchup.affirmer, matchup.denier], pool, seed);

    // 5 — compose persona system-prompts from each AgentCard's archetype.
    let assembled;
    try {
      assembled = assembleCaseAgents(matchup, jury);
    } catch (e) {
      if (e instanceof MissingArchetypeError) {
        return NextResponse.json(
          { error: e.message, code: "MissingArchetype" },
          { status: 422 },
        );
      }
      throw e;
    }

    // 6 — case text. For seeded demo cases, sourced from MOCK_BATTLES.
    const caseInput = caseInputFor(caseId);
    if (!caseInput) {
      return NextResponse.json(
        {
          error:
            `case ${caseId} has no resolvable question/criteria/evidence. ` +
            "Seeded battles must match a MOCK_BATTLES.caseId; live cases " +
            "require the on-chain evidence_ref → Walrus blob (lands in M3b).",
          code: "NoCaseInput",
        },
        { status: 404 },
      );
    }

    // 7 — debate → jury → guardrail → verdict + provenance.
    const bundle = await resolveCase(caseInput, assembled.agents, {
      rounds,
      provenance: {
        caseId,
        loaded,
        assembled,
        jurySelection: jury,
      },
    });

    // 8 — persist to Walrus as a typed Quilt (6 entries). Best-effort:
    // the verdict still returns if Walrus is unreachable. UI surfaces the
    // audit error inline so the gap is visible, not silently swallowed.
    const audit = await persistBundle(caseId, bundle);

    return NextResponse.json({
      bundle,
      audit:
        audit.ok
          ? { ok: true as const, ...audit.persisted }
          : { ok: false as const, error: audit.error },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * Resolve the question/criteria/evidence for a caseId.
 *
 * Seeded demo battles (lib/mock.ts) carry these inline and predate the
 * on-chain `evidence_ref` blob; we look them up by caseId. Real cases
 * summoned via /summon will source from Walrus in M3b — until then they
 * return null (404 to the caller).
 */
function caseInputFor(caseId: string): CaseInput | null {
  const battle = getMockBattle(caseId);
  if (!battle) return null;
  return {
    question: battle.challenge,
    criteria: battle.criteria,
    evidence: battle.evidence,
  };
}
