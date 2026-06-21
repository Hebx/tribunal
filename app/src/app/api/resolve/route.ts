import { NextResponse } from "next/server";
import { resolveCase, type ResolveAgents } from "@/lib/server/resolve";
import type { CaseInput, AdvocatePersona } from "@/lib/server/debate";
import type { JurorPersona } from "@/lib/server/jury";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/resolve — the v2 judgment pipeline. Runs the full loop on the Kiro
// gateway: persona advocates debate → persona jury deliberates → guardrail judge
// (opus-4.8) issues the binding verdict. Returns the complete VerdictBundle
// (transcript, first-pass + final jury votes, dissent, disagreement rate,
// guardrail decision + bias flags, and the locked resolver config hash).
//
// Body: { question, criteria, evidence, affirmer, denier, jurors[], rounds? }
// where affirmer/denier are AdvocatePersona and jurors are JurorPersona.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question ?? "").trim();
    const criteria = String(body.criteria ?? "").trim();
    const evidence = String(body.evidence ?? "").trim();
    if (!question || !criteria || !evidence) {
      return NextResponse.json(
        { error: "question, criteria and evidence are required" },
        { status: 400 },
      );
    }

    const affirmer = body.affirmer as AdvocatePersona | undefined;
    const denier = body.denier as AdvocatePersona | undefined;
    const jurors = (body.jurors ?? []) as JurorPersona[];
    if (!affirmer?.systemPrompt || !denier?.systemPrompt) {
      return NextResponse.json({ error: "affirmer and denier personas are required" }, { status: 400 });
    }
    if (!Array.isArray(jurors) || jurors.length < 2) {
      return NextResponse.json({ error: "at least 2 juror personas are required" }, { status: 400 });
    }

    const c: CaseInput = { question, criteria, evidence };
    const agents: ResolveAgents = { affirmer, denier, jurors };
    const rounds = Number.isFinite(body.rounds) ? Math.max(1, Math.min(4, Number(body.rounds))) : 2;

    const bundle = await resolveCase(c, agents, { rounds });
    return NextResponse.json({ bundle });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
