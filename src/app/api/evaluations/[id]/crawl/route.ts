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
    const { evidence, title, description, pagesCrawled } = await crawlCompetitor(url);

    run("UPDATE competitors SET title = COALESCE(?, title), description = COALESCE(?, description) WHERE id = ?", [title || null, description || null, competitor_id]);

    for (const item of evidence) {
      run(
        `INSERT INTO evidence (id, evaluation_id, competitor_id, category, indicator_code, observation, source_url, evidence_type, confidence_level, value)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [generateId(), evaluation_id, competitor_id, item.category, item.indicator_code, item.observation, item.source_url, item.evidence_type, item.confidence_level, item.value]
      );
    }

    calculateScores(evaluation_id);
    generateFindings(evaluation_id);
    generateRecommendations(evaluation_id);

    return NextResponse.json({ evidence_count: evidence.length, pages_crawled: pagesCrawled, title, description, scored: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Crawl failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
