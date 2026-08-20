import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";

interface CoverageRow {
  id: string;
  evaluation_id: string;
  competitor_id: string;
  competitor_label: string;
  question: string;
  answer_type: string;
  level: string;
  score: number;
  term_coverage: number;
  specificity: number;
  is_depth_gap: number;
  passage: string | null;
  heading: string | null;
  gap_evidence: string | null;
  scored_at: string;
}

/**
 * Fetches the persisted coverage matrix for an evaluation.
 *
 * Returns the full grid: every (competitor × question) verdict that was written
 * during the last analysis run. The UI renders this as a color-coded matrix.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const rows = await query<CoverageRow>(
    "SELECT * FROM coverage WHERE evaluation_id = ? ORDER BY question, competitor_label",
    [id]
  );

  if (rows.length === 0) {
    return NextResponse.json(
      { error: "No coverage data — run analysis first" },
      { status: 400 }
    );
  }

  // Shape into a matrix: questions down, competitors across
  const questions: string[] = [];
  const competitors: { id: string; label: string }[] = [];
  const questionSet = new Set<string>();
  const competitorMap = new Map<string, string>();

  for (const r of rows) {
    if (!questionSet.has(r.question)) {
      questionSet.add(r.question);
      questions.push(r.question);
    }
    if (!competitorMap.has(r.competitor_id)) {
      competitorMap.set(r.competitor_id, r.competitor_label);
      competitors.push({ id: r.competitor_id, label: r.competitor_label });
    }
  }

  const cells: Record<string, Record<string, CoverageRow>> = {};
  for (const r of rows) {
    if (!cells[r.question]) cells[r.question] = {};
    cells[r.question][r.competitor_id] = r;
  }

  // Per-question field summary
  const fieldSummary = questions.map((q) => {
    const qRows = rows.filter((r) => r.question === q);
    const total = qRows.length;
    const answered = qRows.filter((r) => r.level === "answered").length;
    const lexical = qRows.filter((r) => r.level === "lexical").length;
    const none = qRows.filter((r) => r.level === "none").length;
    const selfRow = qRows.find((r) => r.competitor_id === "self");
    return {
      question: q,
      answer_type: qRows[0]?.answer_type ?? "definition",
      total,
      answered,
      lexical,
      none,
      gap_rate: total > 0 ? (total - answered) / total : 0,
      self_level: selfRow?.level ?? null,
      self_specificity: selfRow?.specificity ?? null,
    };
  });

  return NextResponse.json({
    evaluation_id: id,
    questions,
    competitors,
    cells,
    field_summary: fieldSummary,
    scored_at: rows[0]?.scored_at ?? null,
  });
}
