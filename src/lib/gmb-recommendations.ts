import type { GmbFinding } from "./gmb-findings";
import type { GmbCompetitorAnalysis } from "./gmb-scraper";

export interface GmbRecommendation {
  id: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  effort: "quick" | "moderate" | "significant";
  expectedImpact: string;
  steps: string[];
  findingIds: string[];
}

export function generateGmbRecommendations(
  findings: GmbFinding[],
  analysis: GmbCompetitorAnalysis
): GmbRecommendation[] {
  const recs: GmbRecommendation[] = [];
  const your = analysis.yourBusiness;
  const usedFindings = new Set<string>();

  // 1. Not found in Maps — critical
  if (!your) {
    recs.push({
      id: "gmb-r-01",
      title: "Claim and verify your Google Business Profile",
      description: "Your business was not found in Google Maps results. This is the most critical issue — without a verified GMB listing, you cannot appear in local search, Maps, or the local pack.",
      priority: "critical",
      effort: "moderate",
      expectedImpact: "Get listed in Google Maps results and become eligible for local pack",
      steps: [
        "Go to business.google.com and search for your business name",
        "If it exists, claim ownership. If not, create a new listing",
        "Verify via postcard, phone, or email (postcard takes 5-14 days)",
        "Fill in your business name, address, phone, website, and hours",
        "Choose your primary category carefully (e.g., 'Plumber' not 'Contractor')",
        "Add secondary categories for all services you offer",
      ],
      findingIds: findings.filter((f) => f.id === "gmb-f-01").map((f) => f.id),
    });
    usedFindings.add("gmb-f-01");
  }

  // 2. Review generation campaign
  const reviewGap = your ? analysis.avgReviewCount - your.reviewsCount : 0;
  if (reviewGap > 10 || !your) {
    const targetReviews = your ? analysis.avgReviewCount : 20;
    recs.push({
      id: "gmb-r-02",
      title: `Get ${targetReviews - (your?.reviewsCount || 0)} more reviews in 30 days`,
      description: `You currently have ${your?.reviewsCount || 0} reviews. The competitor average is ${analysis.avgReviewCount}. Reviews are the #1 local ranking factor. Start a systematic review generation campaign to close this gap.`,
      priority: "critical",
      effort: "moderate",
      expectedImpact: `Climb from ${your?.reviewsCount || 0} to ${targetReviews} reviews, improving local pack ranking`,
      steps: [
        "Create a Google Review short link (business.google.com > Read reviews > Get more reviews)",
        "Add the review link to your email signature",
        "Add review request to your post-service follow-up email/SMS",
        "Print QR code cards that link to your review page for in-person requests",
        "Train staff to ask every satisfied customer: 'Can I text you a link to leave a review?'",
        "Send a monthly review request batch to past customers",
        `Target: ${Math.ceil((targetReviews - (your?.reviewsCount || 0)) / 30)} new reviews per day`,
      ],
      findingIds: findings.filter((f) => f.id === "gmb-f-03").map((f) => f.id),
    });
    usedFindings.add("gmb-f-03");
  }

  // 3. Photo optimization
  if (your) {
    const avgPhotos = analysis.competitors.length > 0
      ? Math.round(analysis.competitors.reduce((s, c) => s + (c.photoCount || 0), 0) / analysis.competitors.length)
      : 0;
    if (your.photoCount < avgPhotos || your.photoCount < 20) {
      recs.push({
        id: "gmb-r-03",
        title: `Upload ${Math.max(20 - your.photoCount, avgPhotos - your.photoCount, 0)} more photos to GMB`,
        description: `You have ${your.photoCount} photos. Businesses with 20+ photos get 35% more direction requests and 42% more website clicks from Google Maps. Photos signal an active, legitimate business.`,
        priority: "high",
        effort: "quick",
        expectedImpact: "More clicks and direction requests from Maps, improved local ranking",
        steps: [
          "Upload 3+ exterior photos (storefront from different angles, with signage visible)",
          "Upload 3+ interior photos (reception area, work space, showroom)",
          "Upload 5+ team photos (owner, staff, team group photo)",
          "Upload 5+ work sample photos (before/after, completed projects)",
          "Upload 2+ product/service photos",
          "Upload 2+ logo/branding images",
          "Add new photos monthly to show profile activity",
        ],
        findingIds: findings.filter((f) => f.id === "gmb-f-05").map((f) => f.id),
      });
      usedFindings.add("gmb-f-05");
    }
  }

  // 4. Business description
  if (your && (!your.description || your.description.length < 50)) {
    recs.push({
      id: "gmb-r-04",
      title: "Write a 750+ character business description",
      description: "Your GMB description is missing or too short. A well-written description with your services, service areas, and unique selling points helps Google match your business to local searches.",
      priority: "high",
      effort: "quick",
      expectedImpact: "Better keyword matching for local searches, improved profile completeness score",
      steps: [
        "Write a 750+ character description (max is 750 characters)",
        "Start with your primary service and service area (e.g., 'Family-owned plumbing company serving Chicago and suburbs')",
        "List your key services naturally (e.g., 'We specialize in emergency repairs, water heater installation, drain cleaning...')",
        "Include your years of experience and key differentiators",
        "Mention specific cities/neighborhoods you serve",
        "End with a call to action (e.g., 'Call us 24/7 for emergency service')",
        "Do NOT include URLs, HTML, or promotional language (Google may reject it)",
      ],
      findingIds: findings.filter((f) => f.id === "gmb-f-06").map((f) => f.id),
    });
    usedFindings.add("gmb-f-06");
  }

  // 5. Category optimization
  if (your && your.categoryName) {
    const topCategories = analysis.competitors.slice(0, 3).map((c) => c.categoryName).filter(Boolean);
    if (!topCategories.includes(your.categoryName)) {
      recs.push({
        id: "gmb-r-05",
        title: "Update your GMB primary category to match competitors",
        description: `Your category "${your.categoryName}" differs from top-ranking competitors who use: ${topCategories.join(", ")}. Category selection is one of the strongest local ranking factors.`,
        priority: "high",
        effort: "quick",
        expectedImpact: "Significant ranking improvement — category is a top 3 local ranking factor",
        steps: [
          "Go to Google Business Profile > Edit profile > Category",
          `Change primary category to match top competitors: ${topCategories[0] || "check competitors"}`,
          "Add 5-9 secondary categories for all services you offer",
          "Check competitor categories by searching your query on Maps and clicking each business",
          "Re-evaluate categories every 6 months as Google adds new options",
        ],
        findingIds: findings.filter((f) => f.id === "gmb-f-07").map((f) => f.id),
      });
      usedFindings.add("gmb-f-07");
    }
  }

  // 6. Q&A seeding
  if (your && (your.questionCount || 0) === 0) {
    recs.push({
      id: "gmb-r-06",
      title: "Seed your GMB Q&A section with 5-10 questions",
      description: "An empty Q&A section signals low engagement. Seed it with common questions and detailed answers to provide keyword-rich content for Google's local algorithm.",
      priority: "medium",
      effort: "quick",
      expectedImpact: "Additional keyword signals, improved engagement metrics",
      steps: [
        "Go to your GMB profile on Google Maps",
        "Click 'Ask a question' and write questions as a customer would",
        "Add: 'What areas do you serve?' with a list of cities/neighborhoods",
        "Add: 'Do you offer emergency service?' with hours and response time",
        "Add: 'What payment methods do you accept?'",
        "Add: 'Do you offer free estimates?'",
        "Add: 'How long have you been in business?'",
        "Answer each question with 2-3 sentences including keywords",
      ],
      findingIds: findings.filter((f) => f.id === "gmb-f-09").map((f) => f.id),
    });
    usedFindings.add("gmb-f-09");
  }

  // 7. Weekly posting
  recs.push({
    id: "gmb-r-07",
    title: "Start posting weekly GMB updates",
    description: "Businesses that post weekly get 18% more engagement on their GMB profile. Posts signal to Google that your business is active. Mix offer posts, event posts, and what's new posts.",
    priority: "medium",
    effort: "moderate",
    expectedImpact: "Improved profile activity signals, more impressions from GMB posts",
    steps: [
      "Create a content calendar with 4 post types: offers, events, what's new, products",
      "Write 4 posts at the start of each month and schedule them weekly",
      "Include a call-to-action button (Call now, Book, Learn more, Sign up)",
      "Add a photo to every post (posts with photos get 2x engagement)",
      "Track post performance in GMB insights",
      "Rotate post types: Week 1 = offer, Week 2 = what's new, Week 3 = event, Week 4 = product",
    ],
    findingIds: [],
  });

  // 8. Review response strategy
  if (your && your.reviewsCount > 0) {
    recs.push({
      id: "gmb-r-08",
      title: "Respond to all reviews within 24 hours",
      description: "Google considers review response rate as a local ranking signal. Responding to reviews also encourages more customers to leave reviews. Aim for 100% response rate within 24 hours.",
      priority: "medium",
      effort: "quick",
      expectedImpact: "Improved local ranking signal, higher review velocity from customer engagement",
      steps: [
        "Set up email/SMS notifications for new reviews in GMB settings",
        "For 5-star reviews: Thank them by name, mention something specific from their review",
        "For 3-4 star reviews: Thank them, acknowledge their feedback, invite them back",
        "For 1-2 star reviews: Apologize, address the specific issue, offer to make it right, take it offline",
        "Keep responses professional — never argue or get defensive",
        "Use a template but personalize each response",
        "Aim for 100% response rate within 24 hours",
      ],
      findingIds: findings.filter((f) => f.id === "gmb-f-04").map((f) => f.id),
    });
    usedFindings.add("gmb-f-04");
  }

  // 9. Hours and status
  if (your && (!your.openingHours || your.openingHours.length === 0)) {
    recs.push({
      id: "gmb-r-09",
      title: "Add complete business hours to GMB",
      description: "Without listed hours, you won't appear for 'open now' searches, which account for a significant portion of local queries. List complete weekly hours and keep them updated.",
      priority: "high",
      effort: "quick",
      expectedImpact: "Appear in 'open now' searches, improved profile completeness",
      steps: [
        "Go to GMB > Info > Hours",
        "Set your standard weekly hours for each day",
        "Add special hours for upcoming holidays",
        "If you have different hours for different services, note them in your description",
        "Update hours immediately if they change — stale hours hurt trust signals",
      ],
      findingIds: findings.filter((f) => f.id === "gmb-f-10").map((f) => f.id),
    });
    usedFindings.add("gmb-f-10");
  }

  // 10. Website link
  if (your && !your.website) {
    recs.push({
      id: "gmb-r-10",
      title: "Add your website URL to GMB profile",
      description: "Your GMB profile doesn't link to a website. This is a quick fix that drives traffic and signals legitimacy to Google.",
      priority: "high",
      effort: "quick",
      expectedImpact: "More website traffic from Maps, improved business legitimacy signal",
      steps: [
        "Go to GMB > Edit profile > Contact > Website",
        "Enter your primary website URL",
        "Make sure it's your main domain (not a social media page)",
        "Verify the link works by clicking it from your GMB profile",
      ],
      findingIds: findings.filter((f) => f.id === "gmb-f-08").map((f) => f.id),
    });
    usedFindings.add("gmb-f-08");
  }

  return recs.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return order[a.priority] - order[b.priority];
  });
}
