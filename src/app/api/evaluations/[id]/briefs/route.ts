import { NextRequest, NextResponse } from "next/server";
import { getContentBriefs } from "@/lib/briefs";

/**
 * Fetches content briefs for an evaluation.
 *
 * Briefs are generated during the analysis run and persisted in the
 * content_briefs table. Each brief contains a target heading, required
 * evidence format, extractability notes, and a draft template.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const briefs = await getContentBriefs(id);

  if (briefs.length === 0) {
    return NextResponse.json(
      { error: "No content briefs — run analysis first" },
      { status: 400 }
    );
  }

  return NextResponse.json(briefs);
}
