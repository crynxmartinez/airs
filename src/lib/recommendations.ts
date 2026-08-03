import { query, run, generateId } from "@/lib/db";
import type { Finding, Recommendation } from "@/types";

interface RecommendationTemplate {
  dimension: string;
  title: string;
  description: string;
  effort: "low" | "medium" | "high";
  impact: string;
}

const _RECOMMENDATION_TEMPLATES: Record<string, RecommendationTemplate[]> = {
  intent: [
    {
      dimension: "intent",
      title: "Improve heading structure and navigation",
      description: "Ensure exactly one H1 per page, logical H2/H3 hierarchy, and a clear navigation menu. Add Schema.org structured data (Organization, LocalBusiness, or Service).",
      effort: "low",
      impact: "+10-15 points on Intent Alignment",
    },
  ],
  content: [
    {
      dimension: "content",
      title: "Expand page content depth",
      description: "Increase word count to 500+ words with comprehensive service descriptions. Add pricing information and a FAQ section addressing common customer questions.",
      effort: "medium",
      impact: "+15-20 points on Content Excellence",
    },
    {
      dimension: "content",
      title: "Add FAQ section",
      description: "Create a FAQ section targeting common search queries related to your service. Use FAQ Schema markup for rich snippets.",
      effort: "low",
      impact: "+8-12 points on Content Excellence",
    },
  ],
  trust: [
    {
      dimension: "trust",
      title: "Add trust signals",
      description: "Display customer reviews/testimonials, license/certification badges, and author bios. Add contact information prominently.",
      effort: "medium",
      impact: "+12-18 points on Trust & Authority",
    },
    {
      dimension: "trust",
      title: "Implement review schema markup",
      description: "Add Review and AggregateRating schema.org markup to display star ratings in search results.",
      effort: "low",
      impact: "+8-10 points on Trust & Authority",
    },
  ],
  ux: [
    {
      dimension: "ux",
      title: "Improve mobile UX and accessibility",
      description: "Ensure viewport meta tag is set, all images have alt text, and internal linking is comprehensive (10+ internal links).",
      effort: "low",
      impact: "+10-15 points on User Experience",
    },
  ],
  technical: [
    {
      dimension: "technical",
      title: "Fix technical SEO issues",
      description: "Enable HTTPS, add canonical link tags, configure robots meta tag, and optimize page load time to under 2 seconds.",
      effort: "medium",
      impact: "+12-18 points on Technical Excellence",
    },
    {
      dimension: "technical",
      title: "Optimize page speed",
      description: "Compress images, minify CSS/JS, enable caching, and use a CDN. Target load time under 2 seconds.",
      effort: "high",
      impact: "+10-15 points on Technical Excellence",
    },
  ],
  competitive: [
    {
      dimension: "competitive",
      title: "Strengthen competitive positioning",
      description: "Analyze top-ranking competitors and match their content depth, feature set, and trust signals. Differentiate with unique value propositions.",
      effort: "high",
      impact: "+8-12 points on Competitive Position",
    },
  ],
  ecosystem: [
    {
      dimension: "ecosystem",
      title: "Build ecosystem presence",
      description: "Add social media links (Facebook, Instagram, LinkedIn, YouTube). Build external partnerships and directory listings for ecosystem signals.",
      effort: "medium",
      impact: "+10-15 points on Ecosystem Presence",
    },
  ],
};

export function generateRecommendations(evaluationId: string): Recommendation[] {
  run("DELETE FROM recommendations WHERE evaluation_id = ?", [evaluationId]);

  const findings = query<Finding>(
    "SELECT * FROM findings WHERE evaluation_id = ? AND type = 'opportunity' ORDER BY impact_level DESC",
    [evaluationId]
  );

  if (findings.length === 0) return [];

  const recommendations: Recommendation[] = [];

  for (const finding of findings) {
    const recId = generateId();
    const priority = finding.impact_level || "medium";

    const effort = determineEffort(finding.dimension_code || "");
    const impact = determineImpact(finding.dimension_code || "");

    run(
      `INSERT INTO recommendations (id, evaluation_id, title, description, priority, effort, expected_impact, finding_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [recId, evaluationId, extractTitle(finding.description), finding.description, priority, effort, impact, finding.id]
    );

    recommendations.push({
      id: recId,
      evaluation_id: evaluationId,
      title: extractTitle(finding.description),
      description: finding.description,
      priority: priority as "high" | "medium" | "low",
      effort: effort as "low" | "medium" | "high",
      expected_impact: impact,
      finding_ids: finding.id,
      created_at: new Date().toISOString(),
    });
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority || "low"] - priorityOrder[b.priority || "low"]);

  return recommendations;
}

function extractTitle(description: string): string {
  const firstSentence = description.split(".")[0];
  if (firstSentence.length < 80) return firstSentence;
  return firstSentence.substring(0, 75) + "...";
}

function determineEffort(dimCode: string): string {
  const effortMap: Record<string, string> = {
    intent: "low",
    content: "medium",
    trust: "medium",
    ux: "low",
    technical: "medium",
    ecosystem: "medium",
    competitive: "high",
  };
  return effortMap[dimCode] || "medium";
}

function determineImpact(dimCode: string): string {
  const impactMap: Record<string, string> = {
    intent: "+10-15 points on Intent Alignment",
    content: "+15-20 points on Content Excellence",
    trust: "+12-18 points on Trust & Authority",
    ux: "+10-15 points on User Experience",
    technical: "+12-18 points on Technical Excellence",
    ecosystem: "+10-15 points on Ecosystem Presence",
    competitive: "+8-12 points on Competitive Position",
  };
  return impactMap[dimCode] || "+5-10 points overall";
}
