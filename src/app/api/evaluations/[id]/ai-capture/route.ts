import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { captureClaudeAnswer, computeCitationShare, DISCOVERY_PROFILE } from "@/lib/ai-capture";
import { recordCitationSnapshot } from "@/lib/snapshot";

/**
 * Captures a real AI answer from Claude with web search.
 *
 * This is ground truth for the citation prediction model. The captured
 * answer and its citations are stored in ai_answers and ai_citations.
 *
 * Body: { query: string, profile?: "discovery" | "full" }
 *
 * `discovery` is the cheap profile — fewer search rounds and less deliberation, which is
 * where the token bill lives. It returns the same retrieval set and fan-out; only the prose
 * answer is shorter. Use it for competitor discovery, and `full` when the answer itself is
 * going to be quoted in a deliverable.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const queryString = body.query;

  if (!queryString) {
    return NextResponse.json({ error: "Missing 'query' in body" }, { status: 400 });
  }

  const evaluation = await queryOne<{ project_id: string; digital_asset_url: string }>(
    "SELECT project_id, digital_asset_url FROM evaluations WHERE id = ?",
    [id]
  );
  if (!evaluation) {
    return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
  }

  try {
    const result = await captureClaudeAnswer(
      queryString,
      evaluation.project_id,
      evaluation.digital_asset_url,
      body?.profile === "full" ? {} : DISCOVERY_PROFILE
    );
    // Auto-record citation snapshot for benchmark tracking
    await recordCitationSnapshot(evaluation.project_id);
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to capture AI answer" },
      { status: 500 }
    );
  }
}

/**
 * Returns Citation Share for the evaluation's project.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const evaluation = await queryOne<{ project_id: string }>(
    "SELECT project_id FROM evaluations WHERE id = ?",
    [id]
  );
  if (!evaluation) {
    return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
  }

  const share = await computeCitationShare(evaluation.project_id);
  return NextResponse.json(share);
}
