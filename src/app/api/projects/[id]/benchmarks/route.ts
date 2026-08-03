import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Score history — every scoring run, ordered by time
  const scoreHistory = query<{ id: string; evaluation_id: string; rrs_score: number; rating: string | null; dimension_scores: string | null; recorded_at: string }>(
    `SELECT sh.id, sh.evaluation_id, sh.rrs_score, sh.rating, sh.dimension_scores, sh.recorded_at
     FROM score_history sh
     JOIN evaluations e ON sh.evaluation_id = e.id
     WHERE e.project_id = ?
     ORDER BY sh.recorded_at ASC`,
    [id]
  );

  // Group score history by evaluation for per-evaluation trend lines
  const historyByEval: Record<string, { date: string; score: number; rating: string | null }[]> = {};
  for (const h of scoreHistory) {
    if (!historyByEval[h.evaluation_id]) historyByEval[h.evaluation_id] = [];
    historyByEval[h.evaluation_id].push({
      date: new Date(h.recorded_at).toLocaleDateString(),
      score: h.rrs_score,
      rating: h.rating,
    });
  }

  // Dimension trends — extract from score_history.dimension_scores JSON
  const dimTrends: Record<string, { date: string; score: number }[]> = {};
  for (const h of scoreHistory) {
    if (!h.dimension_scores) continue;
    try {
      const dims = JSON.parse(h.dimension_scores) as { code: string; score: number }[];
      const date = new Date(h.recorded_at).toLocaleDateString();
      for (const d of dims) {
        if (!dimTrends[d.code]) dimTrends[d.code] = [];
        dimTrends[d.code].push({ date, score: d.score });
      }
    } catch {}
  }

  // Mission progress — for each evaluation with a mission, get completion %
  const missions = query<{ id: string; evaluation_id: string; name: string; status: string; created_at: string }>(
    `SELECT m.id, m.evaluation_id, m.name, m.status, m.created_at
     FROM missions m
     JOIN evaluations e ON m.evaluation_id = e.id
     WHERE e.project_id = ?
     ORDER BY m.created_at ASC`,
    [id]
  );

  const missionProgress = missions.map((m) => {
    const tasks = query<{ status: string }>(
      "SELECT status FROM mission_tasks WHERE mission_id = ?",
      [m.id]
    );
    const total = tasks.length;
    const done = tasks.filter((t) => t.status === "done").length;
    return {
      missionId: m.id,
      missionName: m.name,
      evaluationId: m.evaluation_id,
      total,
      done,
      progress: total > 0 ? Math.round((done / total) * 100) : 0,
      createdAt: m.created_at,
    };
  });

  // Historical: all evaluations in this project with scores
  const history = query<{ id: string; primary_query: string; rrs_score: number | null; rating: string | null; created_at: string }>(
    `SELECT id, primary_query, rrs_score, rating, created_at 
     FROM evaluations WHERE project_id = ? AND rrs_score IS NOT NULL 
     ORDER BY created_at ASC`,
    [id]
  );

  // Competitive: avg competitor scores per evaluation
  const competitive = query<{ evaluation_id: string; primary_query: string; avg_score: number; competitor_count: number }>(
    `SELECT e.id as evaluation_id, e.primary_query, 
       AVG(c.score) as avg_score, COUNT(c.id) as competitor_count
     FROM evaluations e 
     JOIN competitors c ON c.evaluation_id = e.id 
     WHERE e.project_id = ? AND c.score IS NOT NULL
     GROUP BY e.id ORDER BY e.created_at ASC`,
    [id]
  );

  // Industry: avg across all evaluations (all projects)
  const industry = query<{ avg_score: number; total_evaluations: number }>(
    `SELECT AVG(rrs_score) as avg_score, COUNT(*) as total_evaluations 
     FROM evaluations WHERE rrs_score IS NOT NULL`
  );

  // Dimension averages across project
  const dimensionAvg = query<{ dimension_code: string; avg_score: number }>(
    `SELECT ds.dimension_code, AVG(ds.score) as avg_score
     FROM dimension_scores ds
     JOIN evaluations e ON ds.evaluation_id = e.id
     WHERE e.project_id = ?
     GROUP BY ds.dimension_code`,
    [id]
  );

  // Target score
  const project = queryOne<{ target_score: number | null }>(
    "SELECT target_score FROM projects WHERE id = ?",
    [id]
  );

  return NextResponse.json({
    history,
    competitive,
    industry: industry[0] || { avg_score: 0, total_evaluations: 0 },
    dimensionAvg,
    scoreHistory: scoreHistory.map((h) => ({
      ...h,
      dimension_scores: h.dimension_scores ? JSON.parse(h.dimension_scores) : null,
    })),
    historyByEval,
    dimTrends,
    missionProgress,
    targetScore: project?.target_score ?? 80,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (typeof body.target_score === "number") {
    run("UPDATE projects SET target_score = ? WHERE id = ?", [body.target_score, id]);
  }

  const project = queryOne<{ target_score: number | null }>(
    "SELECT target_score FROM projects WHERE id = ?",
    [id]
  );
  return NextResponse.json({ target_score: project?.target_score ?? 80 });
}
