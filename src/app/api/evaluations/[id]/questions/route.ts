import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, generateId } from "@/lib/db";

/**
 * Hand-specified questions for an evaluation.
 *
 * `demand.ts` discovers questions you would never think of, which is what makes an *audit*
 * thorough. This is the other half: the three or four buying questions you already know
 * matter, typed in deliberately. Neither replaces the other, so this route adds rather than
 * overwrites, and `demand` is patched to leave `source = 'manual'` rows alone.
 *
 * No migration was needed. `sub_intents.source` is plain TEXT — the value list in the schema
 * is a comment, not a CHECK constraint — so `manual` was already legal.
 */

const MAX_QUESTIONS = 50;
const MAX_LENGTH = 300;

/** GET — the manual questions on this evaluation. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const rows = await query<{ id: string; question: string; is_question: number; created_at: string }>(
    `SELECT id, question, is_question, created_at FROM sub_intents
     WHERE evaluation_id = ? AND source = 'manual'
     ORDER BY created_at, question`,
    [id]
  );
  return NextResponse.json({ questions: rows, count: rows.length });
}

/**
 * POST — add questions. Body: `{ questions: string[] }`.
 *
 * Idempotent by way of the unique index on `(evaluation_id, question)`, so re-posting the
 * same list is safe and the response distinguishes added from already-present.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const evaluation = await queryOne<{ id: string }>("SELECT id FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) {
    return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const raw = (body as { questions?: unknown })?.questions;
  if (!Array.isArray(raw)) {
    return NextResponse.json(
      { error: "Body must be { questions: string[] }" },
      { status: 400 }
    );
  }

  // Normalise before deduping, or "How much does it cost?" and "how much does it cost?" become
  // two questions and every count downstream is inflated.
  const seen = new Set<string>();
  const cleaned: string[] = [];
  const rejected: { question: string; reason: string }[] = [];

  for (const item of raw) {
    if (typeof item !== "string") {
      rejected.push({ question: String(item), reason: "not a string" });
      continue;
    }
    const text = item.trim().replace(/\s+/g, " ");
    if (!text) continue;
    if (text.length > MAX_LENGTH) {
      rejected.push({ question: text.slice(0, 60) + "…", reason: `longer than ${MAX_LENGTH} chars` });
      continue;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
  }

  if (cleaned.length === 0) {
    return NextResponse.json(
      { error: "No usable questions in body", rejected },
      { status: 400 }
    );
  }
  if (cleaned.length > MAX_QUESTIONS) {
    return NextResponse.json(
      { error: `At most ${MAX_QUESTIONS} questions per request, got ${cleaned.length}` },
      { status: 400 }
    );
  }

  // Existing rows for these questions, whatever their source.
  //
  // The unique index is on `(evaluation_id, question)` and ignores `source`, so a question
  // that autocomplete already found cannot simply be inserted as `manual` — `INSERT OR IGNORE`
  // drops it without a word. Two things then go wrong, and the second is the serious one: the
  // response claims it was added, and the row keeps `source = 'autocomplete_ddg'`, which means
  // it is *not* exempt from the rebuild in `/demand` and gets deleted on the next run. A
  // question the user deliberately chose would vanish.
  //
  // So an existing question is promoted rather than inserted. That is also the honest reading
  // of the request: naming a question by hand makes it a deliberate choice regardless of what
  // first surfaced it.
  // Keyed on the lowercased question but carrying the *stored* text, because the UPDATE below
  // has to match the row as written. Look up "Is It Worth It?" and update by that string and
  // the match silently fails, leaving the row unpromoted and still due for deletion.
  const existing = new Map(
    (await query<{ question: string; source: string }>(
      "SELECT question, source FROM sub_intents WHERE evaluation_id = ?",
      [id]
    )).map((r) => [r.question.toLowerCase(), r])
  );

  const added: string[] = [];
  const promoted: string[] = [];
  const unchanged: string[] = [];

  for (const text of cleaned) {
    const prior = existing.get(text.toLowerCase());

    if (prior?.source === "manual") {
      unchanged.push(text);
      continue;
    }

    if (prior !== undefined) {
      await run(
        `UPDATE sub_intents SET source = 'manual', is_question = ?
         WHERE evaluation_id = ? AND question = ?`,
        [isQuestionShaped(text) ? 1 : 0, id, prior.question]
      );
      promoted.push(text);
      continue;
    }

    await run(
      `INSERT OR IGNORE INTO sub_intents (id, evaluation_id, question, source, seed, locale, is_question)
       VALUES (?, ?, ?, 'manual', NULL, NULL, ?)`,
      [generateId(), id, text, isQuestionShaped(text) ? 1 : 0]
    );
    added.push(text);
  }

  return NextResponse.json({
    added: added.length,
    /** Already present under another source, now `manual` and safe from the demand rebuild. */
    promoted: promoted.length,
    unchanged: unchanged.length,
    total: added.length + promoted.length + unchanged.length,
    questions: cleaned,
    rejected,
  });
}

/** DELETE — remove one manual question (`?question_id=`) or all of them. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const questionId = req.nextUrl.searchParams.get("question_id");

  if (questionId) {
    await run("DELETE FROM sub_intents WHERE id = ? AND evaluation_id = ? AND source = 'manual'", [
      questionId,
      id,
    ]);
    return NextResponse.json({ deleted: 1 });
  }

  // Scoped to `manual` so this can never take out discovered demand, which costs an API call
  // to rebuild.
  const n = (await query<{ n: number }>(
    "SELECT COUNT(*) n FROM sub_intents WHERE evaluation_id = ? AND source = 'manual'",
    [id]
  ))[0].n;
  await run("DELETE FROM sub_intents WHERE evaluation_id = ? AND source = 'manual'", [id]);
  return NextResponse.json({ deleted: n });
}

/**
 * Whether the text reads as a question.
 *
 * Only feeds `is_question`, which is a display and ordering hint. A hand-picked entry counts
 * as demand either way — that is decided by `source`, not by punctuation.
 */
function isQuestionShaped(text: string): boolean {
  return /\?/.test(text) || /^(how|what|why|which|when|where|who|is|are|do|does|can|should)\b/i.test(text);
}
