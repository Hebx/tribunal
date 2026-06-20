import { NextResponse } from "next/server";
import { judge } from "@/lib/server/committee";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/judge — summon the Tribunal. Runs the REAL committee (N models on
// the Kiro gateway) against a subjective challenge and returns the verdict +
// per-judge votes + the on-chain config hash. This is the proof the AI judge
// actually decides.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const question = String(body.question ?? "").trim();
    const evidence = String(body.evidence ?? "").trim();
    const priorContext = body.priorContext ? String(body.priorContext) : undefined;
    if (!question || !evidence) {
      return NextResponse.json({ error: "question and evidence are required" }, { status: 400 });
    }
    const verdict = await judge(question, evidence, priorContext);
    return NextResponse.json({ verdict });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
