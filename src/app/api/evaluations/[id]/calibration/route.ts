import { NextRequest, NextResponse } from "next/server";
import { runCalibration, suggestWeightAdjustments } from "@/lib/calibration";

/**
 * Runs citation prediction calibration against observed AI citations.
 *
 * Compares predicted top-5 citations against actual AI citations captured
 * via Claude/Perplexity/Google AI Overview. Returns precision@5, recall@5,
 * per-engine breakdown, and weight adjustment suggestions.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const summary = await runCalibration(id);
  const suggestions = suggestWeightAdjustments(summary);

  return NextResponse.json({
    ...summary,
    suggestions,
  });
}
