import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { generateRecommendations } from "@/lib/recommendations";
import type { Recommendation } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const recs = query<Recommendation>(
    "SELECT * FROM recommendations WHERE evaluation_id = ? ORDER BY CASE WHEN priority = 'high' THEN 0 WHEN priority = 'medium' THEN 1 ELSE 2 END",
    [id]
  );
  return NextResponse.json(recs);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const recs = generateRecommendations(id);
    return NextResponse.json({ success: true, recommendations: recs, count: recs.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate recommendations";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
