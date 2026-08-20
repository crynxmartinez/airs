import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { generateContent } from "@/lib/content-generator";
import type { MissionTask, Mission, Evaluation } from "@/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: missionId, taskId } = await params;

  try {
    const mission = await queryOne<Mission>("SELECT * FROM missions WHERE id = ?", [missionId]);
    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    const task = await queryOne<MissionTask>(
      "SELECT * FROM mission_tasks WHERE id = ? AND mission_id = ?",
      [taskId, missionId]
    );
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

    if (!task.content_brief_id) {
      return NextResponse.json({ error: "This task has no linked content brief" }, { status: 400 });
    }

    const evaluation = await queryOne<Evaluation>(
      "SELECT * FROM evaluations WHERE id = ?",
      [mission.evaluation_id]
    );
    if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });

    const project = await queryOne<{ id: string }>(
      "SELECT id FROM projects WHERE id = ?",
      [evaluation.project_id]
    );
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const result = await generateContent(taskId, task.content_brief_id, mission.evaluation_id, project.id);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Content generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
