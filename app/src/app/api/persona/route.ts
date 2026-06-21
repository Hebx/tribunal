import { NextResponse } from "next/server";
import { composePersona, listArchetypes } from "@/lib/server/persona";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/persona — list curated archetypes for the onboarding picker.
export async function GET() {
  return NextResponse.json({ archetypes: listArchetypes() });
}

// POST /api/persona — compose + scan a persona from { archetypeId, customText }.
// Returns the final system-prompt preview + the persona hash to commit on-chain,
// or a 400 with the scan flags when the custom text fails the safety scan.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const archetypeId = String(body.archetypeId ?? "").trim();
    const customText = String(body.customText ?? "");
    if (!archetypeId) {
      return NextResponse.json({ error: "archetypeId is required" }, { status: 400 });
    }
    const result = composePersona(archetypeId, customText);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.reason, flags: result.flags },
        { status: 400 },
      );
    }
    return NextResponse.json({
      personaHash: result.personaHash,
      systemPrompt: result.systemPrompt,
    });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
