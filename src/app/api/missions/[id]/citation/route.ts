import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { computeCitationShare } from "@/lib/ai-capture";
import { getStoredGoogleCitations, checkAllGoogleCitations } from "@/lib/citation-check";
import type { CitationDashboard, Mission, Evaluation, Project } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const mission = await queryOne<Mission>("SELECT * FROM missions WHERE id = ?", [id]);
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

  try {
    const aiShare = await computeCitationShare(project.id);
    const googleCitations = await getStoredGoogleCitations(project.id);

    const history = await query<{ recorded_at: string; citation_share: number; per_engine: string | null }>(
      "SELECT recorded_at, citation_share, per_engine FROM citation_snapshots WHERE project_id = ? ORDER BY recorded_at DESC LIMIT 30",
      [project.id]
    );

    const googleShare = googleCitations.overallTotal > 0
      ? googleCitations.overallCited / googleCitations.overallTotal
      : 0;

    const dashboard: CitationDashboard = {
      ai: {
        totalQueries: aiShare.totalQueries,
        citedQueries: aiShare.citedQueries,
        citationShare: aiShare.citationShare,
        perEngine: aiShare.perEngine,
      },
      google: {
        questions: googleCitations.questions.map((q) => ({
          query: q.query,
          cited: q.cited,
          total: q.total,
          pages: q.pages.map((p) => ({
            url: p.result_url,
            title: p.result_title,
            position: p.result_position ?? 0,
            isSelf: p.is_self === 1,
          })),
        })),
        overallCited: googleCitations.overallCited,
        overallTotal: googleCitations.overallTotal,
      },
      history: history.reverse().map((h) => ({
        date: h.recorded_at,
        aiShare: h.citation_share,
        googleShare,
      })),
    };

    return NextResponse.json(dashboard);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load citation data";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const mission = await queryOne<Mission>("SELECT * FROM missions WHERE id = ?", [id]);
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

  if (!evaluation.digital_asset_url) {
    return NextResponse.json({ error: "No website URL set for this project" }, { status: 400 });
  }

  try {
    const googleResult = await checkAllGoogleCitations(project.id, evaluation.digital_asset_url);

    return NextResponse.json({
      google: {
        questions: googleResult.questions.map((q) => ({
          query: q.query,
          cited: q.cited,
          total: q.total,
          pages: q.pages.map((p) => ({
            url: p.result_url,
            title: p.result_title,
            position: p.result_position ?? 0,
            isSelf: p.is_self === 1,
          })),
        })),
        overallCited: googleResult.overallCited,
        overallTotal: googleResult.overallTotal,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Citation check failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
