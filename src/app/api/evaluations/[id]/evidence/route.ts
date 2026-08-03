import { NextRequest, NextResponse } from "next/server";
import { query, run, generateId } from "@/lib/db";
import type { Evidence } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const evidence = query<Evidence>(
    "SELECT * FROM evidence WHERE evaluation_id = ? ORDER BY collected_at DESC",
    [id]
  );
  return NextResponse.json(evidence);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (Array.isArray(body)) {
    const ids: string[] = [];
    for (const item of body) {
      const evId = generateId();
      run(
        `INSERT INTO evidence (id, evaluation_id, competitor_id, category, indicator_code, observation, source_url, evidence_type, confidence_level, value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [evId, id, item.competitor_id, item.category, item.indicator_code ?? null, item.observation, item.source_url ?? null, item.evidence_type ?? null, item.confidence_level ?? null, item.value ?? null]
      );
      ids.push(evId);
    }
    const inserted = query<Evidence>(
      `SELECT * FROM evidence WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    return NextResponse.json(inserted, { status: 201 });
  }

  const evId = generateId();
  run(
    `INSERT INTO evidence (id, evaluation_id, competitor_id, category, indicator_code, observation, source_url, evidence_type, confidence_level, value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [evId, id, body.competitor_id, body.category, body.indicator_code ?? null, body.observation, body.source_url ?? null, body.evidence_type ?? null, body.confidence_level ?? null, body.value ?? null]
  );

  const evidence = query<Evidence>("SELECT * FROM evidence WHERE id = ?", [evId]);
  return NextResponse.json(evidence, { status: 201 });
}
