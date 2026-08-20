import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  // Multi-score history — every scoring run with all score dimensions
  const scoreHistory = await query<{
    id: string;
    evaluation_id: string;
    rrs_score: number;
    rating: string | null;
    dimension_scores: string | null;
    geo_score: number | null;
    gmb_score: number | null;
    composite_score: number | null;
    recorded_at: string;
  }>(
    `SELECT sh.id, sh.evaluation_id, sh.rrs_score, sh.rating, sh.dimension_scores,
            sh.geo_score, sh.gmb_score, sh.composite_score, sh.recorded_at
     FROM score_history sh
     JOIN evaluations e ON sh.evaluation_id = e.id
     WHERE e.project_id = ?
     ORDER BY sh.recorded_at ASC`,
    [id]
  );

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
    } catch (err) { console.error("[route.ts]", err); }
  }

  // Mission progress — for each evaluation with a mission, get completion %
  const missions = await query<{ id: string; evaluation_id: string; name: string; status: string; created_at: string }>(
    `SELECT m.id, m.evaluation_id, m.name, m.status, m.created_at
     FROM missions m
     JOIN evaluations e ON m.evaluation_id = e.id
     WHERE e.project_id = ?
     ORDER BY m.created_at ASC`,
    [id]
  );

  const missionProgress = await Promise.all(missions.map(async (m) => {
    const tasks = await query<{ status: string }>(
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
  }));

  // Historical: all evaluations in this project with scores
  const history = await query<{ id: string; primary_query: string; rrs_score: number | null; rating: string | null; created_at: string }>(
    `SELECT id, primary_query, rrs_score, rating, created_at 
     FROM evaluations WHERE project_id = ? AND rrs_score IS NOT NULL 
     ORDER BY created_at ASC`,
    [id]
  );

  // Dimension averages across project
  const dimensionAvg = await query<{ dimension_code: string; avg_score: number }>(
    `SELECT ds.dimension_code, AVG(ds.score) as avg_score
     FROM dimension_scores ds
     JOIN evaluations e ON ds.evaluation_id = e.id
     WHERE e.project_id = ?
     GROUP BY ds.dimension_code`,
    [id]
  );

  // Citation snapshots — citation share over time
  const citationHistory = await query<{
    id: string;
    total_queries: number;
    cited_queries: number;
    citation_share: number;
    per_engine: string | null;
    recorded_at: string;
  }>(
    `SELECT id, total_queries, cited_queries, citation_share, per_engine, recorded_at
     FROM citation_snapshots
     WHERE project_id = ?
     ORDER BY recorded_at ASC`,
    [id]
  );

  // Outcome summary — briefs shipped → measured improvements
  const outcomes = await query<{
    id: string;
    question: string;
    shipped_at: string | null;
    citation_before: number;
    citation_after: number;
    measured_at: string | null;
  }>(
    `SELECT id, question, shipped_at, citation_before, citation_after, measured_at
     FROM outcomes
     WHERE project_id = ?
     ORDER BY created_at DESC`,
    [id]
  );

  const outcomeSummary = {
    total: outcomes.length,
    shipped: outcomes.filter((o) => o.shipped_at !== null).length,
    verified: outcomes.filter((o) => o.measured_at !== null && o.citation_after > o.citation_before).length,
    pending: outcomes.filter((o) => o.shipped_at !== null && o.measured_at === null).length,
  };

  // Target score
  const project = await queryOne<{ target_score: number | null }>(
    "SELECT target_score FROM projects WHERE id = ?",
    [id]
  );

  return NextResponse.json({
    history,
    dimensionAvg,
    scoreHistory: scoreHistory.map((h) => ({
      ...h,
      dimension_scores: h.dimension_scores ? JSON.parse(h.dimension_scores) : null,
    })),
    dimTrends,
    missionProgress,
    citationHistory: citationHistory.map((c) => ({
      ...c,
      per_engine: c.per_engine ? JSON.parse(c.per_engine) : null,
    })),
    outcomeSummary,
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
    await run("UPDATE projects SET target_score = ? WHERE id = ?", [body.target_score, id]);
  }

  const project = await queryOne<{ target_score: number | null }>(
    "SELECT target_score FROM projects WHERE id = ?",
    [id]
  );
  return NextResponse.json({ target_score: project?.target_score ?? 80 });
}
