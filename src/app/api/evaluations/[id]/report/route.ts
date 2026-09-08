/**
 * JSON for the in-app report view.
 *
 * The POST that used to live here is gone. It serialized the hygiene layer only — evaluation,
 * competitors, evidence, findings, recommendations, scores — into a `reports` table that
 * nothing ever read, and it excluded coverage, briefs and weaknesses, which is to say the
 * entire Tier 2 deliverable. Dead code producing the wrong data, and 0 rows written across the
 * project's life confirmed nobody missed it.
 *
 * The deliverable lives at `/api/evaluations/[id]/export?tier=1|2`, which renders Markdown from
 * `src/lib/export.ts`.
 */
import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import type { Evaluation, Competitor, Evidence, Finding, Recommendation, DimensionScore } from "@/types";

interface CoverageRow {
  id: string;
  evaluation_id: string;
  competitor_id: string;
  competitor_label: string;
  question: string;
  answer_type: string;
  level: string;
  score: number;
  term_coverage: number;
  specificity: number;
  is_depth_gap: number;
  passage: string | null;
  heading: string | null;
  gap_evidence: string | null;
  source_url: string | null;
  source_title: string | null;
  run_id: string;
  scored_at: string;
}

interface SubIntent {
  id: string;
  question: string;
  source: string;
  is_question: number;
}

interface AiCitation {
  id: string;
  ai_answer_id: string;
  url: string;
  quoted_passage: string | null;
  position: number | null;
  is_self: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const evaluation = await queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const competitors = await query<Competitor>("SELECT * FROM competitors WHERE evaluation_id = ? ORDER BY created_at", [id]);
  const evidence = await query<Evidence>("SELECT * FROM evidence WHERE evaluation_id = ? ORDER BY collected_at DESC", [id]);
  const findings = await query<Finding>("SELECT * FROM findings WHERE evaluation_id = ?", [id]);
  const recs = await query<Recommendation>("SELECT * FROM recommendations WHERE evaluation_id = ?", [id]);
  const scores = await query<DimensionScore & { competitor_name: string | null }>(
    `SELECT ds.*, c.competitor_name FROM dimension_scores ds JOIN competitors c ON ds.competitor_id = c.id WHERE ds.evaluation_id = ?`,
    [id]
  );

  // Coverage matrix — most recent run only
  const latestRun = await queryOne<{ id: string }>(
    "SELECT id FROM coverage_runs WHERE evaluation_id = ? ORDER BY ran_at DESC, id DESC LIMIT 1",
    [id]
  );
  const coverage: CoverageRow[] = latestRun
    ? await query<CoverageRow>("SELECT * FROM coverage WHERE run_id = ? ORDER BY question, competitor_label", [latestRun.id])
    : [];

  // Sub-intents (questions used in the evaluation)
  const subIntents = await query<SubIntent>(
    "SELECT id, question, source, is_question FROM sub_intents WHERE evaluation_id = ? ORDER BY created_at",
    [id]
  );

  // AI citations — which URLs AI engines cited for this project's queries
  const aiCitations: AiCitation[] = [];
  if (evaluation.project_id) {
    const aiAnswers = await query<{ id: string }>(
      "SELECT id FROM ai_answers WHERE project_id = ? ORDER BY captured_at DESC LIMIT 50",
      [evaluation.project_id]
    );
    if (aiAnswers.length > 0) {
      const answerIds = aiAnswers.map((a) => a.id);
      const placeholders = answerIds.map(() => "?").join(",");
      const cites = await query<AiCitation>(
        `SELECT id, ai_answer_id, url, quoted_passage, position, is_self FROM ai_citations WHERE ai_answer_id IN (${placeholders}) ORDER BY position`,
        answerIds
      );
      aiCitations.push(...cites);
    }
  }

  return NextResponse.json({
    evaluation,
    competitors,
    evidence,
    findings,
    recommendations: recs,
    scores,
    coverage,
    subIntents,
    aiCitations,
  });
}

