import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import type { Project } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  return NextResponse.json(project);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  const existing = queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]);
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  run(
    "UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description) WHERE id = ?",
    [body.name ?? null, body.description ?? null, id]
  );

  const updated = queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  run("DELETE FROM projects WHERE id = ?", [id]);
  return NextResponse.json({ success: true });
}
