import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { calculateGeoScore } from "@/lib/geo";
import { calculateGmbScore } from "@/lib/gmb";
import type { Evaluation, Project } from "@/types";

interface ProjectWithCounts extends Project {
  evaluation_count: number;
  competitor_count: number;
  target_score: number | null;
}

interface GmbAuditRow {
  project_id: string;
  lps_score: number;
  rating: string;
  your_rank: number | null;
  created_at: string;
}

interface ActivityItem {
  type: "evaluation" | "mission" | "gmb_audit" | "score";
  project_id: string;
  project_name: string;
  title: string;
  detail: string;
  score: number | null;
  created_at: string;
}

export async function GET() {
  const projects = query<ProjectWithCounts>(
    `SELECT p.*, 
       (SELECT COUNT(*) FROM evaluations WHERE project_id = p.id) as evaluation_count,
       (SELECT COUNT(*) FROM competitors c JOIN evaluations e ON c.evaluation_id = e.id WHERE e.project_id = p.id) as competitor_count,
       p.target_score
     FROM projects p ORDER BY p.created_at DESC`
  );

  const projectScores: {
    id: string;
    name: string;
    description: string | null;
    evaluation_count: number;
    competitor_count: number;
    rrs_score: number | null;
    geo_score: number | null;
    gmb_score: number | null;
    gmb_lps_score: number | null;
    composite_score: number | null;
    target_score: number | null;
  }[] = [];

  for (const project of projects) {
    // Get latest evaluation with RRS score
    const evals = query<Evaluation>(
      "SELECT * FROM evaluations WHERE project_id = ? ORDER BY created_at DESC",
      [project.id]
    );

    const scoredEvals = evals.filter((e) => e.rrs_score !== null);
    const avgRrs = scoredEvals.length > 0
      ? Math.round(scoredEvals.reduce((sum, e) => sum + (e.rrs_score || 0), 0) / scoredEvals.length)
      : null;

    // Get GEO score from latest evaluation
    let geoScore: number | null = null;
    if (evals.length > 0) {
      try {
        const geoResult = calculateGeoScore(evals[0].id);
        geoScore = geoResult.score;
      } catch {
        // no evidence yet
      }
    }

    // Get GMB website readiness score from latest evaluation
    let gmbScore: number | null = null;
    if (evals.length > 0) {
      try {
        const gmbResult = calculateGmbScore(evals[0].id);
        gmbScore = gmbResult.score;
      } catch {
        // no evidence yet
      }
    }

    // Get latest GMB audit LPS score
    const gmbAudits = query<GmbAuditRow>(
      "SELECT project_id, lps_score, rating, your_rank, created_at FROM gmb_audits WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
      [project.id]
    );
    const gmbLpsScore = gmbAudits.length > 0 ? Math.round(gmbAudits[0].lps_score) : null;

    // Composite score: weighted average of available scores
    const scores: { value: number; weight: number }[] = [];
    if (avgRrs !== null) scores.push({ value: avgRrs, weight: 0.4 });
    if (geoScore !== null) scores.push({ value: geoScore, weight: 0.3 });
    if (gmbLpsScore !== null) scores.push({ value: gmbLpsScore, weight: 0.3 });
    else if (gmbScore !== null) scores.push({ value: gmbScore, weight: 0.3 });

    const compositeScore = scores.length > 0
      ? Math.round(scores.reduce((sum, s) => sum + s.value * s.weight, 0) / scores.reduce((sum, s) => sum + s.weight, 0))
      : null;

    projectScores.push({
      id: project.id,
      name: project.name,
      description: project.description,
      evaluation_count: project.evaluation_count,
      competitor_count: project.competitor_count,
      rrs_score: avgRrs,
      geo_score: geoScore,
      gmb_score: gmbScore,
      gmb_lps_score: gmbLpsScore,
      composite_score: compositeScore,
      target_score: project.target_score,
    });
  }

  // Global stats
  const totalProjects = projects.length;
  const totalEvals = projects.reduce((sum, p) => sum + p.evaluation_count, 0);
  const totalCompetitors = projects.reduce((sum, p) => sum + p.competitor_count, 0);
  const scoredProjects = projectScores.filter((p) => p.composite_score !== null);
  const avgComposite = scoredProjects.length > 0
    ? Math.round(scoredProjects.reduce((sum, p) => sum + (p.composite_score || 0), 0) / scoredProjects.length)
    : null;
  const avgRrs = projectScores.filter((p) => p.rrs_score !== null).length > 0
    ? Math.round(projectScores.filter((p) => p.rrs_score !== null).reduce((sum, p) => sum + (p.rrs_score || 0), 0) / projectScores.filter((p) => p.rrs_score !== null).length)
    : null;
  const avgGeo = projectScores.filter((p) => p.geo_score !== null).length > 0
    ? Math.round(projectScores.filter((p) => p.geo_score !== null).reduce((sum, p) => sum + (p.geo_score || 0), 0) / projectScores.filter((p) => p.geo_score !== null).length)
    : null;
  const avgGmb = projectScores.filter((p) => p.gmb_lps_score !== null).length > 0
    ? Math.round(projectScores.filter((p) => p.gmb_lps_score !== null).reduce((sum, p) => sum + (p.gmb_lps_score || 0), 0) / projectScores.filter((p) => p.gmb_lps_score !== null).length)
    : null;

  // Needs attention: projects with composite score below 50 or below target
  const needsAttention = projectScores.filter((p) => {
    if (p.composite_score === null) return false;
    const target = p.target_score || 80;
    return p.composite_score < target - 20 || p.composite_score < 50;
  });

  // Activity feed: recent evaluations, missions, GMB audits
  const activity: ActivityItem[] = [];

  const recentEvals = query<{ id: string; project_id: string; primary_query: string; status: string; rrs_score: number | null; created_at: string; project_name: string }>(
    `SELECT e.id, e.project_id, e.primary_query, e.status, e.rrs_score, e.created_at, p.name as project_name
     FROM evaluations e JOIN projects p ON e.project_id = p.id
     ORDER BY e.created_at DESC LIMIT 10`,
    []
  );
  for (const ev of recentEvals) {
    activity.push({
      type: "evaluation",
      project_id: ev.project_id,
      project_name: ev.project_name,
      title: `Evaluation: ${ev.primary_query}`,
      detail: ev.status.replace("_", " "),
      score: ev.rrs_score,
      created_at: ev.created_at,
    });
  }

  const recentMissions = query<{ id: string; evaluation_id: string; name: string; status: string; created_at: string; project_id: string; project_name: string }>(
    `SELECT m.id, m.evaluation_id, m.name, m.status, m.created_at, e.project_id, p.name as project_name
     FROM missions m JOIN evaluations e ON m.evaluation_id = e.id JOIN projects p ON e.project_id = p.id
     ORDER BY m.created_at DESC LIMIT 10`,
    []
  );
  for (const m of recentMissions) {
    activity.push({
      type: "mission",
      project_id: m.project_id,
      project_name: m.project_name,
      title: `Mission: ${m.name}`,
      detail: m.status,
      score: null,
      created_at: m.created_at,
    });
  }

  const recentGmbAudits = query<{ id: string; project_id: string; search_query: string; lps_score: number; your_rank: number | null; created_at: string; project_name: string }>(
    `SELECT g.id, g.project_id, g.search_query, g.lps_score, g.your_rank, g.created_at, p.name as project_name
     FROM gmb_audits g JOIN projects p ON g.project_id = p.id
     ORDER BY g.created_at DESC LIMIT 10`,
    []
  );
  for (const g of recentGmbAudits) {
    activity.push({
      type: "gmb_audit",
      project_id: g.project_id,
      project_name: g.project_name,
      title: `Maps Scan: ${g.search_query}`,
      detail: g.your_rank ? `Rank #${g.your_rank}` : "Not found in results",
      score: Math.round(g.lps_score),
      created_at: g.created_at,
    });
  }

  // Sort activity by date desc and take 15
  activity.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const recentActivity = activity.slice(0, 15);

  return NextResponse.json({
    stats: {
      totalProjects,
      totalEvals,
      totalCompetitors,
      avgComposite,
      avgRrs,
      avgGeo,
      avgGmb,
    },
    projects: projectScores,
    needsAttention,
    recentActivity,
  });
}
