import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, generateId } from "@/lib/db";
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

  try {
  if (Array.isArray(body)) {
    const ids: string[] = [];
    for (const item of body) {
      // Check if competitor already exists (discover route may have already inserted it)
      const existing = await queryOne<{ id: string }>(
        "SELECT id FROM competitors WHERE evaluation_id = ? AND url = ?",
        [id, item.url]
      );
      if (existing) {
        // Update existing row
        await run(
          `UPDATE competitors SET
            competitor_name = COALESCE(?, competitor_name),
            title = COALESCE(?, title),
            description = COALESCE(?, description),
            competitor_type = COALESCE(?, competitor_type)
           WHERE id = ?`,
          [item.competitor_name ?? null, item.title ?? null, item.description ?? null, item.competitor_type ?? null, existing.id]
        );
        ids.push(existing.id);
      } else {
        const compId = generateId();
        await run(
          `INSERT INTO competitors (id, evaluation_id, url, competitor_name, title, description, competitor_type)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [compId, id, item.url, item.competitor_name ?? null, item.title ?? null, item.description ?? null, item.competitor_type ?? null]
        );
        ids.push(compId);
      }
    }
    const inserted = await query<Competitor>(
      `SELECT * FROM competitors WHERE id IN (${ids.map(() => "?").join(",")})`,
      ids
    );
    return NextResponse.json(inserted, { status: 201 });
  }

  // Single competitor
  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM competitors WHERE evaluation_id = ? AND url = ?",
    [id, body.url]
  );
  if (existing) {
    await run(
      `UPDATE competitors SET
        competitor_name = COALESCE(?, competitor_name),
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        competitor_type = COALESCE(?, competitor_type)
       WHERE id = ?`,
      [body.competitor_name ?? null, body.title ?? null, body.description ?? null, body.competitor_type ?? null, existing.id]
    );
    const competitor = await queryOne<Competitor>("SELECT * FROM competitors WHERE id = ?", [existing.id]);
    return NextResponse.json(competitor, { status: 201 });
  }

  const compId = generateId();
  await run(
    `INSERT INTO competitors (id, evaluation_id, url, competitor_name, title, description, competitor_type)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [compId, id, body.url, body.competitor_name ?? null, body.title ?? null, body.description ?? null, body.competitor_type ?? null]
  );

  const competitor = await queryOne<Competitor>("SELECT * FROM competitors WHERE id = ?", [compId]);
  return NextResponse.json(competitor, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to save competitors: ${msg}` }, { status: 500 });
  }
}
