import { NextRequest, NextResponse } from "next/server";
import { scrapePage } from "@/lib/scraper";
import { run, generateId } from "@/lib/db";
import { calculateScores } from "@/lib/scoring";
import { generateFindings } from "@/lib/findings";
import { generateRecommendations } from "@/lib/recommendations";

export async function POST(req: NextRequest) {
  const { url, evaluation_id, competitor_id } = await req.json();

  if (!url || !evaluation_id || !competitor_id) {
    return NextResponse.json(
      { error: "url, evaluation_id, and competitor_id are required" },
      { status: 400 }
    );
  }

  try {
    const { evidence, title, description, content } = await scrapePage(url);

    // Update competitor title/description
    await run(
      `UPDATE competitors SET title = COALESCE(?, title), description = COALESCE(?, description) WHERE id = ?`,
      [title || null, description || null, competitor_id]
    );

    // Replace this competitor's evidence rather than appending to it — see the
    // crawl route for why stacked runs make boolean signals sticky.
    await run("DELETE FROM evidence WHERE competitor_id = ?", [competitor_id]);

    // Insert evidence
    for (const item of evidence) {
      const evId = generateId();
      await run(
        `INSERT INTO evidence (id, evaluation_id, competitor_id, category, indicator_code, observation, source_url, evidence_type, confidence_level, value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [evId, evaluation_id, competitor_id, item.category, item.indicator_code, item.observation, item.source_url, item.evidence_type, item.confidence_level, item.value]
      );
    }

    // Store what the page says, not just what it scored.
    await run("DELETE FROM page_content WHERE competitor_id = ?", [competitor_id]);
    await run(
      `INSERT INTO page_content (id, evaluation_id, competitor_id, url, title, meta_desc, headings, sections, main_text, word_count, has_ordered_list, has_table, published_at, modified_at, rendered)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        generateId(),
        evaluation_id,
        competitor_id,
        url,
        content.title || null,
        content.metaDesc || null,
        JSON.stringify(content.headings),
        JSON.stringify(content.sections),
        content.mainText || null,
        content.wordCount,
        content.hasOrderedList ? 1 : 0,
        content.hasTable ? 1 : 0,
        content.publishedAt,
        content.modifiedAt,
      ]
    );

    // Auto-score after scraping
    await calculateScores(evaluation_id);
    await generateFindings(evaluation_id);
    await generateRecommendations(evaluation_id);

    return NextResponse.json({ evidence_count: evidence.length, title, description, scored: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scrape failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
