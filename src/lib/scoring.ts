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

/**
 * Returns null when there is no evidence for the category. A dimension we could
 * not measure is not the same as one that failed every check, and scoring it 0
 * made an un-crawlable competitor look maximally weak.
 */
function scoreDimension(category: string, evidence: Evidence[]): number | null {
  if (evidence.length === 0) return null;

  switch (category) {
    case "structural": {
      const headingEv = evidence.filter((e) => e.indicator_code === "ST-01-I01");
      const h1Ev = evidence.filter((e) => e.indicator_code === "ST-01-I02");
      const navEv = evidence.filter((e) => e.indicator_code === "ST-02-I01");
      const schemaEv = evidence.filter((e) => e.indicator_code === "ST-03-I01");

      let score = 0;
      // A single H1 is the actual signal; a high total heading count means a
      // richly structured page, so it is no longer penalised.
      if (h1Ev.length > 0) {
        score += parseInt(h1Ev[0].value || "0") === 1 ? 20 : 5;
      }
      if (headingEv.length > 0) {
        const headings = parseInt(headingEv[0].value || "0");
        score += headings >= 3 ? 20 : headings > 0 ? 10 : 0;
      } else if (h1Ev.length === 0) {
        // Neither heading indicator present (legacy evidence): award the
        // structural budget neutrally rather than zeroing it.
        score += 20;
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

      // A missing robots meta tag is not a defect — the default is index,follow —
      // so it no longer carries score. Its 20 points are redistributed across the
      // three checks that do indicate technical quality.
      let score = 0;
      score += httpsEv.some((e) => e.value === "true") ? 35 : 0;
      if (loadEv.length > 0) {
        const loadTime = parseInt(loadEv[0].value || "99999");
        score += loadTime < 2000 ? 35 : loadTime < 5000 ? 20 : 5;
      }
      score += canonicalEv.some((e) => e.value === "true") ? 30 : 0;
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

export async function calculateScores(evaluationId: string): Promise<ScoringResult[]> {
  const competitors = await query<Competitor>(
    "SELECT * FROM competitors WHERE evaluation_id = ?",
    [evaluationId]
  );

  if (competitors.length === 0) return [];

  // Clear old dimension scores
  await run("DELETE FROM dimension_scores WHERE evaluation_id = ?", [evaluationId]);

  const results: ScoringResult[] = [];

  for (const comp of competitors) {
    const compEvidence = await query<Evidence>(
      "SELECT * FROM evidence WHERE competitor_id = ?",
      [comp.id]
    );

    const dimensionScores: { code: string; score: number; confidence: string }[] = [];

    for (const dim of DIMENSIONS) {
      if (dim.code === "competitive") continue; // Skip, calculated later

      const dimEvidence = compEvidence.filter((e) => e.category === dim.category);
      const rawScore = scoreDimension(dim.category, dimEvidence);

      // No evidence for this category — leave it unscored rather than recording a
      // 0 that reads as total failure. The weighted average below renormalises
      // over whichever dimensions were actually measured.
      if (rawScore === null) continue;

      const confidence = getConfidenceLevel(dimEvidence.length);

      dimensionScores.push({ code: dim.code, score: rawScore, confidence });

      // Store in DB
      await run(
        "INSERT INTO dimension_scores (id, evaluation_id, competitor_id, dimension_code, score, max_score) VALUES (?, ?, ?, ?, ?, 100)",
        [generateId(), evaluationId, comp.id, dim.code, rawScore]
      );

    }

    results.push({ competitorId: comp.id, dimensionScores, overallScore: 0, rating: "foundation" });
  }

  // Calculate competitive position: how each competitor compares to the average of others
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

    const compEvidence = await query<Evidence>(
      "SELECT * FROM evidence WHERE competitor_id = ?",
      [competitors[i].id]
    );
    const confidence = getConfidenceLevel(compEvidence.length);

    results[i].dimensionScores.push({ code: "competitive", score: compScore, confidence });

    await run(
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
    await run("UPDATE competitors SET score = ? WHERE id = ?", [overallScore, competitors[i].id]);
  }

  // The evaluation's RRS describes the competitive field, so your own asset is
  // scored above (its dimension scores are stored) but excluded from the average.
  const fieldResults = results.filter((r) => {
    const comp = competitors.find((c) => c.id === r.competitorId);
    return comp?.competitor_type !== "self";
  });

  const avgScore = fieldResults.length > 0
    ? Math.round(fieldResults.reduce((sum, r) => sum + r.overallScore, 0) / fieldResults.length)
    : 0;

  const totalEvidence = (await query<{ count: number }>(
    "SELECT COUNT(*) as count FROM evidence WHERE evaluation_id = ?",
    [evaluationId]
  ))[0]?.count || 0;

  const confidenceScore = totalEvidence >= 20 ? 90 : totalEvidence >= 10 ? 70 : totalEvidence >= 5 ? 50 : 30;

  await run(
    "UPDATE evaluations SET rrs_score = ?, confidence_score = ?, rating = ?, status = 'completed', updated_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?",
    [avgScore, confidenceScore, getRating(avgScore), evaluationId]
  );

  return results;
}
