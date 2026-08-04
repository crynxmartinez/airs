import type { GmbCompetitorAnalysis } from "./gmb-scraper";
import type { LpsScoreResult } from "./gmb-score";

export interface GmbFinding {
  id: string;
  type: "weakness" | "gap" | "opportunity" | "strength";
  category: "reviews" | "profile" | "ranking" | "engagement";
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  metric: string;
  competitorBenchmark?: string;
}

export function generateGmbFindings(
  analysis: GmbCompetitorAnalysis,
  scoreResult: LpsScoreResult,
  totalFound: number
): GmbFinding[] {
  const findings: GmbFinding[] = [];
  const your = analysis.yourBusiness;
  const competitors = analysis.competitors;
  const failedChecks = scoreResult.checks.filter((c) => c.status === "fail");
  const warnChecks = scoreResult.checks.filter((c) => c.status === "warn");

  // Not found in results — critical
  if (!your) {
    findings.push({
      id: "gmb-f-01",
      type: "weakness",
      category: "ranking",
      title: "Business not found in Google Maps results",
      description: `Your business was not found in the top ${totalFound} results for this search. This means potential customers searching on Google Maps cannot find you. Claim and verify your Google Business Profile, ensure your business name matches, and optimize your profile.`,
      impact: "high",
      metric: "Not ranked",
      competitorBenchmark: `Top result: ${analysis.topRated?.name || "N/A"}`,
    });
  }

  // Rank issues
  if (your && your.rank > 3) {
    findings.push({
      id: "gmb-f-02",
      type: "weakness",
      category: "ranking",
      title: `Ranking #${your.rank} — outside local pack`,
      description: `You're ranked #${your.rank} but the local pack (top 3) gets 70%+ of clicks. You need to climb ${your.rank - 3} positions to appear in the local pack. Focus on review velocity, photo updates, and posting regularly.`,
      impact: "high",
      metric: `#${your.rank}`,
      competitorBenchmark: "Local pack: top 3 positions",
    });
  }

  // Review count gap
  if (your) {
    const reviewGap = analysis.avgReviewCount - your.reviewsCount;
    if (reviewGap > 10) {
      findings.push({
        id: "gmb-f-03",
        type: "gap",
        category: "reviews",
        title: `Review count gap: ${reviewGap} reviews behind average`,
        description: `You have ${your.reviewsCount} reviews while the average is ${analysis.avgReviewCount}. The most-reviewed competitor has ${analysis.mostReviewed?.reviewsCount || 0} reviews. Google's local algorithm heavily weights review count. Start a systematic review generation campaign — ask every customer, add review links to email signatures, receipts, and your website.`,
        impact: "high",
        metric: `${your.reviewsCount} vs ${analysis.avgReviewCount} avg`,
        competitorBenchmark: `Top: ${analysis.mostReviewed?.name || "N/A"} (${analysis.mostReviewed?.reviewsCount || 0} reviews)`,
      });
    }
  }

  // Rating below average
  if (your && your.rating > 0 && your.rating < analysis.avgRating) {
    findings.push({
      id: "gmb-f-04",
      type: "weakness",
      category: "reviews",
      title: `Rating ${your.rating}/5 below average (${analysis.avgRating})`,
      description: `Your star rating of ${your.rating} is below the competitor average of ${analysis.avgRating}. Lower ratings reduce click-through rates and local pack ranking. Respond to all negative reviews professionally, resolve customer issues, and actively solicit reviews from satisfied customers to improve your average.`,
      impact: "medium",
      metric: `${your.rating}/5 vs ${analysis.avgRating}/5 avg`,
      competitorBenchmark: `Top rated: ${analysis.topRated?.name || "N/A"} (${analysis.topRated?.rating}/5)`,
    });
  }

  // Photo gap
  if (your) {
    const avgPhotos = competitors.length > 0
      ? Math.round(competitors.reduce((s, c) => s + (c.photoCount || 0), 0) / competitors.length)
      : 0;
    const photoGap = avgPhotos - your.photoCount;
    if (photoGap > 5) {
      findings.push({
        id: "gmb-f-05",
        type: "gap",
        category: "profile",
        title: `Photo gap: ${photoGap} photos behind average`,
        description: `You have ${your.photoCount} photos while competitors average ${avgPhotos}. Businesses with more photos get significantly more clicks and direction requests on Google Maps. Upload exterior, interior, team photos, work samples, and product images. Aim for 20+ photos minimum.`,
        impact: "medium",
        metric: `${your.photoCount} vs ${avgPhotos} avg`,
      });
    }
  }

  // Missing description
  if (your && (!your.description || your.description.length < 50)) {
    findings.push({
      id: "gmb-f-06",
      type: "gap",
      category: "profile",
      title: "Missing or short business description",
      description: "Your GMB business description is missing or too short. A 750+ character description that includes your services, service areas, and key differentiators helps Google match your business to local searches. Write a compelling description with your primary keywords naturally included.",
      impact: "medium",
      metric: your.description ? `${your.description.length} chars` : "Missing",
    });
  }

  // Category mismatch
  if (your && your.categoryName) {
    const topCategories = competitors.slice(0, 3).map((c) => c.categoryName).filter(Boolean);
    if (!topCategories.includes(your.categoryName)) {
      findings.push({
        id: "gmb-f-07",
        type: "opportunity",
        category: "profile",
        title: `Category "${your.categoryName}" differs from top competitors`,
        description: `Top-ranking competitors use categories: ${topCategories.join(", ")}. Your category "${your.categoryName}" may not match what Google expects for this search. Consider updating your primary category to match the top performers. Also add secondary categories for all services you offer.`,
        impact: "medium",
        metric: your.categoryName,
        competitorBenchmark: `Top: ${topCategories.join(", ")}`,
      });
    }
  }

  // Missing website
  if (your && !your.website) {
    findings.push({
      id: "gmb-f-08",
      type: "weakness",
      category: "profile",
      title: "No website linked to GMB profile",
      description: "Your GMB profile doesn't link to a website. This significantly reduces traffic from Maps and signals to Google that your business may be less established. Add your website URL to your GMB profile immediately.",
      impact: "high",
      metric: "Not linked",
    });
  }

  // No Q&A
  if (your && (your.questionCount || 0) === 0) {
    findings.push({
      id: "gmb-f-09",
      type: "opportunity",
      category: "engagement",
      title: "No Q&A on GMB profile",
      description: "Your profile has no Questions & Answers. Seed this section by adding 5-10 common questions yourself (e.g., 'What areas do you serve?', 'Do you offer emergency service?', 'What are your payment methods?'). Q&A provides keyword-rich content that helps Google match local queries.",
      impact: "low",
      metric: "0 questions",
    });
  }

  // No hours
  if (your && (!your.openingHours || your.openingHours.length === 0)) {
    findings.push({
      id: "gmb-f-10",
      type: "weakness",
      category: "engagement",
      title: "Business hours not listed",
      description: "Your GMB profile doesn't show business hours. 'Open now' searches are a major local search signal. List your complete weekly hours, and update them for holidays. Google prioritizes businesses with complete information.",
      impact: "medium",
      metric: "Missing",
    });
  }

  // Permanently closed
  if (your?.permanentlyClosed) {
    findings.push({
      id: "gmb-f-11",
      type: "weakness",
      category: "engagement",
      title: "Business marked as permanently closed",
      description: "Your GMB profile is marked as permanently closed. This removes you from local search results entirely. If this is an error, update your status in Google Business Profile immediately. If you've moved, create a new listing for the new location.",
      impact: "high",
      metric: "Permanently closed",
    });
  }

  // Strengths
  if (your && your.rating >= 4.5) {
    findings.push({
      id: "gmb-f-12",
      type: "strength",
      category: "reviews",
      title: `Excellent rating: ${your.rating}/5`,
      description: `Your star rating of ${your.rating} is excellent and above the competitor average of ${analysis.avgRating}. This is a strong competitive advantage — maintain it by continuing to deliver quality service and responding to all reviews.`,
      impact: "low",
      metric: `${your.rating}/5`,
    });
  }

  if (your && your.rank <= 3) {
    findings.push({
      id: "gmb-f-13",
      type: "strength",
      category: "ranking",
      title: `In the local pack at #${your.rank}`,
      description: `You're ranking #${your.rank} — in the local pack! This means you appear in the top 3 results on Google Maps and in the local pack in regular search. Maintain your position with regular posts, review responses, and profile updates.`,
      impact: "low",
      metric: `#${your.rank}`,
    });
  }

  // Map failed/warn checks to findings if not already covered
  const coveredCodes = new Set(findings.map((f) => f.category));
  for (const check of [...failedChecks, ...warnChecks]) {
    if (coveredCodes.has(check.category)) continue;
    findings.push({
      id: `gmb-f-${findings.length + 1}`,
      type: check.status === "fail" ? "weakness" : "gap",
      category: check.category,
      title: check.label,
      description: check.recommendation,
      impact: check.status === "fail" ? "high" : "medium",
      metric: check.value,
    });
  }

  return findings;
}
