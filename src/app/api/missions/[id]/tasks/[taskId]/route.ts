import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { taskId } = await params;
  const body = await req.json();
  if (body.status) {
    run("UPDATE mission_tasks SET status = ?, completed_at = CASE WHEN ? = 'done' THEN datetime('now') ELSE NULL END WHERE id = ?", [body.status, body.status, taskId]);
  }
  return NextResponse.json({ success: true });
}
