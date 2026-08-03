import { query, run, generateId } from "@/lib/db";
import type { Evidence, Competitor } from "@/types";

export interface DimensionConfig {
  code: string;
  label: string;
  category: string;
  weight: number;
}

export const DIMENSIONS: DimensionConfig[] = [
  { code: "intent", label: "Intent Alignment", category: "structural", weight: 0.15 },
  { code: "content", label: "Content Excellence", category: "content", weight: 0.20 },
  { code: "trust", label: "Trust & Authority", category: "trust", weight: 0.15 },
  { code: "ux", label: "User Experience", category: "ux", weight: 0.15 },
  { code: "technical", label: "Technical Excellence", category: "technical", weight: 0.15 },
  { code: "competitive", label: "Competitive Position", category: "competitive", weight: 0.10 },
  { code: "ecosystem", label: "Ecosystem Presence", category: "ecosystem", weight: 0.10 },
];

export function getRating(score: number): "platinum" | "gold" | "silver" | "bronze" | "foundation" {
  if (score >= 90) return "platinum";
  if (score >= 75) return "gold";
  if (score >= 60) return "silver";
  if (score >= 40) return "bronze";
  return "foundation";
}

export function getConfidenceLevel(evidenceCount: number): "high" | "medium" | "low" {
  if (evidenceCount >= 5) return "high";
  if (evidenceCount >= 2) return "medium";
  return "low";
}

function scoreBooleanEvidence(items: Evidence[]): number {
  if (items.length === 0) return 0;
  let positive = 0;
  let total = 0;
  for (const item of items) {
    if (item.value === "true") positive++;
    if (item.value === "true" || item.value === "false") total++;
  }
  if (total === 0) return 50;
  return Math.round((positive / total) * 100);
}

function _scoreNumericEvidence(items: Evidence[], thresholds: { good: number; ok: number }): number {
  if (items.length === 0) return 0;
  const values = items
    .map((i) => parseFloat(i.value || "0"))
    .filter((v) => !isNaN(v));
  if (values.length === 0) return 50;
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  if (avg >= thresholds.good) return 90;
  if (avg >= thresholds.ok) return 65;
  return 35;
}

function scoreDimension(category: string, evidence: Evidence[]): number {
  if (evidence.length === 0) return 0;

  switch (category) {
    case "structural": {
      const headingEv = evidence.filter((e) => e.indicator_code === "ST-01-I01");
      const navEv = evidence.filter((e) => e.indicator_code === "ST-02-I01");
      const schemaEv = evidence.filter((e) => e.indicator_code === "ST-03-I01");

      let score = 0;
      if (headingEv.length > 0) {
        const headings = parseInt(headingEv[0].value || "0");
        score += headings > 0 && headings < 10 ? 40 : headings >= 10 ? 30 : 10;
      }
      score += navEv.some((e) => e.value === "true") ? 30 : 0;
      score += schemaEv.some((e) => e.value === "true") ? 30 : 0;
      return Math.min(score, 100);
    }

    case "content": {
      const wordEv = evidence.filter((e) => e.indicator_code === "CE-01-I01");
      const pricingEv = evidence.filter((e) => e.indicator_code === "CE-02-I01");
      const faqEv = evidence.filter((e) => e.indicator_code === "CE-03-I01");

      let score = 0;
      if (wordEv.length > 0) {
        const words = parseInt(wordEv[0].value || "0");
        score += words >= 500 ? 40 : words >= 200 ? 25 : 10;
      }
      score += pricingEv.some((e) => e.value === "true") ? 30 : 0;
      score += faqEv.some((e) => e.value === "true") ? 30 : 0;
      return Math.min(score, 100);
    }

    case "trust": {
      const booleanEv = evidence.filter((e) => e.value === "true" || e.value === "false");
      return scoreBooleanEvidence(booleanEv);
    }

    case "ux": {
      const viewportEv = evidence.filter((e) => e.indicator_code === "UX-01-I01");
      const altEv = evidence.filter((e) => e.indicator_code === "UX-02-I01");
      const linkEv = evidence.filter((e) => e.indicator_code === "UX-03-I01");

      let score = 0;
      score += viewportEv.some((e) => e.value === "true") ? 35 : 0;
      if (altEv.length > 0) {
        const altRatio = parseInt(altEv[0].value || "0");
        score += altRatio >= 80 ? 35 : altRatio >= 50 ? 20 : 5;
      }
      if (linkEv.length > 0) {
        const links = parseInt(linkEv[0].value || "0");
        score += links >= 10 ? 30 : links >= 5 ? 20 : 5;
      }
      return Math.min(score, 100);
    }

    case "technical": {
      const httpsEv = evidence.filter((e) => e.indicator_code === "TE-01-I01");
      const loadEv = evidence.filter((e) => e.indicator_code === "TE-02-I01");
      const canonicalEv = evidence.filter((e) => e.indicator_code === "TE-03-I01");
      const robotsEv = evidence.filter((e) => e.indicator_code === "TE-04-I01");

      let score = 0;
      score += httpsEv.some((e) => e.value === "true") ? 30 : 0;
      if (loadEv.length > 0) {
        const loadTime = parseInt(loadEv[0].value || "99999");
        score += loadTime < 2000 ? 30 : loadTime < 5000 ? 20 : 5;
      }
      score += canonicalEv.some((e) => e.value === "true") ? 20 : 0;
      score += robotsEv.some((e) => e.value === "true") ? 20 : 0;
      return Math.min(score, 100);
    }

    case "competitive": {
      // Competitive position is calculated later in calculateScores
      // based on how this competitor compares to others
      return 50;
    }

    case "ecosystem": {
      const socialEv = evidence.filter((e) => e.indicator_code === "EP-01-I01");
      const externalEv = evidence.filter((e) => e.indicator_code === "EP-02-I01");

      let score = 0;
      if (socialEv.length > 0) {
        const socialCount = parseInt(socialEv[0].value || "0");
        score += socialCount >= 3 ? 50 : socialCount >= 1 ? 30 : 0;
      }
      if (externalEv.length > 0) {
        const extCount = parseInt(externalEv[0].value || "0");
        score += extCount >= 5 ? 50 : extCount >= 1 ? 25 : 0;
      }
      return Math.min(score, 100);
    }

    default:
      return 50;
  }
}

export interface ScoringResult {
  competitorId: string;
  dimensionScores: { code: string; score: number; confidence: string }[];
  overallScore: number;
  rating: string;
}

export function calculateScores(evaluationId: string): ScoringResult[] {
  const competitors = query<Competitor>(
    "SELECT * FROM competitors WHERE evaluation_id = ?",
    [evaluationId]
  );

  if (competitors.length === 0) return [];

  // Clear old dimension scores
  run("DELETE FROM dimension_scores WHERE evaluation_id = ?", [evaluationId]);

  const results: ScoringResult[] = [];

  for (const comp of competitors) {
    const compEvidence = query<Evidence>(
      "SELECT * FROM evidence WHERE competitor_id = ?",
      [comp.id]
    );

    const dimensionScores: { code: string; score: number; confidence: string }[] = [];

    for (const dim of DIMENSIONS) {
      if (dim.code === "competitive") continue; // Skip, calculated later

      const dimEvidence = compEvidence.filter((e) => e.category === dim.category);
      const rawScore = scoreDimension(dim.category, dimEvidence);
      const confidence = getConfidenceLevel(dimEvidence.length);

      dimensionScores.push({ code: dim.code, score: rawScore, confidence });

      // Store in DB
      run(
        "INSERT INTO dimension_scores (id, evaluation_id, competitor_id, dimension_code, score, max_score) VALUES (?, ?, ?, ?, ?, 100)",
        [generateId(), evaluationId, comp.id, dim.code, rawScore]
      );

    }

    results.push({ competitorId: comp.id, dimensionScores, overallScore: 0, rating: "foundation" });
  }

  // Calculate competitive position: how each competitor compares to the average of others
  const _nonCompetitiveDims = DIMENSIONS.filter((d) => d.code !== "competitive");
  for (let i = 0; i < results.length; i++) {
    const myScores = results[i].dimensionScores;
    const myAvg = myScores.length > 0
      ? myScores.reduce((sum, s) => sum + s.score, 0) / myScores.length
      : 0;

    // Average of all other competitors' dimension scores
    const otherAvgs: number[] = [];
    for (let j = 0; j < results.length; j++) {
      if (j === i) continue;
      const otherScores = results[j].dimensionScores;
      if (otherScores.length > 0) {
        otherAvgs.push(otherScores.reduce((sum, s) => sum + s.score, 0) / otherScores.length);
      }
    }
    const otherAvg = otherAvgs.length > 0
      ? otherAvgs.reduce((a, b) => a + b, 0) / otherAvgs.length
      : 0;

    // Competitive score: how far above/below the competitor is from the pack
    // If above average: higher score. If below: lower score.
    const diff = myAvg - otherAvg;
    let compScore = 50 + diff * 2; // Scale the difference
    compScore = Math.max(0, Math.min(100, Math.round(compScore)));

    const compEvidence = query<Evidence>(
      "SELECT * FROM evidence WHERE competitor_id = ?",
      [competitors[i].id]
    );
    const confidence = getConfidenceLevel(compEvidence.length);

    results[i].dimensionScores.push({ code: "competitive", score: compScore, confidence });

    run(
      "INSERT INTO dimension_scores (id, evaluation_id, competitor_id, dimension_code, score, max_score) VALUES (?, ?, ?, ?, ?, 100)",
      [generateId(), evaluationId, competitors[i].id, "competitive", compScore]
    );

    // Now calculate overall score with all dimensions including competitive
    let wSum = 0;
    let wTotal = 0;
    for (const dim of DIMENSIONS) {
      const ds = results[i].dimensionScores.find((d) => d.code === dim.code);
      if (ds) {
        wSum += ds.score * dim.weight;
        wTotal += dim.weight;
      }
    }
    const overallScore = wTotal > 0 ? Math.round(wSum / wTotal) : 0;
    results[i].overallScore = overallScore;
    results[i].rating = getRating(overallScore);

    // Update competitor score
    run("UPDATE competitors SET score = ? WHERE id = ?", [overallScore, competitors[i].id]);
  }

  // Update evaluation overall score (average of all competitors)
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + r.overallScore, 0) / results.length)
    : 0;

  const totalEvidence = query<{ count: number }>(
    "SELECT COUNT(*) as count FROM evidence WHERE evaluation_id = ?",
    [evaluationId]
  )[0]?.count || 0;

  const confidenceScore = totalEvidence >= 20 ? 90 : totalEvidence >= 10 ? 70 : totalEvidence >= 5 ? 50 : 30;

  run(
    "UPDATE evaluations SET rrs_score = ?, confidence_score = ?, rating = ?, status = 'completed', updated_at = datetime('now') WHERE id = ?",
    [avgScore, confidenceScore, getRating(avgScore), evaluationId]
  );

  // Record score history for benchmark tracking
  const dimensionSummary = DIMENSIONS.map((dim) => {
    const dimScores = results.flatMap((r) => r.dimensionScores.filter((ds) => ds.code === dim.code).map((ds) => ds.score));
    const avg = dimScores.length > 0 ? Math.round(dimScores.reduce((a, b) => a + b, 0) / dimScores.length) : 0;
    return { code: dim.code, score: avg };
  });

  run(
    "INSERT INTO score_history (id, evaluation_id, rrs_score, rating, dimension_scores) VALUES (?, ?, ?, ?, ?)",
    [generateId(), evaluationId, avgScore, getRating(avgScore), JSON.stringify(dimensionSummary)]
  );

  return results;
}
