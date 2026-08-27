import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, generateId } from "@/lib/db";
import type { Project } from "@/types";

export async function GET() {
  const projects = await query<Project & { evaluation_count: number; competitor_count: number }>(`
    SELECT p.*,
      (SELECT COUNT(*) FROM evaluations WHERE project_id = p.id) as evaluation_count,
      (SELECT COUNT(*) FROM competitors WHERE evaluation_id IN (SELECT id FROM evaluations WHERE project_id = p.id)) as competitor_count
    FROM projects p
    ORDER BY p.created_at DESC
  `);

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.name) {
      return NextResponse.json({ error: "Project name is required" }, { status: 400 });
    }

    const id = generateId();

    await run(
      "INSERT INTO projects (id, name, description, target_location) VALUES (?, ?, ?, ?)",
      [id, body.name, body.description ?? null, body.target_location ?? null]
    );

    const project = await queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]);
    return NextResponse.json(project, { status: 201 });
  } catch (err) {
    console.error("[projects POST] Error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create project" },
      { status: 500 }
    );
  }
}
