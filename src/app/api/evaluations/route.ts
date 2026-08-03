import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, generateId } from "@/lib/db";
import type { Evaluation } from "@/types";

export async function GET() {
  const evaluations = query<Evaluation>(`
    SELECT e.*,
      (SELECT COUNT(*) FROM competitors WHERE evaluation_id = e.id) as competitor_count,
      (SELECT COUNT(*) FROM evidence WHERE evaluation_id = e.id) as evidence_count
    FROM evaluations e
    ORDER BY e.created_at DESC
  `);

  return NextResponse.json(evaluations);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  const id = generateId();

  run(
    `INSERT INTO evaluations (id, project_id, primary_query, search_intent, digital_asset_url, target_audience, scope, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')`,
    [
      id,
      body.project_id ?? null,
      body.primary_query,
      body.search_intent,
      body.digital_asset_url,
      body.target_audience ?? null,
      body.scope ?? null,
    ]
  );

  const evaluation = queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  return NextResponse.json(evaluation, { status: 201 });
}
