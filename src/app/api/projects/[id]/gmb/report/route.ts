import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";

interface GmbAuditRow {
  id: string;
  evaluation_id: string;
  search_query: string;
  location: string;
  lps_score: number;
  rating: string;
  your_rank: number | null;
  total_found: number;
  avg_rating: number;
  avg_review_count: number;
  findings_json: string | null;
  recommendations_json: string | null;
  created_at: string;
}

interface GmbBusinessRow {
  id: string;
  place_id: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  reviews_count: number;
  category_name: string;
  categories: string | null;
  is_open: number;
  opening_hours: string | null;
  latitude: number;
  longitude: number;
  url: string;
  photo_count: number;
  question_count: number;
  description: string;
  city: string;
  state: string;
  postal_code: string;
  price_level: string;
  permanently_closed: number;
  rank: number;
  is_your_business: number;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;

  const audit = await queryOne<GmbAuditRow>(
    `SELECT id, evaluation_id, search_query, location, lps_score, rating,
            your_rank, total_found, avg_rating, avg_review_count,
            findings_json, recommendations_json, created_at
     FROM gmb_audits WHERE project_id = ? ORDER BY created_at DESC LIMIT 1`,
    [projectId]
  );

  if (!audit) {
    return NextResponse.json({ error: "No GMB audit found" }, { status: 404 });
  }

  const businesses = await query<GmbBusinessRow>(
    `SELECT * FROM gmb_businesses WHERE gmb_audit_id = ? ORDER BY rank ASC`,
    [audit.id]
  );

  let findings: unknown[] = [];
  let recommendations: unknown[] = [];
  try {
    findings = audit.findings_json ? JSON.parse(audit.findings_json) : [];
  } catch {
    findings = [];
  }
  try {
    recommendations = audit.recommendations_json ? JSON.parse(audit.recommendations_json) : [];
  } catch {
    recommendations = [];
  }

  return NextResponse.json({
    audit: {
      id: audit.id,
      searchQuery: audit.search_query,
      location: audit.location,
      lpsScore: audit.lps_score,
      rating: audit.rating,
      yourRank: audit.your_rank,
      totalFound: audit.total_found,
      avgRating: audit.avg_rating,
      avgReviewCount: audit.avg_review_count,
      createdAt: audit.created_at,
    },
    businesses: businesses.map((b) => ({
      placeId: b.place_id,
      name: b.name,
      address: b.address,
      phone: b.phone,
      website: b.website,
      rating: b.rating,
      reviewsCount: b.reviews_count,
      categoryName: b.category_name,
      categories: b.categories ? JSON.parse(b.categories) : [],
      isOpen: b.is_open === 1,
      openingHours: b.opening_hours ? JSON.parse(b.opening_hours) : [],
      latitude: b.latitude,
      longitude: b.longitude,
      url: b.url,
      photoCount: b.photo_count,
      questionCount: b.question_count,
      description: b.description,
      city: b.city,
      state: b.state,
      postalCode: b.postal_code,
      priceLevel: b.price_level,
      permanentlyClosed: b.permanently_closed === 1,
      rank: b.rank,
      isYourBusiness: b.is_your_business === 1,
    })),
    findings,
    recommendations,
  });
}
