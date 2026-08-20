import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { summarizeProgress, type CoverageRow, type CoverageRun, type Transition, type GapMovement } from "@/lib/progress";

interface RunRow {
  id: string;
  evaluation_id: string;
  ran_at: string;
  engine_version: string | null;
  questions: number;
  sites: number;
}

interface EvalRow {
  id: string;
  primary_query: string;
}

/**
 * Project-level progress: what moved across every evaluation in the project.
 *
 * The benchmark page is scoped to a project while coverage runs are scoped to an
 * evaluation, so each evaluation is diffed independently and the transitions are
 * merged. Diffing across evaluations would be meaningless — different questions,
 * different competitor sets.
 *
 * `window` selects how far back the "before" run is taken from: the immediately
 * previous run, or the oldest run inside a day window. Progress needs a period, and
 * the period is the user's choice.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await queryOne<{ id: string; name: string }>("SELECT id, name FROM projects WHERE id = ?", [id]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const windowDays = parseInt(req.nextUrl.searchParams.get("days") ?? "0", 10) || 0;

  const evaluations = await query<EvalRow>(
    "SELECT id, primary_query FROM evaluations WHERE project_id = ? ORDER BY created_at DESC",
    [id]
  );

  const runs = await query<RunRow>(
    `SELECT r.id, r.evaluation_id, r.ran_at, r.engine_version, r.questions, r.sites
       FROM coverage_runs r JOIN evaluations e ON e.id = r.evaluation_id
      WHERE e.project_id = ?
      ORDER BY r.ran_at DESC, r.rowid DESC`,
    [id]
  );

  const perEvaluation: {
    evaluationId: string;
    query: string;
    before: RunRow;
    after: RunRow;
    comparable: boolean;
    transitions: Transition[];
    movements: GapMovement[];
  }[] = [];

  for (const evaluation of evaluations) {
    const own = runs.filter((r) => r.evaluation_id === evaluation.id);
    if (own.length < 2) continue;

    const after = own[0];
    const before = pickBaseline(own, windowDays);
    if (!before || before.id === after.id) continue;

    const summary = summarizeProgress(await loadRun(before), await loadRun(after));
    perEvaluation.push({
      evaluationId: evaluation.id,
      query: evaluation.primary_query,
      before,
      after,
      comparable: summary.comparable,
      transitions: summary.transitions,
      movements: summary.movements,
    });
  }

  const transitions = perEvaluation.flatMap((e) =>
    e.transitions.map((t) => ({ ...t, evaluationId: e.evaluationId, evaluationQuery: e.query, at: e.after.ran_at }))
  );
  const movements = perEvaluation.flatMap((e) =>
    e.movements.map((m) => ({ ...m, evaluationId: e.evaluationId, evaluationQuery: e.query }))
  );

  // A single re-baselined evaluation makes the whole period unsafe to present as
  // client progress, so this is deliberately pessimistic.
  const comparable = perEvaluation.length > 0 && perEvaluation.every((e) => e.comparable);

  return NextResponse.json({
    project: project.name,
    // Distinguish "no history yet" from "nothing changed": the first needs a second
    // analysis run, the second is a real, reportable result.
    has_baseline: perEvaluation.length > 0,
    evaluations_tracked: perEvaluation.length,
    evaluations_total: evaluations.length,
    runs_total: runs.length,
    comparable,
    window_days: windowDays,
    headline: {
      gaps_closed: transitions.filter((t) => t.kind === "self_answered").length,
      regressions: transitions.filter((t) => t.kind === "self_regressed").length,
      rivals_moved: transitions.filter((t) => t.kind === "rival_answered").length,
      openings: transitions.filter((t) => t.kind === "rival_regressed").length,
      earned: movements.reduce((sum, m) => sum + Math.max(0, m.earned), 0),
      drift: movements.reduce((sum, m) => sum + Math.max(0, m.drift), 0),
    },
    position: await fieldPosition(runs, perEvaluation),
    transitions,
    movements,
    periods: perEvaluation.map((e) => ({
      evaluation_id: e.evaluationId,
      query: e.query,
      from: e.before.ran_at,
      to: e.after.ran_at,
      comparable: e.comparable,
      engine_before: e.before.engine_version,
      engine_after: e.after.engine_version,
    })),
  });
}

/** The run to compare against: oldest inside the window, or the previous one. */
function pickBaseline(own: RunRow[], windowDays: number): RunRow | null {
  if (windowDays <= 0) return own[1] ?? null;

  const newest = Date.parse(own[0].ran_at.replace(" ", "T") + "Z");
  const cutoff = newest - windowDays * 24 * 60 * 60 * 1000;

  // Oldest run still inside the window; falls back to the immediately previous run so
  // a short window never silently reports "no change" when history exists.
  const inWindow = own.filter((r) => Date.parse(r.ran_at.replace(" ", "T") + "Z") >= cutoff);
  return inWindow[inWindow.length - 1] ?? own[1] ?? null;
}

async function loadRun(meta: RunRow): Promise<CoverageRun> {
  const rows = await query<CoverageRow>(
    `SELECT competitor_id, competitor_label, question, answer_type, level,
            specificity, subject_coverage, passage, source_url
       FROM coverage WHERE run_id = ?`,
    [meta.id]
  );
  return { id: meta.id, ran_at: meta.ran_at, engine_version: meta.engine_version, rows };
}

/**
 * Rank against the field, then and now.
 *
 * Rank is the honest progress metric: an absolute score can rise while the field
 * rises faster, and a chart of your own score draws that as a win. Ranking is by mean
 * specificity across the questions measured in both runs.
 */
async function fieldPosition(
  runs: RunRow[],
  perEvaluation: { before: RunRow; after: RunRow }[]
): Promise<{ before: number; after: number; of: number } | null> {
  if (perEvaluation.length === 0) return null;

  const rank = async (meta: RunRow) => {
    const rows = await query<{ competitor_id: string; specificity: number }>(
      "SELECT competitor_id, specificity FROM coverage WHERE run_id = ?",
      [meta.id]
    );
    if (rows.length === 0) return null;

    const totals = new Map<string, { sum: number; n: number }>();
    for (const r of rows) {
      const entry = totals.get(r.competitor_id) ?? { sum: 0, n: 0 };
      entry.sum += r.specificity;
      entry.n += 1;
      totals.set(r.competitor_id, entry);
    }

    const ordered = Array.from(totals.entries())
      .map(([id, t]) => ({ id, mean: t.sum / t.n }))
      .sort((a, b) => b.mean - a.mean);

    const selfIndex = ordered.findIndex((o) => o.id === "self" || o.id.startsWith("self:"));
    // No self row means the client was never crawled, so there is no position to
    // report. Returning a rank of "last" would invent a standing.
    return selfIndex < 0 ? null : { place: selfIndex + 1, of: ordered.length };
  };

  const first = perEvaluation[0];
  const before = await rank(first.before);
  const after = await rank(first.after);
  if (!before || !after) return null;

  return { before: before.place, after: after.place, of: after.of };
}
