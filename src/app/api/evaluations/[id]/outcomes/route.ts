import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { markBriefShipped, measureOutcome, getOutcomes, getOutcomeSummary } from "@/lib/outcomes";

/**
 * GET — Returns all outcomes for the evaluation's project.
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

  const outcomes = await getOutcomes(evaluation.project_id);
  const summary = await getOutcomeSummary(evaluation.project_id);

  return NextResponse.json({ outcomes, summary });
}

/**
 * POST — Marks a brief as shipped or measures an outcome.
 *
 * Body: { action: "ship", briefId: string } | { action: "measure", outcomeId: string }
 */
export async function POST(
  req: NextRequest,
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

  const body = await req.json();

  if (body.action === "ship" && body.briefId) {
    try {
      const outcome = await markBriefShipped(body.briefId, evaluation.project_id);
      return NextResponse.json(outcome);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to mark brief as shipped" },
        { status: 500 }
      );
    }
  }

  if (body.action === "measure" && body.outcomeId) {
    try {
      const outcome = await measureOutcome(body.outcomeId);
      return NextResponse.json(outcome);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Failed to measure outcome" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: "Invalid action. Use { action: 'ship', briefId } or { action: 'measure', outcomeId }" }, { status: 400 });
}
