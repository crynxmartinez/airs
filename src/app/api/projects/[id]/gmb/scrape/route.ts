import { NextRequest, NextResponse } from "next/server";
import { query, run, generateId } from "@/lib/db";
import type { Evaluation } from "@/types";
import { scrapeGoogleMaps, analyzeGmbCompetitors } from "@/lib/gmb-scraper";
import { calculateLpsScore } from "@/lib/gmb-score";
import { generateGmbFindings } from "@/lib/gmb-findings";
import { generateGmbRecommendations } from "@/lib/gmb-recommendations";
import { recordScoreSnapshot } from "@/lib/snapshot";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const evaluations = await query<Evaluation>(
    "SELECT * FROM evaluations WHERE project_id = ? ORDER BY created_at DESC LIMIT 1",
    [projectId]
  );

  if (evaluations.length === 0) {
    return NextResponse.json({ error: "No evaluation found for this project" }, { status: 404 });
  }

  const evaluation = evaluations[0];

  const body = await req.json();
  const { searchQuery, location, maxResults } = body;

  if (!searchQuery || !location) {
    return NextResponse.json(
      { error: "searchQuery and location are required" },
      { status: 400 }
    );
  }

  try {
    const result = await scrapeGoogleMaps(
      searchQuery,
      location,
      maxResults || 20
    );

    const analysis = analyzeGmbCompetitors(
      result.businesses,
      evaluation.digital_asset_url || undefined
    );

    // Calculate LPS score
    const scoreResult = calculateLpsScore(analysis, result.totalFound);

    // Generate findings
    const findings = generateGmbFindings(analysis, scoreResult, result.totalFound);

    // Generate recommendations
    const recommendations = generateGmbRecommendations(findings, analysis);

    // Store in DB
    const auditId = generateId();
    await run(
      `INSERT INTO gmb_audits (id, project_id, evaluation_id, search_query, location, lps_score, rating, your_rank, total_found, avg_rating, avg_review_count, findings_json, recommendations_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        auditId,
        projectId,
        evaluation.id,
        searchQuery,
        location,
        scoreResult.score,
        scoreResult.rating,
        analysis.yourBusiness?.rank || null,
        result.totalFound,
        analysis.avgRating,
        analysis.avgReviewCount,
        JSON.stringify(findings),
        JSON.stringify(recommendations),
      ]
    );

    // Store businesses
    for (const biz of result.businesses) {
      const bizId = generateId();
      const isYours = analysis.yourBusiness?.placeId === biz.placeId;
      await run(
        `INSERT INTO gmb_businesses (id, gmb_audit_id, place_id, name, address, phone, website, rating, reviews_count, category_name, categories, is_open, opening_hours, latitude, longitude, url, photo_count, question_count, description, city, state, postal_code, price_level, permanently_closed, rank, is_your_business)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          bizId,
          auditId,
          biz.placeId,
          biz.name,
          biz.address,
          biz.phone,
          biz.website,
          biz.rating,
          biz.reviewsCount,
          biz.categoryName,
          JSON.stringify(biz.categories),
          biz.isOpen ? 1 : 0,
          JSON.stringify(biz.openingHours),
          biz.latitude,
          biz.longitude,
          biz.url,
          biz.photoCount,
          biz.questionCount,
          biz.description,
          biz.city,
          biz.state,
          biz.postalCode,
          biz.priceLevel,
          biz.permanentlyClosed ? 1 : 0,
          biz.rank,
          isYours ? 1 : 0,
        ]
      );
    }

    // Auto-record multi-score snapshot (new LPS score may change composite)
    if (evaluation.rrs_score != null) {
      await recordScoreSnapshot(projectId, evaluation.id);
    }

    return NextResponse.json({
      ...result,
      analysis,
      scoreResult,
      findings,
      recommendations,
      auditId,
      evaluationId: evaluation.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "GMB scrape failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
