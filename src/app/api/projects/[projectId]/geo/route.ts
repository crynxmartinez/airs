import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { Evaluation, Competitor } from "@/types";
import { calculateGeoScore, fetchRobotsTxt, parseRobotsForAiCrawlers } from "@/lib/geo";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  const evaluations = query<Evaluation>(
    "SELECT * FROM evaluations WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
    [projectId]
  );

  if (evaluations.length === 0) {
    return NextResponse.json({ error: "No evaluation found for this project" }, { status: 404 });
  }

  const evaluation = evaluations[0];

  const competitors = query<Competitor>(
    "SELECT * FROM competitors WHERE evaluation_id = ? ORDER BY created_at ASC",
    [evaluation.id]
  );

  const siteUrl = evaluation.digital_asset_url || competitors[0]?.url || "";

  let robotsData: { allowed: string[]; blocked: string[]; hasRobotsTxt: boolean } | undefined;
  if (siteUrl) {
    const robotsTxt = await fetchRobotsTxt(siteUrl);
    robotsData = parseRobotsForAiCrawlers(robotsTxt);
  }

  const result = calculateGeoScore(evaluation.id, robotsData);

  return NextResponse.json({
    ...result,
    siteUrl,
    evaluationId: evaluation.id,
    primaryQuery: evaluation.primary_query,
  });
}
