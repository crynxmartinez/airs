import { query } from "@/lib/db";
import type { Evidence } from "@/types";

export interface GeoCheck {
  code: string;
  label: string;
  description: string;
  status: "pass" | "fail" | "warn";
  value: string;
  recommendation: string;
  weight: number;
}

export interface GeoScoreResult {
  score: number;
  rating: "excellent" | "good" | "fair" | "poor";
  checks: GeoCheck[];
  summary: { passed: number; warnings: number; failed: number };
}

export {
  AI_CRAWLERS,
  blocksAreCloudflareManaged,
  fetchRobotsTxt,
  parseRobotsForAiCrawlers,
} from "@/lib/robots";

export async function calculateGeoScore(evaluationId: string, robotsData?: { allowed: string[]; blocked: string[]; hasRobotsTxt: boolean }): Promise<GeoScoreResult> {
  const evidence = await query<Evidence>(
    "SELECT * FROM evidence WHERE evaluation_id = ?",
    [evaluationId]
  );

  const checks: GeoCheck[] = [];

  // 1. Structured Data (Schema.org) — AI systems rely on structured data
  const schemaEv = evidence.find((e) => e.indicator_code === "ST-03-I01");
  checks.push({
    code: "GEO-01",
    label: "Structured Data (Schema.org)",
    description: "AI systems use structured data to understand your content type, services, and entity relationships",
    status: schemaEv?.value === "true" ? "pass" : "fail",
    value: schemaEv?.value === "true" ? "Present" : "Missing",
    recommendation: schemaEv?.value === "true"
      ? "Keep schema markup updated with Organization, Service, and FAQPage types"
      : "Add JSON-LD structured data: Organization, Service, and FAQPage schema at minimum. This is the #1 signal AI systems use to understand your business.",
    weight: 15,
  });

  // 2. FAQ Section — gives AI direct Q&A content to cite
  const faqEv = evidence.find((e) => e.indicator_code === "CE-03-I01");
  checks.push({
    code: "GEO-02",
    label: "FAQ Section",
    description: "FAQ pages give AI systems ready-made Q&A pairs they can cite in answers",
    status: faqEv?.value === "true" ? "pass" : "fail",
    value: faqEv?.value === "true" ? "Present" : "Missing",
    recommendation: faqEv?.value === "true"
      ? "Keep FAQ updated with new questions and add FAQPage schema markup"
      : "Add a FAQ section with 10-15 common customer questions. Use FAQPage schema so AI systems can parse the Q&A pairs directly.",
    weight: 12,
  });

  // 3. Content Depth — AI prefers comprehensive content
  const contentEv = evidence.find((e) => e.indicator_code === "CE-01-I01");
  const wordCount = parseInt(contentEv?.value || "0");
  checks.push({
    code: "GEO-03",
    label: "Content Depth",
    description: "AI systems prefer pages with comprehensive content that thoroughly covers a topic",
    status: wordCount >= 500 ? "pass" : wordCount >= 300 ? "warn" : "fail",
    value: `${wordCount} words`,
    recommendation: wordCount >= 500
      ? "Content depth is good — keep expanding with new information over time"
      : `Only ${wordCount} words. Aim for 500+ words with detailed service descriptions, benefits, and examples. AI systems skip thin pages.`,
    weight: 10,
  });

  // 4. HTTPS — AI systems won't reference insecure sites
  const httpsEv = evidence.find((e) => e.indicator_code === "TE-01-I01");
  checks.push({
    code: "GEO-04",
    label: "HTTPS Security",
    description: "AI systems filter out non-HTTPS sites as untrustworthy",
    status: httpsEv?.value === "true" ? "pass" : "fail",
    value: httpsEv?.value === "true" ? "Enabled" : "Not enabled",
    recommendation: httpsEv?.value === "true"
      ? "HTTPS is properly enabled"
      : "Enable HTTPS immediately with an SSL certificate. AI systems will not reference insecure sites.",
    weight: 10,
  });

  // 5. Contact Information — entity verification signal
  const contactEv = evidence.find((e) => e.indicator_code === "TA-02-I01");
  checks.push({
    code: "GEO-05",
    label: "Contact Information",
    description: "AI systems use contact info to verify you're a real business entity",
    status: contactEv?.value === "true" ? "pass" : "fail",
    value: contactEv?.value === "true" ? "Present" : "Missing",
    recommendation: contactEv?.value === "true"
      ? "Contact info is visible — consider adding ContactPoint schema for extra clarity"
      : "Add phone, email, and address prominently. AI systems use this to verify business legitimacy before recommending you.",
    weight: 8,
  });

  // 6. Author/Expertise Signals (E-E-A-T)
  const authorEv = evidence.find((e) => e.indicator_code === "TA-01-I01");
  checks.push({
    code: "GEO-06",
    label: "Author & Expertise Signals",
    description: "AI systems evaluate E-E-A-T (Experience, Expertise, Authority, Trust) before citing content",
    status: authorEv?.value === "true" ? "pass" : "warn",
    value: authorEv?.value === "true" ? "Present" : "Missing",
    recommendation: authorEv?.value === "true"
      ? "Author signals present — add Person schema with credentials for stronger E-E-A-T"
      : "Add author bylines, bios, and credentials. AI systems prefer content from verified experts over anonymous content.",
    weight: 8,
  });

  // 7. Reviews/Testimonials — social proof
  const reviewEv = evidence.find((e) => e.indicator_code === "TA-03-I01");
  checks.push({
    code: "GEO-07",
    label: "Reviews & Testimonials",
    description: "Reviews signal to AI systems that your business is established and trusted",
    status: reviewEv?.value === "true" ? "pass" : "warn",
    value: reviewEv?.value === "true" ? "Present" : "Missing",
    recommendation: reviewEv?.value === "true"
      ? "Reviews found — add AggregateRating schema for rich snippets"
      : "Collect and display customer reviews. Add Review and AggregateRating schema so AI systems can parse ratings.",
    weight: 7,
  });

  // 8. Licenses & Certifications
  const licenseEv = evidence.find((e) => e.indicator_code === "TA-04-I01");
  checks.push({
    code: "GEO-08",
    label: "Licenses & Certifications",
    description: "Credentials signal authority and expertise to AI systems",
    status: licenseEv?.value === "true" ? "pass" : "warn",
    value: licenseEv?.value === "true" ? "Present" : "Missing",
    recommendation: licenseEv?.value === "true"
      ? "Credentials visible — add hasCredential property in Organization schema"
      : "Display licenses and certifications prominently. AI systems factor professional credentials into recommendations.",
    weight: 5,
  });

  // 9. Social Media Presence
  const socialEv = evidence.find((e) => e.indicator_code === "EP-01-I01");
  const socialCount = parseInt(socialEv?.value || "0");
  checks.push({
    code: "GEO-09",
    label: "Social Media Presence",
    description: "Social profiles give AI systems additional context and verification of your brand",
    status: socialCount >= 2 ? "pass" : socialCount >= 1 ? "warn" : "fail",
    value: `${socialCount} social link${socialCount !== 1 ? "s" : ""}`,
    recommendation: socialCount >= 2
      ? "Good social presence — add SameAs links in Organization schema"
      : "Add links to Facebook, Instagram, LinkedIn, and YouTube. AI systems use social profiles to verify brand legitimacy.",
    weight: 5,
  });

  // 10. Clear Navigation Structure
  const navEv = evidence.find((e) => e.indicator_code === "ST-02-I01");
  checks.push({
    code: "GEO-10",
    label: "Site Navigation Structure",
    description: "Clear navigation helps AI crawlers discover and index all your pages",
    status: navEv?.value === "true" ? "pass" : "warn",
    value: navEv?.value === "true" ? "Present" : "Missing",
    recommendation: navEv?.value === "true"
      ? "Navigation is present — ensure all key pages are linked"
      : "Add a clear navigation menu with links to all important pages. AI crawlers follow nav links to discover content.",
    weight: 5,
  });

  // 11. Page Load Speed
  const speedEv = evidence.find((e) => e.indicator_code === "TE-02-I01");
  const loadTime = parseInt(speedEv?.value || "0");
  checks.push({
    code: "GEO-11",
    label: "Page Load Speed",
    description: "AI crawlers prioritize fast-loading pages and may skip slow ones",
    status: loadTime > 0 && loadTime < 2000 ? "pass" : loadTime > 0 && loadTime < 4000 ? "warn" : "fail",
    value: loadTime > 0 ? `${loadTime}ms` : "Unknown",
    recommendation: loadTime > 0 && loadTime < 2000
      ? "Page speed is good"
      : `Load time is ${loadTime}ms. Target under 2000ms by compressing images, minifying CSS/JS, and using a CDN.`,
    weight: 5,
  });

  // 12. AI Crawler Access (robots.txt)
  if (robotsData) {
    const blockedCount = robotsData.blocked.length;
    checks.push({
      code: "GEO-12",
      label: "AI Crawler Access (robots.txt)",
      description: "Your robots.txt controls whether AI crawlers like GPTBot, ClaudeBot, and PerplexityBot can access your site",
      status: !robotsData.hasRobotsTxt ? "warn" : blockedCount === 0 ? "pass" : blockedCount >= 3 ? "fail" : "warn",
      value: !robotsData.hasRobotsTxt
        ? "No robots.txt"
        : blockedCount > 0
          ? `Blocked: ${robotsData.blocked.join(", ")}`
          : `Allowed: ${robotsData.allowed.join(", ")}`,
      recommendation: !robotsData.hasRobotsTxt
        ? "Create a robots.txt file. Without one, some AI crawlers may skip your site entirely."
        : blockedCount > 0
          ? `Allow these AI crawlers in robots.txt: ${robotsData.blocked.map(b => b).join(", ")}. Add 'User-agent: GPTBot\\nAllow: /' etc. Blocking AI crawlers means they can't reference your content.`
          : "AI crawlers are allowed access — your content is available to AI search engines.",
      weight: 10,
    });
  } else {
    checks.push({
      code: "GEO-12",
      label: "AI Crawler Access (robots.txt)",
      description: "Your robots.txt controls whether AI crawlers like GPTBot, ClaudeBot, and PerplexityBot can access your site",
      status: "warn",
      value: "Not checked",
      recommendation: "Run a GEO analysis to check if your robots.txt allows AI crawlers like GPTBot, ClaudeBot, and PerplexityBot.",
      weight: 10,
    });
  }

  // Calculate score
  const totalWeight = checks.reduce((sum, c) => sum + c.weight, 0);
  const earnedWeight = checks.reduce((sum, c) => {
    if (c.status === "pass") return sum + c.weight;
    if (c.status === "warn") return sum + Math.round(c.weight * 0.5);
    return sum;
  }, 0);

  const score = Math.round((earnedWeight / totalWeight) * 100);
  const rating = score >= 80 ? "excellent" : score >= 60 ? "good" : score >= 40 ? "fair" : "poor";

  const summary = {
    passed: checks.filter((c) => c.status === "pass").length,
    warnings: checks.filter((c) => c.status === "warn").length,
    failed: checks.filter((c) => c.status === "fail").length,
  };

  return { score, rating, checks, summary };
}
