import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { buildGrid, gridToCsv } from "@/lib/grid";
import {
  captureRepeated,
  DISCOVERY_PROFILE,
  USD_PER_MILLION_INPUT,
  USD_PER_MILLION_OUTPUT,
} from "@/lib/ai-capture";

/**
 * The prospecting grid — business × question × retrieval count.
 *
 * Project-scoped, not evaluation-scoped, and that is deliberate. Prospecting has no client site
 * yet — that is the entire point of it — so hanging it off an evaluation would mean inventing a
 * `digital_asset_url` for a business that has not been sold anything. `ai_queries`,
 * `ai_answers` and `ai_citations` are already keyed by project, so this is the grain the data
 * is in. The audit path stays evaluation-scoped and one business at a time.
 *
 * Verdict rules live in `QUESTIONS.md`.
 */

const MAX_QUESTIONS = 10;
const MAX_RUNS = 5;

/**
 * GET — build the grid from captures that already exist.
 *
 * `?groups=a,b,c` selects capture batches; omit it to use every batch on the project.
 * `?format=csv` returns the artifact. `?roster=` is a comma-separated list of businesses that
 * *should* appear — without it, `invisible` is not computed at all.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sp = req.nextUrl.searchParams;

  const project = await queryOne<{ id: string }>("SELECT id FROM projects WHERE id = ?", [id]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const requested = splitList(sp.get("groups"));
  const groups =
    requested.length > 0
      ? requested
      : (await query<{ capture_group_id: string }>(
          `SELECT DISTINCT capture_group_id FROM ai_answers
           WHERE project_id = ? AND capture_group_id IS NOT NULL
           ORDER BY captured_at DESC`,
          [id]
        )).map((r) => r.capture_group_id);

  const grid = await buildGrid(id, groups, {
    roster: splitList(sp.get("roster")),
    selfUrl: sp.get("self") ?? undefined,
    questions: splitList(sp.get("questions"), "|"),
  });

  if (sp.get("format") === "csv") {
    return new NextResponse(gridToCsv(grid), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="prospecting-grid-${id}.csv"`,
      },
    });
  }

  return NextResponse.json(grid);
}

/**
 * POST — run the questions, then build the grid.
 *
 * Body: `{ questions: string[], runs?: number, roster?: string[], market?: string }`
 *
 * This calls `captureRepeated`, which goes straight to the API rather than through `/discover`.
 * `/discover` reuses an existing capture for the same query so discovery does not re-pay, and
 * looping through it would return the same row N times and report a confident "3 of 3" built
 * from one observation.
 *
 * Costs real money: questions × runs captures. Measured on a live 9-capture run 2026-08-09 —
 * **$0.375 each at the discovery profile, so the default 3 x 3 is about $3.40.** The response
 * reports tokens (measured) alongside dollars (tokens times an unconfirmed price).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const project = await queryOne<{ id: string }>("SELECT id FROM projects WHERE id = ?", [id]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: {
    questions?: unknown;
    runs?: unknown;
    roster?: unknown;
    market?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const questions = Array.isArray(body.questions)
    ? body.questions.filter((q): q is string => typeof q === "string" && q.trim().length > 0)
        .map((q) => q.trim())
    : [];

  if (questions.length === 0) {
    return NextResponse.json({ error: "Body must be { questions: string[] }" }, { status: 400 });
  }
  if (questions.length > MAX_QUESTIONS) {
    return NextResponse.json(
      { error: `At most ${MAX_QUESTIONS} questions per run, got ${questions.length}` },
      { status: 400 }
    );
  }

  const runs = clampInt(body.runs, 3, 1, MAX_RUNS);
  const market = typeof body.market === "string" ? body.market.trim() : "";

  // The market is anchored into the query, not left to the model. An Australian cleaning query
  // once came back with a Cleveland maid service and Yelp listings for Los Angeles — the grid
  // would have graded businesses from the wrong continent.
  const asked = questions.map((q) => (market ? `${q} in ${market}` : q));

  const groups: string[] = [];
  const failures: { question: string; run: number; error: string }[] = [];

  for (const [i, questionText] of asked.entries()) {
    const batch = await captureRepeated(
      questionText,
      id,
      runs,
      undefined,
      DISCOVERY_PROFILE
    );
    groups.push(batch.captureGroupId);
    for (const f of batch.failures) {
      failures.push({ question: questions[i], run: f.run, error: f.error });
    }
  }

  const grid = await buildGrid(id, groups, {
    roster: Array.isArray(body.roster) ? body.roster.filter((r): r is string => typeof r === "string") : [],
    questions: asked,
  });

  const spend = await queryOne<{ input: number; output: number }>(
    `SELECT SUM(input_tokens) input, SUM(output_tokens) output FROM ai_answers
     WHERE project_id = ? AND capture_group_id IN (${groups.map(() => "?").join(", ")})`,
    [id, ...groups]
  );

  return NextResponse.json({
    grid,
    captureGroupIds: groups,
    requested: asked.length * runs,
    failures,
    // Prices come from `ai-capture.ts` so there is one definition rather than two. They are
    // unconfirmed — see the warning there. Tokens are the measured number; dollars are that
    // number times an assumption.
    tokens: { input: spend?.input ?? 0, output: spend?.output ?? 0 },
    estimatedCostUsd:
      Math.round(
        (((spend?.input ?? 0) / 1_000_000) * USD_PER_MILLION_INPUT +
          ((spend?.output ?? 0) / 1_000_000) * USD_PER_MILLION_OUTPUT) *
          100
      ) / 100,
  });
}

function splitList(value: string | null, separator = ","): string[] {
  if (!value) return [];
  return value
    .split(separator)
    .map((v) => v.trim())
    .filter(Boolean);
}

function clampInt(value: unknown, fallback: number, lo: number, hi: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.trunc(n)));
}
