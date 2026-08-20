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

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const evaluation = await queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const competitors = await query<Competitor>("SELECT * FROM competitors WHERE evaluation_id = ?", [id]);
  const evidence = await query<Evidence>("SELECT * FROM evidence WHERE evaluation_id = ?", [id]);
  const findings = await query<Finding>("SELECT * FROM findings WHERE evaluation_id = ?", [id]);
  const recs = await query<Recommendation>("SELECT * FROM recommendations WHERE evaluation_id = ?", [id]);
  const scores = await query<DimensionScore & { competitor_name: string | null }>(
    `SELECT ds.*, c.competitor_name FROM dimension_scores ds JOIN competitors c ON ds.competitor_id = c.id WHERE ds.evaluation_id = ?`,
    [id]
  );

  return NextResponse.json({ evaluation, competitors, evidence, findings, recommendations: recs, scores });
}

