import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { generateFindings } from "@/lib/findings";
import type { Finding } from "@/types";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const findings = await query<Finding>(
    "SELECT * FROM findings WHERE evaluation_id = ? ORDER BY CASE WHEN impact_level = 'high' THEN 0 WHEN impact_level = 'medium' THEN 1 ELSE 2 END",
    [id]
  );
  return NextResponse.json(findings);
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const findings = await generateFindings(id);
    return NextResponse.json({ success: true, findings, count: findings.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate findings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
