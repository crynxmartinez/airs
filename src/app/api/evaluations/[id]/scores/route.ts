import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import type { DimensionScore } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const scores = await query<DimensionScore & { competitor_name: string | null }>(
    `SELECT ds.*, c.competitor_name 
     FROM dimension_scores ds 
     JOIN competitors c ON ds.competitor_id = c.id 
     WHERE ds.evaluation_id = ?`,
    [id]
  );
  return NextResponse.json(scores);
}
