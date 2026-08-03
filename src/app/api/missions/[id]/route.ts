import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";
import type { Mission, MissionTask, Evaluation } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mission = queryOne<Mission & { audit_data: string | null }>("SELECT * FROM missions WHERE id = ?", [id]);
  if (!mission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tasks = query<MissionTask>("SELECT * FROM mission_tasks WHERE mission_id = ?", [id]);
  const evaluation = queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [mission.evaluation_id]);
  const auditData = mission.audit_data ? JSON.parse(mission.audit_data) : null;
  return NextResponse.json({ ...mission, tasks, site_url: evaluation?.digital_asset_url || null, audit_data: auditData });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  if (body.status) {
    run("UPDATE missions SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN datetime('now') ELSE NULL END WHERE id = ?", [body.status, body.status, id]);
  }
  const mission = queryOne<Mission>("SELECT * FROM missions WHERE id = ?", [id]);
  return NextResponse.json(mission);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  run("DELETE FROM missions WHERE id = ?", [id]);
  return NextResponse.json({ success: true });
}
