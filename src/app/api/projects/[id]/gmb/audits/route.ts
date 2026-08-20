import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const audits = await query<{
    id: string;
    search_query: string;
    location: string;
    lps_score: number;
    rating: string;
    your_rank: number | null;
    total_found: number;
    avg_rating: number;
    avg_review_count: number;
    created_at: string;
  }>(
    `SELECT id, search_query, location, lps_score, rating, your_rank, total_found, avg_rating, avg_review_count, created_at
     FROM gmb_audits WHERE project_id = ? ORDER BY created_at DESC`,
    [projectId]
  );

  return NextResponse.json(audits);
}
