import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, generateId } from "@/lib/db";
import {
  acceptsIntent,
  classifyCommercialIntent,
  discoverDemand,
  subIntentsFromHeadings,
  type CommercialIntent,
} from "@/lib/demand";
import { geoConflict } from "@/lib/search";
import type { Evaluation } from "@/types";

interface SubIntentRow {
  id: string;
  question: string;
  source: string;
  seed: string | null;
  locale: string | null;
  is_question: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const rows = await query<SubIntentRow>(
    `SELECT id, question, source, seed, locale, is_question FROM sub_intents
     WHERE evaluation_id = ? ORDER BY is_question DESC, question`,
    [id]
  );

  return NextResponse.json({
    count: rows.length,
    questions: rows.filter((r) => r.is_question === 1).length,
    sub_intents: rows,
  });
}

/**
 * Discovers what people actually ask around this evaluation's topic.
 *
 * Body (all optional):
 *   topic    — override the seed; defaults to the evaluation's primary_query
 *   country  — ISO code for locale-specific results, e.g. "ph"
 *   language — defaults to "en"
 *
 * Requires no API key. Autocomplete gives real query strings; competitor headings
 * (stored by the crawl) show what the field already answers.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const evaluation = await queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const topic: string = (body.topic || evaluation.primary_query || "").trim();
  if (!topic) return NextResponse.json({ error: "No topic — set primary_query or pass a topic" }, { status: 400 });

  const country: string | undefined = body.country;
  const language: string = body.language || "en";
  const locale = country ? `${language}-${country}` : language;

  try {
    const suggestions = await discoverDemand(topic, { country, language });

    // Competitor headings: what the field chose to answer. Free — already stored.
    const headingRows = await query<{ headings: string }>(
      `SELECT p.headings FROM page_content p
       JOIN competitors c ON c.id = p.competitor_id
       WHERE p.evaluation_id = ? AND (c.competitor_type IS NULL OR c.competitor_type != 'self')`,
      [id]
    );
    const fromHeadings = new Set<string>();
    for (const row of headingRows) {
      try {
        for (const text of subIntentsFromHeadings(JSON.parse(row.headings || "[]"), topic)) {
          fromHeadings.add(text.toLowerCase());
        }
      } catch {}
    }

    // Topic-relevant is not the same as worth briefing. Two filters, both reported rather
    // than silent: a question set that quietly shrank would be indistinguishable from one
    // that came back thin.
    const dropped: { question: string; reason: string }[] = [];
    const intentCounts: Record<string, number> = {};

    const keep = (question: string): boolean => {
      const intent = classifyCommercialIntent(question);
      intentCounts[intent] = (intentCounts[intent] ?? 0) + 1;

      if (!acceptsIntent(intent, evaluation.search_intent)) {
        dropped.push({ question, reason: intent });
        return false;
      }

      // A real query from the wrong market. Briefing an Australian broker to publish
      // Californian figures is worse than briefing nothing.
      const place = geoConflict(question, evaluation.target_location);
      if (place) {
        dropped.push({ question, reason: `geo:${place}` });
        return false;
      }

      return true;
    };

    // Rebuild the discovered set so re-running reflects current data — but never touch
    // `ai_fanout` or `manual` rows.
    //
    // `ai_fanout` are sub-queries an assistant actually issued: they cost an API call and this
    // endpoint cannot regenerate them. `manual` are questions a human typed, which is the
    // stronger reason — nothing can regenerate a decision. A blanket delete here would
    // silently destroy both every time demand re-ran.
    await run(
      "DELETE FROM sub_intents WHERE evaluation_id = ? AND source NOT IN ('ai_fanout', 'manual')",
      [id]
    );

    const insert = async (question: string, source: string, seed: string | null, isQuestion: boolean, loc: string | null) =>
      await run(
        `INSERT OR IGNORE INTO sub_intents (id, evaluation_id, question, source, seed, locale, is_question)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), id, question, source, seed, loc, isQuestion ? 1 : 0]
      );

    for (const s of suggestions) {
      if (!keep(s.question)) continue;
      insert(s.question, s.source, s.seed, s.isQuestion, s.source === "autocomplete_google" ? locale : null);
    }
    for (const text of fromHeadings) {
      if (!keep(text)) continue;
      insert(text, "competitor_heading", null, /\?|^(how|what|why|which|is|do|can)\b/i.test(text), null);
    }

    const stored = await query<{ source: string; n: number; q: number }>(
      `SELECT source, COUNT(*) n, SUM(is_question) q FROM sub_intents WHERE evaluation_id = ? GROUP BY source`,
      [id]
    );

    return NextResponse.json({
      topic,
      locale,
      search_intent: evaluation.search_intent,
      target_location: evaluation.target_location,
      // Surfaced so a narrowed question set is visible rather than inferred. If almost
      // everything was dropped, the query itself is probably wrong for this client.
      by_commercial_intent: intentCounts,
      dropped_count: dropped.length,
      dropped_sample: dropped.slice(0, 10),
      seeds_expanded: new Set(suggestions.map((s) => s.seed)).size,
      by_source: stored,
      total: stored.reduce((sum, s) => sum + s.n, 0),
      questions: stored.reduce((sum, s) => sum + (s.q || 0), 0),
      // Read back from storage rather than from `suggestions`: the response previously listed
      // questions the filters had just removed, which made a working filter look broken.
      top_questions: (await query<{ question: string }>(
        `SELECT question FROM sub_intents
          WHERE evaluation_id = ? AND is_question = 1
          ORDER BY CASE WHEN source LIKE 'autocomplete%' THEN 0 ELSE 1 END, question
          LIMIT 25`,
        [id]
      )).map((r) => r.question),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Demand discovery failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
