import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run } from "@/lib/db";
import type { Mission, MissionTask, Evaluation, ContentBrief } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const mission = await queryOne<Mission & { audit_data: string | null }>("SELECT * FROM missions WHERE id = ?", [id]);
  if (!mission) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const tasks = await query<MissionTask>("SELECT * FROM mission_tasks WHERE mission_id = ? ORDER BY priority_score DESC", [id]);
  const evaluation = await queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [mission.evaluation_id]);

  // Load content briefs for tasks that reference them
  const briefIds = tasks.map((t) => t.content_brief_id).filter(Boolean) as string[];
  let briefsMap: Record<string, ContentBrief> = {};
  if (briefIds.length > 0) {
    const placeholders = briefIds.map(() => "?").join(",");
    const briefs = await query<ContentBrief>(
      `SELECT * FROM content_briefs WHERE id IN (${placeholders})`,
      briefIds
    );
    briefsMap = Object.fromEntries(briefs.map((b) => [b.id, b]));
  }

  const auditData = mission.audit_data ? JSON.parse(mission.audit_data) : null;
  return NextResponse.json({
    ...mission,
    tasks: tasks.map((t) => ({
      ...t,
      content_brief: t.content_brief_id ? briefsMap[t.content_brief_id] ?? null : null,
    })),
    site_url: evaluation?.digital_asset_url || null,
    audit_data: auditData,
  });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();

  if (body.name) {
    await run("UPDATE missions SET name = ? WHERE id = ?", [body.name, id]);
  }

  if (body.status) {
    // When activating a mission, deactivate all other missions for the same evaluation
    if (body.status === "active") {
      const mission = await queryOne<Mission>("SELECT evaluation_id FROM missions WHERE id = ?", [id]);
      if (mission) {
        await run("UPDATE missions SET status = 'inactive' WHERE evaluation_id = ? AND id != ? AND status = 'active'", [mission.evaluation_id, id]);
      }
    }
    await run("UPDATE missions SET status = ?, completed_at = CASE WHEN ? = 'completed' THEN to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS') ELSE NULL END WHERE id = ?", [body.status, body.status, id]);
  }

  const mission = await queryOne<Mission>("SELECT * FROM missions WHERE id = ?", [id]);
  return NextResponse.json(mission);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  await run("DELETE FROM missions WHERE id = ?", [id]);
  return NextResponse.json({ success: true });
}
