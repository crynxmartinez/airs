import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { Evaluation } from "@/types";
import { scrapeGoogleMaps, analyzeGmbCompetitors } from "@/lib/gmb-scraper";

export async function POST(
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

  const body = await req.json();
  const { searchQuery, location, maxResults } = body;

  if (!searchQuery || !location) {
    return NextResponse.json(
      { error: "searchQuery and location are required" },
      { status: 400 }
    );
  }

  try {
    const result = await scrapeGoogleMaps(
      searchQuery,
      location,
      maxResults || 20
    );

    const analysis = analyzeGmbCompetitors(
      result.businesses,
      evaluation.digital_asset_url || undefined
    );

    return NextResponse.json({
      ...result,
      analysis,
      evaluationId: evaluation.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GMB scrape failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
