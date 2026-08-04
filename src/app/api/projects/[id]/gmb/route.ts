import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { Evaluation } from "@/types";
import { calculateGmbScore } from "@/lib/gmb";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const evaluations = query<Evaluation>(
    "SELECT * FROM evaluations WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
    [projectId]
  );

  if (evaluations.length === 0) {
    return NextResponse.json({ error: "No evaluation found for this project" }, { status: 404 });
  }

  const evaluation = evaluations[0];
  const result = calculateGmbScore(evaluation.id);

  return NextResponse.json({
    ...result,
    siteUrl: evaluation.digital_asset_url,
    evaluationId: evaluation.id,
    primaryQuery: evaluation.primary_query,
  });
}
