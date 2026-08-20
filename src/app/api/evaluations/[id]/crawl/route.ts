import { NextRequest, NextResponse } from "next/server";
import { run, generateId } from "@/lib/db";
import { crawlCompetitor } from "@/lib/crawler";
import { calculateScores } from "@/lib/scoring";
import { generateFindings } from "@/lib/findings";
import { generateRecommendations } from "@/lib/recommendations";

export async function POST(req: NextRequest) {
  const { url, evaluation_id, competitor_id } = await req.json();

  if (!url || !evaluation_id || !competitor_id) {
    return NextResponse.json({ error: "url, evaluation_id, and competitor_id are required" }, { status: 400 });
  }

  try {
    const { evidence, title, description, pagesCrawled, pages, content } = await crawlCompetitor(url);

    await run("UPDATE competitors SET title = COALESCE(?, title), description = COALESCE(?, description) WHERE id = ?", [title || null, description || null, competitor_id]);

    // Replace this competitor's evidence rather than appending to it. Stacking
    // runs left stale values in place, and because the scorers treat a category
    // as satisfied when *any* row says "true", a signal could never go back to
    // false once observed — a competitor who removed their FAQ still scored for it.
    await run("DELETE FROM evidence WHERE competitor_id = ?", [competitor_id]);

    for (const item of evidence) {
      await run(
        `INSERT INTO evidence (id, evaluation_id, competitor_id, category, indicator_code, observation, source_url, evidence_type, confidence_level, value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), evaluation_id, competitor_id, item.category, item.indicator_code, item.observation, item.source_url, item.evidence_type, item.confidence_level, item.value]
      );
    }

    // Persist the readable content of every crawled page. Evidence records what a
    // page scored; this records what it actually says, which is what coverage
    // analysis needs to ask "does this page answer question X".
    await run("DELETE FROM page_content WHERE competitor_id = ?", [competitor_id]);

    for (const page of content) {
      await run(
        `INSERT INTO page_content (id, evaluation_id, competitor_id, url, title, meta_desc, headings, sections, main_text, word_count, has_ordered_list, has_table, published_at, modified_at, rendered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          evaluation_id,
          competitor_id,
          page.url,
          page.title || null,
          page.metaDesc || null,
          JSON.stringify(page.headings),
          JSON.stringify(page.sections),
          page.mainText || null,
          page.wordCount,
          page.hasOrderedList ? 1 : 0,
          page.hasTable ? 1 : 0,
          page.publishedAt,
          page.modifiedAt,
          page.rendered ? 1 : 0,
        ]
      );
    }

    await calculateScores(evaluation_id);
    await generateFindings(evaluation_id);
    await generateRecommendations(evaluation_id);

    return NextResponse.json({
      evidence_count: evidence.length,
      pages_crawled: pagesCrawled,
      pages_stored: content.length,
      headings_captured: content.reduce((sum, p) => sum + p.headings.length, 0),
      title,
      description,
      pages,
      scored: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Crawl failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
