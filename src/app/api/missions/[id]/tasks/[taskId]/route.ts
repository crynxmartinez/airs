import { NextRequest, NextResponse } from "next/server";
import { run, query, queryOne } from "@/lib/db";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params;
  const body = await req.json();
  if (body.status) {
    await run("UPDATE mission_tasks SET status = ?, completed_at = CASE WHEN ? = 'done' THEN to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS') ELSE NULL END WHERE id = ?", [body.status, body.status, taskId]);

    // Auto-complete the mission when every task is done.
    if (body.status === "done") {
      const remaining = await queryOne<{ count: number }>(
        "SELECT COUNT(*) as count FROM mission_tasks WHERE mission_id = ? AND status != 'done'",
        [id]
      );
      if (remaining && remaining.count === 0) {
        await run("UPDATE missions SET status = 'completed', completed_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ? AND status != 'completed'", [id]);
      }
    }
  }
  return NextResponse.json({ success: true });
}
