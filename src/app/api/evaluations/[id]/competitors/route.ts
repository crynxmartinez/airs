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

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const competitorId = req.nextUrl.searchParams.get("competitorId");

    if (!competitorId) {
      return NextResponse.json({ error: "competitorId is required" }, { status: 400 });
    }

    // Verify competitor belongs to this evaluation
    const comp = await queryOne<{ id: string; competitor_type: string | null }>(
      "SELECT id, competitor_type FROM competitors WHERE id = ? AND evaluation_id = ?",
      [competitorId, id]
    );
    if (!comp) {
      return NextResponse.json({ error: "Competitor not found" }, { status: 404 });
    }

    // Foreign keys have ON DELETE CASCADE — deleting the competitor
    // automatically removes page_content, evidence, dimension_scores, coverage.
    await run("DELETE FROM competitors WHERE id = ?", [competitorId]);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[competitors DELETE] error:", err);
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to delete competitor: ${msg}` }, { status: 500 });
  }
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
