import type { GmbCompetitorAnalysis } from "./gmb-scraper";

export interface LpsCheck {
  code: string;
  label: string;
  description: string;
  status: "pass" | "fail" | "warn";
  value: string;
  recommendation: string;
  weight: number;
  category: "reviews" | "profile" | "ranking" | "engagement";
}

export interface LpsScoreResult {
  score: number;
  rating: "excellent" | "good" | "fair" | "poor";
  checks: LpsCheck[];
  summary: { passed: number; warnings: number; failed: number };
  categoryScores: { reviews: number; profile: number; ranking: number; engagement: number };
}

export function calculateLpsScore(
  analysis: GmbCompetitorAnalysis,
  totalFound: number
): LpsScoreResult {
  const your = analysis.yourBusiness;
  const competitors = analysis.competitors;
  const checks: LpsCheck[] = [];

  // === RANKING (30 pts) ===

  // 1. Maps Rank Position
  const rank = your?.rank || null;
  checks.push({
    code: "LPS-01",
    label: "Google Maps Rank Position",
    description: "Your position in Google Maps search results. Top 3 appear in the local pack.",
    status: rank !== null && rank <= 3 ? "pass" : rank !== null && rank <= 10 ? "warn" : "fail",
    value: rank ? `#${rank} of ${totalFound}` : "Not found in results",
    recommendation: rank !== null && rank <= 3
      ? "You're in the local pack — maintain your position with regular posts and reviews."
      : rank !== null && rank <= 10
        ? `Rank #${rank} — need to reach top 3 for local pack. Focus on getting more reviews and optimizing your GMB profile.`
        : "Your business was not found in Google Maps results. Claim and optimize your GMB listing immediately.",
    weight: 15,
    category: "ranking",
  });

  // 2. Rank vs. Competitor Count
  const top3Threshold = Math.min(3, totalFound);
  checks.push({
    code: "LPS-02",
    label: "Local Pack Threshold",
    description: "How close you are to the local pack (top 3 positions in Maps).",
    status: rank !== null && rank <= top3Threshold ? "pass" : rank !== null && rank <= top3Threshold + 3 ? "warn" : "fail",
    value: rank ? `${top3Threshold - rank >= 0 ? `${top3Threshold - rank + 1} positions away from local pack` : "In local pack"}` : "Not ranked",
    recommendation: rank !== null && rank <= top3Threshold
      ? "You're in the local pack — keep optimizing to maintain position."
      : `Need to climb ${rank ? rank - top3Threshold : "?"} positions to reach the local pack. Focus on review velocity and profile completeness.`,
    weight: 15,
    category: "ranking",
  });

  // === REVIEWS (30 pts) ===

  // 3. Review Count vs. Competitors
  const yourReviews = your?.reviewsCount || 0;
  const avgReviews = analysis.avgReviewCount;
  const maxReviews = Math.max(...competitors.map((c) => c.reviewsCount), 0);
  const reviewRatio = avgReviews > 0 ? yourReviews / avgReviews : 0;
  checks.push({
    code: "LPS-03",
    label: "Review Count vs. Competitors",
    description: "More reviews signal popularity and trust to Google's local algorithm.",
    status: reviewRatio >= 1 ? "pass" : reviewRatio >= 0.5 ? "warn" : "fail",
    value: `${yourReviews} reviews (avg: ${avgReviews}, top: ${maxReviews})`,
    recommendation: reviewRatio >= 1
      ? "Your review count is above average — keep the momentum going."
      : `You have ${yourReviews} reviews vs. ${avgReviews} average. Get ${avgReviews - yourReviews > 0 ? avgReviews - yourReviews : "more"} reviews by asking every customer. Add a review link to your email signature and receipts.`,
    weight: 15,
    category: "reviews",
  });

  // 4. Rating vs. Competitors
  const yourRating = your?.rating || 0;
  const avgRating = analysis.avgRating;
  checks.push({
    code: "LPS-04",
    label: "Star Rating vs. Competitors",
    description: "Higher ratings improve local pack ranking and click-through rates.",
    status: yourRating >= 4.5 ? "pass" : yourRating >= avgRating ? "warn" : yourRating > 0 ? "warn" : "fail",
    value: yourRating > 0 ? `${yourRating}/5 (avg: ${avgRating})` : "No rating",
    recommendation: yourRating >= 4.5
      ? "Excellent rating — maintain quality and respond to all reviews."
      : yourRating >= avgRating
        ? `Your ${yourRating}/5 is above average (${avgRating}). Push for 4.5+ by addressing negative feedback.`
        : yourRating > 0
          ? `Your ${yourRating}/5 is below average (${avgRating}). Respond to negative reviews and resolve customer issues.`
          : "No reviews yet — ask your first customers to leave reviews to build your rating.",
    weight: 15,
    category: "reviews",
  });

  // === PROFILE (25 pts) ===

  // 5. Photo Count
  const yourPhotos = your?.photoCount || 0;
  const avgPhotos = competitors.length > 0
    ? Math.round(competitors.reduce((s, c) => s + (c.photoCount || 0), 0) / competitors.length)
    : 0;
  checks.push({
    code: "LPS-05",
    label: "Photo Count",
    description: "Businesses with more photos get more clicks and higher engagement in Maps.",
    status: yourPhotos >= avgPhotos && yourPhotos >= 20 ? "pass" : yourPhotos >= avgPhotos * 0.5 ? "warn" : "fail",
    value: `${yourPhotos} photos (avg: ${avgPhotos})`,
    recommendation: yourPhotos >= avgPhotos && yourPhotos >= 20
      ? "Great photo count — keep adding fresh photos monthly."
      : `You have ${yourPhotos} photos vs. ${avgPhotos} average. Add exterior, interior, team, and work sample photos. Aim for 20+.`,
    weight: 8,
    category: "profile",
  });

  // 6. Business Description
  const hasDescription = !!(your?.description && your.description.length > 50);
  checks.push({
    code: "LPS-06",
    label: "Business Description",
    description: "A detailed description helps Google understand your services and match local queries.",
    status: hasDescription ? "pass" : "fail",
    value: hasDescription ? `${your!.description.length} chars` : "Missing or too short",
    recommendation: hasDescription
      ? "Description present — ensure it includes your primary services and service areas."
      : "Add a 750+ character business description in GMB. Include your primary services, service areas, and key differentiators.",
    weight: 5,
    category: "profile",
  });

  // 7. Category Match
  const yourCategory = your?.categoryName || "";
  const topCompetitorCategories = competitors.slice(0, 3).map((c) => c.categoryName).filter(Boolean);
  const categoryMatch = topCompetitorCategories.some((c) => c === yourCategory);
  checks.push({
    code: "LPS-07",
    label: "Primary Category Match",
    description: "Your GMB category should match what top-ranking competitors use.",
    status: yourCategory && categoryMatch ? "pass" : yourCategory ? "warn" : "fail",
    value: yourCategory || "Not set",
    recommendation: yourCategory && categoryMatch
      ? "Your category matches top competitors."
      : yourCategory
        ? `Your category "${yourCategory}" differs from top competitors (${topCompetitorCategories.join(", ")}). Consider switching to match.`
        : "Set your primary GMB category. Choose the most specific category (e.g., 'Plumber' not 'Contractor').",
    weight: 7,
    category: "profile",
  });

  // 8. Website Linked
  const hasWebsite = !!(your?.website);
  checks.push({
    code: "LPS-08",
    label: "Website Linked to GMB",
    description: "Linking your website to your GMB profile drives traffic and signals legitimacy.",
    status: hasWebsite ? "pass" : "fail",
    value: hasWebsite ? "Linked" : "Not linked",
    recommendation: hasWebsite
      ? "Website is linked — ensure it's your primary domain."
      : "Add your website URL to your GMB profile. This is critical for driving traffic from Maps.",
    weight: 5,
    category: "profile",
  });

  // === ENGAGEMENT (15 pts) ===

  // 9. Open Status
  const isOpen = your?.isOpen && !your?.permanentlyClosed;
  checks.push({
    code: "LPS-09",
    label: "Business Status",
    description: "Permanently or temporarily closed businesses are deprioritized in local search.",
    status: your?.permanentlyClosed ? "fail" : your?.temporarilyClosed ? "warn" : isOpen ? "pass" : "warn",
    value: your?.permanentlyClosed ? "Permanently closed" : your?.temporarilyClosed ? "Temporarily closed" : isOpen ? "Open" : "Closed",
    recommendation: your?.permanentlyClosed
      ? "Your business is marked as permanently closed. Reopen or update your GMB listing immediately."
      : your?.temporarilyClosed
        ? "Your business is temporarily closed. Update your hours and reopen status in GMB."
        : "Business is open — keep your hours updated, especially for holidays.",
    weight: 5,
    category: "engagement",
  });

  // 10. Q&A Activity
  const yourQuestions = your?.questionCount || 0;
  const avgQuestions = competitors.length > 0
    ? Math.round(competitors.reduce((s, c) => s + (c.questionCount || 0), 0) / competitors.length)
    : 0;
  checks.push({
    code: "LPS-10",
    label: "Q&A Activity",
    description: "Questions & Answers on your GMB profile show engagement and provide keyword-rich content.",
    status: yourQuestions >= avgQuestions && yourQuestions > 0 ? "pass" : yourQuestions > 0 ? "warn" : "fail",
    value: `${yourQuestions} questions (avg: ${avgQuestions})`,
    recommendation: yourQuestions >= avgQuestions && yourQuestions > 0
      ? "Good Q&A activity — keep answering questions promptly."
      : yourQuestions > 0
        ? `You have ${yourQuestions} questions vs. ${avgQuestions} average. Seed common questions yourself.`
        : "No Q&A yet. Add 5-10 common questions and answers yourself to seed the section.",
    weight: 5,
    category: "engagement",
  });

  // 11. Hours Completeness
  const hasHours = !!(your?.openingHours && your.openingHours.length > 0);
  checks.push({
    code: "LPS-11",
    label: "Business Hours Listed",
    description: "Complete business hours help Google show you for 'open now' searches.",
    status: hasHours ? "pass" : "fail",
    value: hasHours ? `${your!.openingHours.length} days listed` : "Missing",
    recommendation: hasHours
      ? "Hours are listed — keep them updated for holidays and special schedules."
      : "Add complete business hours in GMB. 'Open now' searches are a major local search signal.",
    weight: 5,
    category: "engagement",
  });

  // Calculate score
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const earnedWeight = checks.reduce((sum, c) => {
    if (c.status === "pass") return sum + c.weight;
    if (c.status === "warn") return sum + Math.round(c.weight * 0.5);
    return sum;
  }, 0);

  const score = Math.round((earnedWeight / totalWeight) * 100);
  const rating = score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "fair" : "poor";

  const calcCategory = (cat: string) => {
    const catChecks = checks.filter((c) => c.category === cat);
    const catTotal = catChecks.reduce((s, c) => s + c.weight, 0);
    const catEarned = catChecks.reduce((s, c) => {
      if (c.status === "pass") return s + c.weight;
      if (c.status === "warn") return s + Math.round(c.weight * 0.5);
      return s;
    }, 0);
    return catTotal > 0 ? Math.round((catEarned / catTotal) * 100) : 0;
  };

  const summary = {
    passed: checks.filter((c) => c.status === "pass").length,
    warnings: checks.filter((c) => c.status === "warn").length,
    failed: checks.filter((c) => c.status === "fail").length,
  };

  return {
    score,
    rating,
    checks,
    summary,
    categoryScores: {
      reviews: calcCategory("reviews"),
      profile: calcCategory("profile"),
      ranking: calcCategory("ranking"),
      engagement: calcCategory("engagement"),
    },
  };
}
