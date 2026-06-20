import { NextResponse } from "next/server";
import { recall } from "@/lib/server/recall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Known public quilts holding Tribunal case law (verdict + case_law entries),
// written by the verified full-e2e + memory-demo runs. The arena reads these so
// "Case Law" reflects real accumulated precedent on Walrus.
const SEED_QUILTS = [
  "E0761R4PFVtil4qToPtI0B59-L5wvpkQecZdna8izfo",
  "1plGkbwJibcmJgZy9CXL8ZtMPoPc9XjyJB_0dxo3yf0",
];

// POST /api/recall — semantic recall of public case law from Walrus memory.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body.query ?? "").trim();
    if (!query) return NextResponse.json({ error: "query is required" }, { status: 400 });
    const quiltIds: string[] = Array.isArray(body.quiltIds) && body.quiltIds.length ? body.quiltIds : SEED_QUILTS;
    const hits = await recall(query, quiltIds, body.k ?? 5);
    return NextResponse.json({ hits });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 500 });
  }
}
