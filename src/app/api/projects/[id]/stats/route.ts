import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { calculateGeoScore } from "@/lib/geo";
import { calculateGmbScore } from "@/lib/gmb";
import { fetchRobotsTxt, parseRobotsForAiCrawlers } from "@/lib/geo";
import { computeCitationShare } from "@/lib/ai-capture";
import type { Evaluation, Mission, Project } from "@/types";

interface ScoreHistoryRow {
  id: string;
  evaluation_id: string;
  rrs_score: number;
  rating: string;
  recorded_at: string;
}

interface GmbAuditRow {
  id: string;
  lps_score: number;
  rating: string;
  your_rank: number | null;
  search_query: string;
  created_at: string;
}

interface ActivityItem {
  type: "evaluation" | "mission" | "gmb_audit" | "score" | "task_done";
  title: string;
  detail: string;
  score: number | null;
  created_at: string;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const project = await queryOne<Project>("SELECT * FROM projects WHERE id = ?", [projectId]);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const evaluations = await query<Evaluation & { competitor_count: number; evidence_count: number }>(
    `SELECT e.*, 
       (SELECT COUNT(*) FROM competitors WHERE evaluation_id = e.id) as competitor_count,
       (SELECT COUNT(*) FROM evidence WHERE evaluation_id = e.id) as evidence_count
     FROM evaluations e WHERE e.project_id = ? ORDER BY e.created_at DESC`,
    [projectId]
  );

  // RRS score
  const scoredEvals = evaluations.filter((e) => e.rrs_score !== null);
  const avgRrs = scoredEvals.length > 0
    ? Math.round(scoredEvals.reduce((sum, e) => sum + (e.rrs_score || 0), 0) / scoredEvals.length)
    : null;

  // GEO score
  let geoScore: number | null = null;
  let geoData: { score: number; rating: string; summary: { passed: number; warnings: number; failed: number } } | null = null;
  if (evaluations.length > 0) {
    try {
      const siteUrl = evaluations[0].digital_asset_url;
      let robotsData;
      if (siteUrl) {
        const robotsTxt = await fetchRobotsTxt(siteUrl);
        robotsData = parseRobotsForAiCrawlers(robotsTxt);
      }
      const result = await calculateGeoScore(evaluations[0].id, robotsData);
      geoScore = result.score;
      geoData = { score: result.score, rating: result.rating, summary: result.summary };
    } catch {
      // no evidence
    }
  }

  // GMB website readiness score
  let gmbScore: number | null = null;
  let gmbData: { score: number; rating: string; summary: { passed: number; warnings: number; failed: number } } | null = null;
  if (evaluations.length > 0) {
    try {
      const result = await calculateGmbScore(evaluations[0].id);
      gmbScore = result.score;
      gmbData = { score: result.score, rating: result.rating, summary: result.summary };
    } catch {
      // no evidence
    }
  }

  // GMB audit LPS score
  const gmbAudits = await query<GmbAuditRow>(
    "SELECT id, lps_score, rating, your_rank, search_query, created_at FROM gmb_audits WHERE project_id = ? ORDER BY created_at DESC",
    [projectId]
  );
  const latestGmbAudit = gmbAudits[0] || null;
  const gmbLpsScore = latestGmbAudit ? Math.round(latestGmbAudit.lps_score) : null;

  // Composite score
  const scores: { value: number; weight: number }[] = [];
  if (avgRrs !== null) scores.push({ value: avgRrs, weight: 0.4 });
  if (geoScore !== null) scores.push({ value: geoScore, weight: 0.3 });
  if (gmbLpsScore !== null) scores.push({ value: gmbLpsScore, weight: 0.3 });
  else if (gmbScore !== null) scores.push({ value: gmbScore, weight: 0.3 });

  const compositeScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.value * s.weight, 0) / scores.reduce((sum, s) => sum + s.weight, 0))
    : null;

  // Missions
  const missions = await query<Mission & { task_count: number; done_count: number }>(
    `SELECT m.*, 
       (SELECT COUNT(*) FROM mission_tasks WHERE mission_id = m.id) as task_count,
       (SELECT COUNT(*) FROM mission_tasks WHERE mission_id = m.id AND status = 'done') as done_count
     FROM missions m 
     JOIN evaluations e ON m.evaluation_id = e.id 
     WHERE e.project_id = ? ORDER BY m.created_at DESC`,
    [projectId]
  );

  const totalTasks = missions.reduce((sum, m) => sum + m.task_count, 0);
  const doneTasks = missions.reduce((sum, m) => sum + m.done_count, 0);
  const missionProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const activeMissions = missions.filter((m) => m.status === "active");

  // Score history
  const scoreHistory = await query<ScoreHistoryRow>(
    `SELECT sh.id, sh.evaluation_id, sh.rrs_score, sh.rating, sh.recorded_at
     FROM score_history sh
     JOIN evaluations e ON sh.evaluation_id = e.id
     WHERE e.project_id = ?
     ORDER BY sh.recorded_at ASC LIMIT 20`,
    [projectId]
  );

  // GMB audit history for trend chart
  const gmbHistory = gmbAudits.slice().reverse().map((a) => ({
    id: a.id,
    score: Math.round(a.lps_score),
    rating: a.rating,
    date: a.created_at,
    search_query: a.search_query,
  }));

  // Activity feed
  const activity: ActivityItem[] = [];

  for (const ev of evaluations.slice(0, 5)) {
    activity.push({
      type: "evaluation",
      title: `Evaluation: ${ev.primary_query}`,
      detail: ev.status.replace("_", " "),
      score: ev.rrs_score,
      created_at: ev.created_at,
    });
  }

  for (const m of missions.slice(0, 5)) {
    activity.push({
      type: "mission",
      title: `Mission: ${m.name}`,
      detail: m.status,
      score: null,
      created_at: m.created_at,
    });
  }

  for (const g of gmbAudits.slice(0, 5)) {
    activity.push({
      type: "gmb_audit",
      title: `Maps Scan: ${g.search_query}`,
      detail: g.your_rank ? `Rank #${g.your_rank}` : "Not found",
      score: Math.round(g.lps_score),
      created_at: g.created_at,
    });
  }

  // Recent completed tasks
  const recentTasks = await query<{ title: string; completed_at: string; mission_name: string }>(
    `SELECT mt.title, mt.completed_at, m.name as mission_name
     FROM mission_tasks mt JOIN missions m ON mt.mission_id = m.id
     JOIN evaluations e ON m.evaluation_id = e.id
     WHERE e.project_id = ? AND mt.status = 'done' AND mt.completed_at IS NOT NULL
     ORDER BY mt.completed_at DESC LIMIT 5`,
    [projectId]
  );
  for (const t of recentTasks) {
    activity.push({
      type: "task_done",
      title: `Task done: ${t.title}`,
      detail: t.mission_name,
      score: null,
      created_at: t.completed_at,
    });
  }

  activity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const recentActivity = activity.slice(0, 10);

  // Competitor count
  const competitorCount = evaluations.reduce((sum, e) => sum + (e.competitor_count || 0), 0);

  // Citation Share — the headline AI visibility metric
  const citationShare = await computeCitationShare(projectId);

  return NextResponse.json({
    project,
    scores: {
      rrs: avgRrs,
      geo: geoScore,
      geoData,
      gmb: gmbScore,
      gmbData,
      gmbLps: gmbLpsScore,
      composite: compositeScore,
      target: (project as Project & { target_score?: number }).target_score || 80,
    },
    citationShare,
    stats: {
      evaluationCount: evaluations.length,
      competitorCount,
      missionCount: missions.length,
      activeMissionCount: activeMissions.length,
      totalTasks,
      doneTasks,
      missionProgress,
      gmbAuditCount: gmbAudits.length,
    },
    missions: missions.slice(0, 5),
    activeMissions: activeMissions.slice(0, 3),
    scoreHistory: scoreHistory.map((h, i) => ({
      id: h.id,
      score: h.rrs_score,
      rating: h.rating,
      date: h.recorded_at,
      index: i + 1,
    })),
    gmbHistory,
    recentActivity,
    evaluations: evaluations.slice(0, 5),
  });
}

async function queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  const rows = await query<T>(sql, params);
  return rows[0];
}
