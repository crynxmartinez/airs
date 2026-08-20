import { NextRequest, NextResponse } from "next/server";
import { query, run, generateId } from "@/lib/db";
import type { Competitor } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const competitors = await query<Competitor>(
    "SELECT * FROM competitors WHERE evaluation_id = ? ORDER BY created_at",
    [id]
  );
  return NextResponse.json(competitors);
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
      const compId = generateId();
      await run(
        `INSERT INTO competitors (id, evaluation_id, url, competitor_name, title, description, competitor_type)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [compId, id, item.url, item.competitor_name ?? null, item.title ?? null, item.description ?? null, item.competitor_type ?? null]
      );
      ids.push(compId);
    }
    const inserted = await query<Competitor>(
      `SELECT * FROM competitors WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    return NextResponse.json(inserted, { status: 201 });
  }

  const compId = generateId();
  await run(
    `INSERT INTO competitors (id, evaluation_id, url, competitor_name, title, description, competitor_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [compId, id, body.url, body.competitor_name ?? null, body.title ?? null, body.description ?? null, body.competitor_type ?? null]
  );

  const competitor = await query<Competitor>("SELECT * FROM competitors WHERE id = ?", [compId]);
  return NextResponse.json(competitor, { status: 201 });
}
