import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";
import type { Evaluation, Competitor, Evidence } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const evaluation = queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) {
    return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
  }

  const competitors = query<Competitor>(
    "SELECT * FROM competitors WHERE evaluation_id = ? ORDER BY created_at",
    [id]
  );

  const evidence = query<Evidence>(
    "SELECT * FROM evidence WHERE evaluation_id = ? ORDER BY collected_at DESC",
    [id]
  );

  return NextResponse.json({ ...evaluation, competitors, evidence });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const existing = queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!existing) {
    return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
  }

  run(
    `UPDATE evaluations SET
      primary_query = COALESCE(?, primary_query),
      search_intent = COALESCE(?, search_intent),
      digital_asset_url = COALESCE(?, digital_asset_url),
      target_audience = COALESCE(?, target_audience),
      scope = COALESCE(?, scope),
      status = COALESCE(?, status),
      rrs_score = COALESCE(?, rrs_score),
      confidence_score = COALESCE(?, confidence_score),
      rating = COALESCE(?, rating),
      updated_at = datetime('now')
    WHERE id = ?`,
    [
      body.primary_query ?? null,
      body.search_intent ?? null,
      body.digital_asset_url ?? null,
      body.target_audience ?? null,
      body.scope ?? null,
      body.status ?? null,
      body.rrs_score ?? null,
      body.confidence_score ?? null,
      body.rating ?? null,
      id,
    ]
  );

  const updated = queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  run("DELETE FROM mission_tasks WHERE mission_id IN (SELECT id FROM missions WHERE evaluation_id = ?)", [id]);
  run("DELETE FROM missions WHERE evaluation_id = ?", [id]);
  run("DELETE FROM recommendations WHERE evaluation_id = ?", [id]);
  run("DELETE FROM findings WHERE evaluation_id = ?", [id]);
  run("DELETE FROM dimension_scores WHERE evaluation_id = ?", [id]);
  run("DELETE FROM evidence WHERE evaluation_id = ?", [id]);
  run("DELETE FROM competitors WHERE evaluation_id = ?", [id]);
  run("DELETE FROM evaluations WHERE id = ?", [id]);
  return NextResponse.json({ success: true });
}
