import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const audits = await query<{ id: string; recommendations_json: string; created_at: string }>(
    "SELECT id, recommendations_json, created_at FROM gmb_audits WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
    [projectId]
  );

  if (audits.length === 0) {
    return NextResponse.json({ error: "No GMB audit found" }, { status: 404 });
  }

  const audit = audits[0];
  let recommendations = [];
  try {
    recommendations = audit.recommendations_json ? JSON.parse(audit.recommendations_json) : [];
  } catch {
    recommendations = [];
  }

  return NextResponse.json({ recommendations, auditId: audit.id, createdAt: audit.created_at });
}
