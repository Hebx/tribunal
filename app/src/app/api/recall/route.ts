import { NextResponse } from "next/server";
import { recall } from "@/lib/server/recall";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// v3-anchored case-law quilts on Walrus, written by `pnpm seed-arena` in the
// SDK. Each quilt's `_manifest` includes an `anchor` row carrying the on-chain
// caseId / pool / configHash, so a recall hit can prove provenance back to its
// case in one hop. No legacy / Helios seeds — every entry on /precedent traces
// to a real v3 case.
//
// Update list: `pnpm --filter @tribunal/sdk seed-arena` writes
// sdk/scripts/seed-arena.out.json with the new quilt ids; copy them here.
const SEED_QUILTS = [
  "f_KqulylakARqv6Dk1V00IJGMSvhpI7JgJnA1S31Xg0", // zk-soundness-bounty (case 0xf7b15c…06cf)
  "pcwId8Wi5MqhnbAlwiP_GcFrxZwjGHwJGKidy8_cgXQ", // stake-flow-schema (case 0xfcda6e…6dcb)
];

// GET /api/recall — returns the active seed-quilt list (for debugging / Case Law page).
export async function GET() {
  return NextResponse.json({ quiltIds: SEED_QUILTS });
}

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
