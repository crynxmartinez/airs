import { NextRequest, NextResponse } from "next/server";
import { queryOne, query, run, generateId } from "@/lib/db";
import { computeCitationShare } from "@/lib/ai-capture";
import type { MissionTask, Mission, ContentBrief, Evaluation, Project } from "@/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: missionId, taskId } = await params;

  try {
    const task = await queryOne<MissionTask>(
      "SELECT * FROM mission_tasks WHERE id = ? AND mission_id = ?",
      [taskId, missionId]
    );
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    if (!task.content_brief_id) {
      return NextResponse.json({ error: "This task has no linked content brief" }, { status: 400 });
    }

    const brief = await queryOne<ContentBrief>(
      "SELECT * FROM content_briefs WHERE id = ?",
      [task.content_brief_id]
    );
    if (!brief) return NextResponse.json({ error: "Content brief not found" }, { status: 404 });

    const mission = await queryOne<Mission>("SELECT * FROM missions WHERE id = ?", [missionId]);
    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    const evaluation = await queryOne<Evaluation>(
      "SELECT * FROM evaluations WHERE id = ?",
      [mission.evaluation_id]
    );
    if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });

    const project = await queryOne<Project>(
      "SELECT * FROM projects WHERE id = ?",
      [evaluation.project_id]
    );
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    // Capture citation share before shipping
    let citationBefore: { totalQueries: number; citedQueries: number; citationShare: number } | null = null;
    try {
      const share = await computeCitationShare(project.id);
      citationBefore = {
        totalQueries: share.totalQueries,
        citedQueries: share.citedQueries,
        citationShare: share.citationShare,
      };
    } catch (err) {
      console.error("[ship] Failed to capture citation before:", err);
    }

    // Mark brief as shipped
    await run(
      "UPDATE content_briefs SET status = 'shipped' WHERE id = ?",
      [brief.id]
    );

    // Mark task as done
    await run(
      "UPDATE mission_tasks SET status = 'done', completed_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?",
      [taskId]
    );

    // Create outcome row
    const outcomeId = generateId();
    await run(
      `INSERT INTO outcomes (id, project_id, content_brief_id, question, citation_before, shipped_at)
       VALUES (?, ?, ?, ?, ?, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))`,
      [
        outcomeId,
        project.id,
        brief.id,
        brief.question,
        citationBefore ? Math.round(citationBefore.citationShare * 100) : 0,
      ]
    );

    // Auto-complete mission if all tasks done
    const remaining = await queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM mission_tasks WHERE mission_id = ? AND status != 'done'",
      [missionId]
    );
    if (remaining && remaining.count === 0) {
      await run(
        "UPDATE missions SET status = 'completed', completed_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ? AND status != 'completed'",
        [missionId]
      );
    }

    return NextResponse.json({
      success: true,
      outcomeId,
      citationBefore,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to ship brief";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
