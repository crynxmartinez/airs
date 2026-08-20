import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import type { Project } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]);
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

  const existing = await queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]);
  if (!existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  await run(
    "UPDATE projects SET name = COALESCE(?, name), description = COALESCE(?, description), target_location = COALESCE(?, target_location) WHERE id = ?",
    [body.name ?? null, body.description ?? null, body.target_location ?? null, id]
  );

  const updated = await queryOne<Project>("SELECT * FROM projects WHERE id = ?", [id]);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await run("DELETE FROM projects WHERE id = ?", [id]);
  return NextResponse.json({ success: true });
}
