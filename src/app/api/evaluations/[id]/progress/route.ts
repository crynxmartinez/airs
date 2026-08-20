import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { summarizeProgress, type CoverageRow, type CoverageRun } from "@/lib/progress";
import type { Evaluation } from "@/types";

interface RunRow {
  id: string;
  ran_at: string;
  engine_version: string | null;
  questions: number;
  sites: number;
}

/**
 * Progress for an evaluation: what changed between two coverage runs.
 *
 * Defaults to the two most recent runs. Pass `before` and/or `after` run ids to
 * compare any pair — comparing against the first run gives progress since baseline.
 *
 * Returns `comparable: false` when the runs used different engine versions. That case
 * is not an error and the transitions are still returned, but they must not be
 * presented as the client's progress: verdicts that moved because the algorithm
 * changed would otherwise be credited to their content.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const evaluation = await queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });

  const runs = await query<RunRow>(
    `SELECT id, ran_at, engine_version, questions, sites
     FROM coverage_runs WHERE evaluation_id = ? ORDER BY ran_at DESC, rowid DESC`,
    [id]
  );

  if (runs.length < 2) {
    return NextResponse.json({
      evaluation_id: id,
      runs: runs.length,
      progress: null,
      // A single run is a position, not progress. Say so rather than returning zeros,
      // which would read as "nothing changed" instead of "nothing to compare yet".
      message:
        runs.length === 0
          ? "No coverage runs yet — run the analysis to record a baseline."
          : "Only one coverage run recorded. Progress needs a second run to diff against.",
      available_runs: runs,
    });
  }

  const afterId = req.nextUrl.searchParams.get("after") ?? runs[0].id;
  const beforeId = req.nextUrl.searchParams.get("before") ?? runs[1].id;

  const before = await loadRun(runs, beforeId);
  const after = await loadRun(runs, afterId);
  if (!before || !after) {
    return NextResponse.json({ error: "Unknown run id" }, { status: 400 });
  }

  const summary = summarizeProgress(before, after);

  return NextResponse.json({
    evaluation_id: id,
    before: { id: before.id, ran_at: before.ran_at, engine_version: before.engine_version },
    after: { id: after.id, ran_at: after.ran_at, engine_version: after.engine_version },
    comparable: summary.comparable,
    headline: {
      gaps_closed: summary.gapsClosed,
      regressions: summary.regressions,
      rivals_moved: summary.rivalsMoved,
      earned: summary.earned,
      drift: summary.drift,
    },
    transitions: summary.transitions,
    movements: summary.movements,
    available_runs: runs,
  });
}

async function loadRun(runs: RunRow[], runId: string): Promise<CoverageRun | null> {
  const meta = runs.find((r) => r.id === runId);
  if (!meta) return null;

  const rows = await query<CoverageRow>(
    `SELECT competitor_id, competitor_label, question, answer_type, level,
            specificity, subject_coverage, passage, source_url
     FROM coverage WHERE run_id = ?`,
    [runId]
  );

  return { id: meta.id, ran_at: meta.ran_at, engine_version: meta.engine_version, rows };
}
