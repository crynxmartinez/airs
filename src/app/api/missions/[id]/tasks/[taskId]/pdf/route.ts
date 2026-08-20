import { NextRequest, NextResponse } from "next/server";
import { queryOne } from "@/lib/db";
import { generatePdf } from "@/lib/pdf-generator";
import type { ContentBrief, Mission, Evaluation } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: missionId, taskId } = await params;

  try {
    const mission = await queryOne<Mission>("SELECT * FROM missions WHERE id = ?", [missionId]);
    if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

    const task = await queryOne<{ content_brief_id: string | null }>(
      "SELECT content_brief_id FROM mission_tasks WHERE id = ? AND mission_id = ?",
      [taskId, missionId]
    );
    if (!task || !task.content_brief_id) {
      return NextResponse.json({ error: "No content brief linked" }, { status: 400 });
    }

    const brief = await queryOne<ContentBrief>(
      "SELECT * FROM content_briefs WHERE id = ?",
      [task.content_brief_id]
    );
    if (!brief || !brief.draft_content) {
      return NextResponse.json({ error: "No content generated yet" }, { status: 400 });
    }

    const evaluation = await queryOne<Evaluation>(
      "SELECT * FROM evaluations WHERE id = ?",
      [mission.evaluation_id]
    );
    if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });

    const businessName = evaluation.digital_asset_url
      ? evaluation.digital_asset_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
      : "AIRS";

    const pdfBuffer = await generatePdf(brief.draft_content, {
      title: brief.target_heading || brief.question,
      businessName,
      date: new Date().toISOString().replace("T", " ").substring(0, 19),
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${(brief.target_heading || brief.question).replace(/[^a-z0-9]/gi, "-").toLowerCase()}.pdf"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PDF generation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
