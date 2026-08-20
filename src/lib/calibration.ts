import { query, queryOne, run, generateId } from "@/lib/db";
import { predictCitations, type CandidatePage, type CitationPrediction } from "@/lib/citation";
import { assessPassages, type Passage } from "@/lib/coverage";
import { hostOf } from "@/lib/url";

interface AiCitationRow {
  id: string;
  ai_answer_id: string;
  project_id: string;
  url: string;
  quoted_passage: string | null;
  position: number | null;
  is_self: number;
}

interface AiAnswerRow {
  id: string;
  ai_query_id: string;
  project_id: string;
  engine: string;
  query: string;
  answer_text: string | null;
  captured_at: string;
}

interface PageContentRow {
  competitor_id: string;
  ctype: string | null;
  site: string;
  url: string;
  title: string | null;
  sections: string | null;
  published_at: string | null;
  modified_at: string | null;
}

export interface CalibrationResult {
  query: string;
  engine: string;
  predictedTop5: string[];
  actualCitedUrls: string[];
  precisionAt5: number;
  recallAt5: number;
  /**
   * Share of the candidate pool that was in the retrieval set — what a *random* top-5 scores.
   *
   * This exists because precision alone is misleading here, and the direction of the error is
   * flattering. Crawling the retrieval set is required for a fair test (an uncrawled host can
   * never be ranked), but it also loads the candidate pool with known positives: after
   * crawling, 30 of 38 candidates had been retrieved, so a coin-flip top-5 scores 0.79. An
   * observed 1.00 against that pool is a lift of +0.21, not a near-perfect model.
   */
  baseRate: number;
  /** precisionAt5 − baseRate. The part of the score the ranking is responsible for. */
  liftOverChance: number;
  /**
   * Ceiling on recall@5 for this query: min(5, relevant) / relevant. With 31 retrieved hosts
   * a top-5 cannot exceed 0.16, so a "low" recall figure is arithmetic, not a failure.
   */
  maxPossibleRecallAt5: number;
  overlap: string[];
}

export interface CalibrationSummary {
  totalQueries: number;
  avgPrecision: number;
  avgRecall: number;
  /** Mean base rate across queries — the score to beat, not zero. */
  avgBaseRate: number;
  /** Mean precision − mean base rate. **This is the number worth quoting.** */
  avgLiftOverChance: number;
  /** Mean recall ceiling, so a low recall figure is read as arithmetic rather than failure. */
  avgMaxPossibleRecall: number;
  /**
   * Whether the sample is large enough to mean anything. Below five queries the figures are
   * a signal, not a measurement — and a single query is an anecdote with a decimal point.
   */
  sufficientSample: boolean;
  perEngine: Record<string, { queries: number; avgPrecision: number; avgRecall: number }>;
  results: CalibrationResult[];
}

/** Below this many queries the figures are a signal, not a measurement. */
const MIN_QUERIES_FOR_SIGNAL = 5;

/**
 * Compares predicted citations against observed AI citations.
 *
 * For each query where we have both a prediction and ground truth (actual AI
 * citations captured via Claude/Perplexity), computes precision@5 and recall@5.
 * This is the real accuracy number — not the self-authored benchmark.
 */
export async function runCalibration(evaluationId: string): Promise<CalibrationSummary> {
  // Get the evaluation to find its project
  const evalRow = await queryOne<{ project_id: string; primary_query: string }>(
    "SELECT project_id, primary_query FROM evaluations WHERE id = ?",
    [evaluationId]
  );
  if (!evalRow) {
    return {
      totalQueries: 0, avgPrecision: 0, avgRecall: 0,
      avgBaseRate: 0, avgLiftOverChance: 0, avgMaxPossibleRecall: 0,
      sufficientSample: false, perEngine: {}, results: [],
    };
  }

  // Get observed AI answers and citations for this project
  const aiAnswers = await query<AiAnswerRow>(
    "SELECT * FROM ai_answers WHERE project_id = ?",
    [evalRow.project_id]
  );

  if (aiAnswers.length === 0) {
    return {
      totalQueries: 0, avgPrecision: 0, avgRecall: 0,
      avgBaseRate: 0, avgLiftOverChance: 0, avgMaxPossibleRecall: 0,
      sufficientSample: false, perEngine: {}, results: [],
    };
  }

  // Get page content for prediction
  const pages = await query<PageContentRow>(
    `SELECT p.competitor_id, c.competitor_type ctype, c.url site, p.url, p.title, p.sections,
            p.published_at, p.modified_at
     FROM page_content p JOIN competitors c ON c.id = p.competitor_id
     WHERE p.evaluation_id = ? AND p.sections IS NOT NULL`,
    [evaluationId]
  );

  // Build candidate pages
  const sites = new Map<string, { row: PageContentRow; passages: Passage[]; latest: string | null }>();
  for (const p of pages) {
    const host = hostOf(p.site);
    const key = `${p.ctype === "self" ? "self:" : ""}${host}`;
    const entry = sites.get(key) ?? { row: p, passages: [], latest: null };
    entry.passages.push({ heading: p.title ?? "", text: "" });
    try {
      for (const s of JSON.parse(p.sections ?? "[]") as { heading: string; text: string }[]) {
        entry.passages.push({ heading: s.heading, text: s.text });
      }
    } catch { /* malformed JSON */ }
    const date = p.modified_at ?? p.published_at;
    if (date && (!entry.latest || date > entry.latest)) entry.latest = date;
    sites.set(key, entry);
  }

  const fieldEntries = Array.from(sites.entries()).filter(([k]) => !k.startsWith("self:"));
  const candidates: CandidatePage[] = fieldEntries.map(([key, entry]) => ({
    id: key,
    label: hostOf(entry.row.site),
    url: entry.row.site,
    passages: entry.passages,
    lastModified: entry.latest,
  }));

  const results: CalibrationResult[] = [];
  const perEngine: Record<string, { queries: number; precisionSum: number; recallSum: number }> = {};

  for (const answer of aiAnswers) {
    // Get citations for this answer
    const citations = await query<AiCitationRow>(
      "SELECT * FROM ai_citations WHERE ai_answer_id = ?",
      [answer.id]
    );

    if (citations.length === 0) continue;

    // Run prediction for this query
    const predictions = predictCitations(answer.query, candidates);
    const predictedTop5 = predictions.slice(0, 5).map((p) => p.url);

    // Match predicted URLs against actual cited URLs (by hostname)
    const actualHosts = new Set(citations.map((c) => hostOf(c.url)));
    const predictedHosts = predictedTop5.map((u) => hostOf(u));

    const overlap = predictedHosts.filter((h) => actualHosts.has(h));
    const precisionAt5 = predictedHosts.length > 0 ? overlap.length / predictedHosts.length : 0;
    const recallAt5 = actualHosts.size > 0 ? overlap.length / actualHosts.size : 0;

    // What chance alone would score. Candidates are the crawled sites available to rank; the
    // ones that were retrieved are the positives in that pool.
    const candidateHosts = candidates.map((c) => hostOf(c.url));
    const positives = candidateHosts.filter((h) => actualHosts.has(h)).length;
    const baseRate = candidateHosts.length > 0 ? positives / candidateHosts.length : 0;

    // A top-5 cannot recall more than five of however many were retrieved.
    const maxRecall = actualHosts.size > 0 ? Math.min(5, actualHosts.size) / actualHosts.size : 0;

    results.push({
      query: answer.query,
      engine: answer.engine,
      predictedTop5,
      actualCitedUrls: citations.map((c) => c.url),
      precisionAt5: Math.round(precisionAt5 * 100) / 100,
      recallAt5: Math.round(recallAt5 * 100) / 100,
      baseRate: Math.round(baseRate * 100) / 100,
      liftOverChance: Math.round((precisionAt5 - baseRate) * 100) / 100,
      maxPossibleRecallAt5: Math.round(maxRecall * 100) / 100,
      overlap,
    });

    if (!perEngine[answer.engine]) {
      perEngine[answer.engine] = { queries: 0, precisionSum: 0, recallSum: 0 };
    }
    perEngine[answer.engine].queries++;
    perEngine[answer.engine].precisionSum += precisionAt5;
    perEngine[answer.engine].recallSum += recallAt5;
  }

  const mean = (pick: (r: CalibrationResult) => number) =>
    results.length > 0
      ? Math.round((results.reduce((sum, r) => sum + pick(r), 0) / results.length) * 100) / 100
      : 0;

  const avgPrecision = results.length > 0
    ? Math.round((results.reduce((sum, r) => sum + r.precisionAt5, 0) / results.length) * 100) / 100
    : 0;
  const avgRecall = results.length > 0
    ? Math.round((results.reduce((sum, r) => sum + r.recallAt5, 0) / results.length) * 100) / 100
    : 0;

  const perEngineSummary: CalibrationSummary["perEngine"] = {};
  for (const [engine, data] of Object.entries(perEngine)) {
    perEngineSummary[engine] = {
      queries: data.queries,
      avgPrecision: Math.round((data.precisionSum / data.queries) * 100) / 100,
      avgRecall: Math.round((data.recallSum / data.queries) * 100) / 100,
    };
  }

  return {
    totalQueries: results.length,
    avgPrecision,
    avgRecall,
    avgBaseRate: mean((r) => r.baseRate),
    avgLiftOverChance: mean((r) => r.liftOverChance),
    avgMaxPossibleRecall: mean((r) => r.maxPossibleRecallAt5),
    // Five is calibration.ts's own long-standing threshold for a meaningful sample.
    sufficientSample: results.length >= MIN_QUERIES_FOR_SIGNAL,
    perEngine: perEngineSummary,
    results,
  };
}


/**
 * Suggests weight adjustments based on calibration results.
 *
 * If precision is low and recall is high, the model is over-predicting —
 * specificity weight should increase. If precision is high and recall is low,
 * the model is too conservative — query match weight should increase.
 */
export function suggestWeightAdjustments(summary: CalibrationSummary): string[] {
  const suggestions: string[] = [];

  if (summary.totalQueries < 5) {
    suggestions.push("Need at least 5 queries with ground truth to suggest weight adjustments. Currently have " + summary.totalQueries + ".");
    return suggestions;
  }

  if (summary.avgPrecision < 0.3) {
    suggestions.push("Low precision (" + summary.avgPrecision + ") — predictions include too many non-cited pages. Consider increasing specificity weight (currently 0.20) and decreasing queryMatch weight (currently 0.30).");
  }

  if (summary.avgRecall < 0.3) {
    suggestions.push("Low recall (" + summary.avgRecall + ") — predictions miss many actually-cited pages. Consider increasing queryMatch weight (currently 0.30) and decreasing freshness weight (currently 0.10).");
  }

  if (summary.avgPrecision > 0.6 && summary.avgRecall > 0.6) {
    suggestions.push("Good calibration — precision " + summary.avgPrecision + " and recall " + summary.avgRecall + " are both above 0.6. Current weights are well-tuned.");
  }

  for (const [engine, data] of Object.entries(summary.perEngine)) {
    if (data.queries >= 3 && data.avgPrecision < 0.2) {
      suggestions.push(`${engine} has particularly low precision (${data.avgPrecision}) — the prediction model may not match this engine's retrieval behavior well.`);
    }
  }

  return suggestions;
}
