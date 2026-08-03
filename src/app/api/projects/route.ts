import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, generateId } from "@/lib/db";
import type { Project } from "@/types";

export async function GET() {
  const projects = query<Project & { evaluation_count: number; competitor_count: number }>(`
    SELECT p.*,
      (SELECT COUNT(*) FROM evaluations WHERE project_id = p.id) as evaluation_count,
      (SELECT COUNT(*) FROM competitors WHERE evaluation_id IN (SELECT id FROM evaluations WHERE project_id = p.id)) as competitor_count
    FROM projects p
    ORDER BY p.created_at DESC
  `);

  return NextResponse.json(projects);
}

export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.name) {
    return NextResponse.json({ error: "Project name is required" }, { status: 400 });
  }

  const id = generateId();

  run(
    "INSERT INTO projects (id, name, description) VALUES (?, ?, ?)",
    [id, body.name, body.description ?? null]
  );

  const project = queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]);
  return NextResponse.json(project, { status: 201 });
}
