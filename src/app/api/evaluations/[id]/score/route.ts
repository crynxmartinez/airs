import { NextRequest, NextResponse } from "next/server";
import { calculateScores } from "@/lib/scoring";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    const results = calculateScores(id);
    return NextResponse.json({ success: true, results, count: results.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scoring failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
