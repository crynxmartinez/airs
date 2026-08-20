import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, generateId } from "@/lib/db";
import { crawlCompetitor } from "@/lib/crawler";
import { calculateScores } from "@/lib/scoring";
import { generateFindings } from "@/lib/findings";
import { generateRecommendations } from "@/lib/recommendations";
import type { Competitor, Evaluation } from "@/types";

/**
 * Registers the evaluation's own digital asset as a first-class scored row
 * (`competitor_type: 'self'`) and crawls it through the same pipeline as the
 * competitive field.
 *
 * Why this exists: the previous self-audit compared your site to competitors in
 * memory and persisted nothing, so your own coverage was unknown at analysis time.
 * That made it impossible to tell a gap you can exploit from one you already fill.
 * Scoring the asset here keeps it out of the field's prevalence figures (see
 * lib/findings.ts) while making its own scores and page content available.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const self = await queryOne<Competitor>(
    "SELECT * FROM competitors WHERE evaluation_id = ? AND competitor_type = 'self'",
    [id]
  );
  if (!self) return NextResponse.json({ registered: false });

  const pages = await query<{ url: string; title: string | null; word_count: number; headings: string }>(
    "SELECT url, title, word_count, headings FROM page_content WHERE competitor_id = ? ORDER BY crawled_at",
    [self.id]
  );

  return NextResponse.json({
    registered: true,
    competitor: self,
    pages: pages.map((p) => ({
      url: p.url,
      title: p.title,
      word_count: p.word_count,
      heading_count: JSON.parse(p.headings || "[]").length,
    })),
  });
}

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const evaluation = await queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });
  if (!evaluation.digital_asset_url) {
    return NextResponse.json({ error: "This evaluation has no digital_asset_url set" }, { status: 400 });
  }

  const url = evaluation.digital_asset_url;

  try {
    // One self row per evaluation, reused across runs so history stays attached.
    let self = await queryOne<Competitor>(
      "SELECT * FROM competitors WHERE evaluation_id = ? AND competitor_type = 'self'",
      [id]
    );

    if (!self) {
      const selfId = generateId();
      await run(
        `INSERT INTO competitors (id, evaluation_id, url, competitor_name, competitor_type, discovered_via)
         VALUES (?, ?, ?, ?, 'self', 'self')`,
        [selfId, id, url, "Your site"]
      );
      self = (await queryOne<Competitor>("SELECT * FROM competitors WHERE id = ?", [selfId]))!;
    } else if (self.url !== url) {
      // The evaluation's asset URL changed — repoint the row and let the crawl refresh it.
      await run("UPDATE competitors SET url = ? WHERE id = ?", [url, self.id]);
    }

    const { evidence, title, description, pagesCrawled, pages, content } = await crawlCompetitor(url);

    await run(
      "UPDATE competitors SET title = COALESCE(?, title), description = COALESCE(?, description) WHERE id = ?",
      [title || null, description || null, self.id]
    );

    await run("DELETE FROM evidence WHERE competitor_id = ?", [self.id]);
    for (const item of evidence) {
      await run(
        `INSERT INTO evidence (id, evaluation_id, competitor_id, category, indicator_code, observation, source_url, evidence_type, confidence_level, value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), id, self.id, item.category, item.indicator_code, item.observation, item.source_url, item.evidence_type, item.confidence_level, item.value]
      );
    }

    await run("DELETE FROM page_content WHERE competitor_id = ?", [self.id]);
    for (const page of content) {
      await run(
        `INSERT INTO page_content (id, evaluation_id, competitor_id, url, title, meta_desc, headings, sections, main_text, word_count, has_ordered_list, has_table, published_at, modified_at, rendered)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          generateId(),
          id,
          self.id,
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

    // Re-run scoring so the self row gets dimension scores. The evaluation's
    // rrs_score still reflects the field only.
    const results = await calculateScores(id);
    await generateFindings(id);
    await generateRecommendations(id);

    const selfResult = results.find((r) => r.competitorId === self!.id);

    return NextResponse.json({
      registered: true,
      competitor_id: self.id,
      url,
      pages_crawled: pagesCrawled,
      pages_stored: content.length,
      evidence_count: evidence.length,
      your_score: selfResult?.overallScore ?? null,
      your_rating: selfResult?.rating ?? null,
      your_dimensions: selfResult?.dimensionScores ?? [],
      pages,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Self crawl failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
