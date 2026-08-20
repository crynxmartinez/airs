import { query, run, generateId } from "@/lib/db";
import { calculateGeoScore } from "@/lib/geo";
import { calculateGmbScore } from "@/lib/gmb";
import { fetchRobotsTxt, parseRobotsForAiCrawlers } from "@/lib/geo";
import { computeCitationShare } from "@/lib/ai-capture";
import type { Evaluation, DimensionScore } from "@/types";

/**
 * Records a complete score snapshot (RRS + GEO + GMB + Composite) into score_history.
 * Called automatically after scoring, GMB scans, or GEO analysis.
 */
export async function recordScoreSnapshot(projectId: string, evaluationId: string): Promise<void> {
  const evaluation = (await query<Evaluation>(
    "SELECT * FROM evaluations WHERE id = ?",
    [evaluationId]
  ))[0];
  if (!evaluation || evaluation.rrs_score == null) return;

  // RRS
  const rrsScore = evaluation.rrs_score;
  const rating = evaluation.rating;

  // Dimension scores
  const dimScores = await query<DimensionScore>(
    "SELECT dimension_code, score FROM dimension_scores WHERE evaluation_id = ?",
    [evaluationId]
  );
  const dimensionSummary = dimScores.map((d) => ({ code: d.dimension_code, score: d.score }));

  // GEO
  let geoScore: number | null = null;
  try {
    const siteUrl = evaluation.digital_asset_url;
    let robotsData;
    if (siteUrl) {
      const robotsTxt = await fetchRobotsTxt(siteUrl);
      robotsData = parseRobotsForAiCrawlers(robotsTxt);
    }
    const result = await calculateGeoScore(evaluationId, robotsData);
    geoScore = result.score;
  } catch (err) { console.error("[snapshot.ts]", err); }

  // GMB website readiness
  let gmbScore: number | null = null;
  try {
    const result = await calculateGmbScore(evaluationId);
    gmbScore = result.score;
  } catch (err) { console.error("[snapshot.ts]", err); }

  // GMB LPS from latest audit
  const gmbAudit = (await query<{ lps_score: number }>(
    "SELECT lps_score FROM gmb_audits WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
    [projectId]
  ))[0];
  const gmbLps = gmbAudit ? Math.round(gmbAudit.lps_score) : null;

  // Composite
  const scores: { value: number; weight: number }[] = [];
  if (rrsScore !== null) scores.push({ value: rrsScore, weight: 0.4 });
  if (geoScore !== null) scores.push({ value: geoScore, weight: 0.3 });
  if (gmbLps !== null) scores.push({ value: gmbLps, weight: 0.3 });
  else if (gmbScore !== null) scores.push({ value: gmbScore, weight: 0.3 });

  const compositeScore = scores.length > 0
    ? Math.round(scores.reduce((sum, s) => sum + s.value * s.weight, 0) / scores.reduce((sum, s) => sum + s.weight, 0))
    : null;

  await run(
    `INSERT INTO score_history (id, evaluation_id, rrs_score, rating, dimension_scores, geo_score, gmb_score, composite_score, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))`,
    [
      generateId(),
      evaluationId,
      rrsScore,
      rating,
      JSON.stringify(dimensionSummary),
      geoScore,
      gmbLps ?? gmbScore,
      compositeScore,
    ]
  );
}

/**
 * Records a citation share snapshot into citation_snapshots.
 * Called automatically after AI answer capture.
 */
export async function recordCitationSnapshot(projectId: string): Promise<void> {
  const share = await computeCitationShare(projectId);

  await run(
    `INSERT INTO citation_snapshots (id, project_id, total_queries, cited_queries, citation_share, per_engine, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))`,
    [
      generateId(),
      projectId,
      share.totalQueries,
      share.citedQueries,
      share.citationShare,
      JSON.stringify(share.perEngine),
    ]
  );
}

