import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, generateId } from "@/lib/db";
import type { Evaluation, Competitor, Evidence, Finding, Recommendation, DimensionScore } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const evaluation = queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const competitors = query<Competitor>("SELECT * FROM competitors WHERE evaluation_id = ?", [id]);
  const evidence = query<Evidence>("SELECT * FROM evidence WHERE evaluation_id = ?", [id]);
  const findings = query<Finding>("SELECT * FROM findings WHERE evaluation_id = ?", [id]);
  const recs = query<Recommendation>("SELECT * FROM recommendations WHERE evaluation_id = ?", [id]);
  const scores = query<DimensionScore & { competitor_name: string | null }>(
    `SELECT ds.*, c.competitor_name FROM dimension_scores ds JOIN competitors c ON ds.competitor_id = c.id WHERE ds.evaluation_id = ?`,
    [id]
  );

  return NextResponse.json({ evaluation, competitors, evidence, findings, recommendations: recs, scores });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const evaluation = queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const competitors = query<Competitor>("SELECT * FROM competitors WHERE evaluation_id = ?", [id]);
  const evidence = query<Evidence>("SELECT * FROM evidence WHERE evaluation_id = ?", [id]);
  const findings = query<Finding>("SELECT * FROM findings WHERE evaluation_id = ?", [id]);
  const recs = query<Recommendation>("SELECT * FROM recommendations WHERE evaluation_id = ?", [id]);
  const scores = query<DimensionScore & { competitor_name: string | null }>(
    `SELECT ds.*, c.competitor_name FROM dimension_scores ds JOIN competitors c ON ds.competitor_id = c.id WHERE ds.evaluation_id = ?`,
    [id]
  );

  const reportId = generateId();
  const content = JSON.stringify({ evaluation, competitors, evidence, findings, recommendations: recs, scores });
  run("INSERT INTO reports (id, evaluation_id, content) VALUES (?, ?, ?)", [reportId, id, content]);

  return NextResponse.json({ id: reportId, evaluation, competitors, evidence, findings, recommendations: recs, scores }, { status: 201 });
}
