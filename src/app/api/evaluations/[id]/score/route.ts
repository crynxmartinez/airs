import { NextRequest, NextResponse } from "next/server";
import { calculateScores } from "@/lib/scoring";
import { recordScoreSnapshot } from "@/lib/snapshot";
import { queryOne } from "@/lib/db";
import type { Evaluation } from "@/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const results = await calculateScores(id);
    // Auto-record multi-score snapshot for benchmark tracking
    const evaluation = await queryOne<Evaluation>("SELECT project_id FROM evaluations WHERE id = ?", [id]);
    if (evaluation?.project_id) {
      await recordScoreSnapshot(evaluation.project_id, id);
    }
    return NextResponse.json({ success: true, results, count: results.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scoring failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
