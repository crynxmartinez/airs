import { query } from "@/lib/db";
import type { Evidence } from "@/types";

export interface GmbCheck {
  code: string;
  label: string;
  description: string;
  status: "pass" | "fail" | "warn";
  value: string;
  recommendation: string;
  weight: number;
  category: "profile" | "website" | "content" | "reviews";
}

export interface GmbScoreResult {
  score: number;
  rating: "excellent" | "good" | "fair" | "poor";
  checks: GmbCheck[];
  summary: { passed: number; warnings: number; failed: number };
  categoryScores: { profile: number; website: number; content: number; reviews: number };
}

export async function calculateGmbScore(evaluationId: string): Promise<GmbScoreResult> {
  const evidence = await query<Evidence>(
    "SELECT * FROM evidence WHERE evaluation_id = ?",
    [evaluationId]
  );

  const checks: GmbCheck[] = [];

  // === PROFILE CHECKS (what GMB needs) ===

  // 1. NAP Consistency — Name, Address, Phone on website
  const contactEv = evidence.find((e) => e.indicator_code === "TA-02-I01");
  const hasPhone = contactEv?.observation?.match(/phone|call|\d{3}.*\d{3}.*\d{4}/i);
  checks.push({
    code: "GMB-01",
    label: "NAP Information (Name, Address, Phone)",
    description: "Google matches your GMB listing NAP with your website. Inconsistencies hurt local rankings.",
    status: contactEv?.value === "true" ? (hasPhone ? "pass" : "warn") : "fail",
    value: contactEv?.value === "true" ? "Contact info found" : "Missing",
    recommendation: contactEv?.value === "true"
      ? "Ensure your business name, address, and phone number are consistent across your website and GMB listing. Even small differences (like 'St.' vs 'Street') can hurt rankings."
      : "Add your business Name, Address, and Phone number prominently on your website — ideally in the footer and contact page. This must match your GMB listing exactly.",
    weight: 15,
    category: "profile",
  });

  // 2. Structured Data for LocalBusiness
  const schemaEv = evidence.find((e) => e.indicator_code === "ST-03-I01");
  checks.push({
    code: "GMB-02",
    label: "LocalBusiness Schema Markup",
    description: "LocalBusiness schema helps Google verify your business location, hours, and services for Maps.",
    status: schemaEv?.value === "true" ? "pass" : "fail",
    value: schemaEv?.value === "true" ? "Schema found" : "Missing",
    recommendation: schemaEv?.value === "true"
      ? "Verify your schema includes LocalBusiness or a subtype (e.g., Plumber, Electrician) with address, geo coordinates, openingHours, and telephone."
      : "Add LocalBusiness JSON-LD schema with your business name, address, phone, hours, and geo-coordinates. This is critical for Google Maps visibility.",
    weight: 12,
    category: "profile",
  });

  // 3. HTTPS (Google prioritizes secure sites in local results)
  const httpsEv = evidence.find((e) => e.indicator_code === "TE-01-I01");
  checks.push({
    code: "GMB-03",
    label: "HTTPS Security",
    description: "Google prioritizes secure websites in local search results and Maps.",
    status: httpsEv?.value === "true" ? "pass" : "fail",
    value: httpsEv?.value === "true" ? "Enabled" : "Not enabled",
    recommendation: httpsEv?.value === "true"
      ? "HTTPS is properly enabled"
      : "Enable HTTPS with an SSL certificate. Google filters non-HTTPS sites from local pack results.",
    weight: 8,
    category: "website",
  });

  // === CONTENT CHECKS ===

  // 4. Service Pages (content depth)
  const contentEv = evidence.find((e) => e.indicator_code === "CE-01-I01");
  const wordCount = parseInt(contentEv?.value || "0");
  checks.push({
    code: "GMB-04",
    label: "Service Area Content",
    description: "Pages mentioning your service areas with city/neighborhood names help Google match local queries.",
    status: wordCount >= 500 ? "pass" : wordCount >= 300 ? "warn" : "fail",
    value: `${wordCount} words`,
    recommendation: wordCount >= 500
      ? "Good content depth. Ensure you mention specific cities, neighborhoods, and service areas you cover."
      : `Only ${wordCount} words. Create dedicated service area pages mentioning each city/neighborhood you serve. Google matches 'plumber [city]' queries to pages that mention that city.`,
    weight: 10,
    category: "content",
  });

  // 5. FAQ Section (appears in GMB Q&A and rich results)
  const faqEv = evidence.find((e) => e.indicator_code === "CE-03-I01");
  checks.push({
    code: "GMB-05",
    label: "FAQ / Q&A Content",
    description: "FAQ content on your website can appear in Google's Q&A section and rich snippets for local searches.",
    status: faqEv?.value === "true" ? "pass" : "warn",
    value: faqEv?.value === "true" ? "Present" : "Missing",
    recommendation: faqEv?.value === "true"
      ? "Add FAQPage schema to your FAQ section so Google can display Q&A in local results."
      : "Add a FAQ section answering common questions like 'What areas do you serve?', 'Do you offer emergency service?', 'What are your hours?'. These often appear in GMB Q&A.",
    weight: 8,
    category: "content",
  });

  // 6. Pricing Information
  const pricingEv = evidence.find((e) => e.indicator_code === "CE-02-I01");
  checks.push({
    code: "GMB-06",
    label: "Pricing Transparency",
    description: "Google's local algorithm favors businesses that are transparent about pricing — it signals legitimacy.",
    status: pricingEv?.value === "true" ? "pass" : "warn",
    value: pricingEv?.value === "true" ? "Present" : "Missing",
    recommendation: pricingEv?.value === "true"
      ? "Pricing info is visible — keep it updated to match your GMB listing if applicable."
      : "Add pricing information or starting prices. Google considers pricing transparency a trust signal for local businesses.",
    weight: 5,
    category: "content",
  });

  // === TRUST & REVIEWS ===

  // 7. Reviews/Testimonials on site
  const reviewEv = evidence.find((e) => e.indicator_code === "TA-03-I01");
  checks.push({
    code: "GMB-07",
    label: "Reviews on Website",
    description: "Customer reviews on your site reinforce review signals and improve local search visibility.",
    status: reviewEv?.value === "true" ? "pass" : "warn",
    value: reviewEv?.value === "true" ? "Present" : "Missing",
    recommendation: reviewEv?.value === "true"
      ? "Reviews found — embed your Google reviews on your site using the GMB review widget for extra local signals."
      : "Display customer reviews/testimonials on your site. Consider embedding your Google reviews directly.",
    weight: 8,
    category: "reviews",
  });

  // 8. License/Certification
  const licenseEv = evidence.find((e) => e.indicator_code === "TA-04-I01");
  checks.push({
    code: "GMB-08",
    label: "License & Certifications",
    description: "Licensed businesses rank higher in local results — Google verifies business legitimacy.",
    status: licenseEv?.value === "true" ? "pass" : "warn",
    value: licenseEv?.value === "true" ? "Present" : "Missing",
    recommendation: licenseEv?.value === "true"
      ? "Credentials visible — ensure your GMB listing also shows your license number if applicable."
      : "Display your business license and certifications prominently. Add them to your GMB profile attributes as well.",
    weight: 5,
    category: "profile",
  });

  // 9. Author/Expertise (E-E-A-T for local)
  const authorEv = evidence.find((e) => e.indicator_code === "TA-01-I01");
  checks.push({
    code: "GMB-09",
    label: "Business Owner / Team Info",
    description: "Pages about your team or owner build trust signals that Google uses for local business verification.",
    status: authorEv?.value === "true" ? "pass" : "warn",
    value: authorEv?.value === "true" ? "Present" : "Missing",
    recommendation: authorEv?.value === "true"
      ? "Team/owner info found — add photos and bios to strengthen the personal connection."
      : "Add an About Us page with owner/team photos and bios. Google uses this as a trust signal for local businesses.",
    weight: 5,
    category: "content",
  });

  // 10. Social Media Links
  const socialEv = evidence.find((e) => e.indicator_code === "EP-01-I01");
  const socialCount = parseInt(socialEv?.value || "0");
  checks.push({
    code: "GMB-10",
    label: "Social Media Presence",
    description: "Active social profiles linked from your site reinforce business legitimacy for local search.",
    status: socialCount >= 2 ? "pass" : socialCount >= 1 ? "warn" : "fail",
    value: `${socialCount} social link${socialCount !== 1 ? "s" : ""}`,
    recommendation: socialCount >= 2
      ? "Good social presence — ensure your social profiles have consistent NAP info too."
      : "Add links to Facebook, Instagram, and LinkedIn. Keep your NAP consistent across all social profiles.",
    weight: 4,
    category: "profile",
  });

  // 11. Navigation Structure
  const navEv = evidence.find((e) => e.indicator_code === "ST-02-I01");
  checks.push({
    code: "GMB-11",
    label: "Site Navigation",
    description: "Clear navigation helps Google crawl your service and location pages for local search.",
    status: navEv?.value === "true" ? "pass" : "warn",
    value: navEv?.value === "true" ? "Present" : "Missing",
    recommendation: navEv?.value === "true"
      ? "Navigation present — ensure service area pages are linked from the main menu."
      : "Add clear navigation with links to your service pages, contact page, and service area pages.",
    weight: 5,
    category: "website",
  });

  // 12. Page Load Speed
  const speedEv = evidence.find((e) => e.indicator_code === "TE-02-I01");
  const loadTime = parseInt(speedEv?.value || "0");
  checks.push({
    code: "GMB-12",
    label: "Mobile Page Speed",
    description: "Google's local algorithm heavily weights mobile speed — most local searches are on mobile.",
    status: loadTime > 0 && loadTime < 2000 ? "pass" : loadTime > 0 && loadTime < 4000 ? "warn" : "fail",
    value: loadTime > 0 ? `${loadTime}ms` : "Unknown",
    recommendation: loadTime > 0 && loadTime < 2000
      ? "Page speed is good for mobile"
      : `Load time is ${loadTime}ms. Most local searches are on mobile — target under 2000ms. Compress images, enable caching, use a CDN.`,
    weight: 7,
    category: "website",
  });

  // 13. Canonical Tags
  const canonicalEv = evidence.find((e) => e.indicator_code === "TE-03-I01");
  checks.push({
    code: "GMB-13",
    label: "Canonical Tags",
    description: "Canonical tags prevent duplicate content issues that can dilute local ranking signals.",
    status: canonicalEv?.value === "true" ? "pass" : "warn",
    value: canonicalEv?.value === "true" ? "Present" : "Missing",
    recommendation: canonicalEv?.value === "true"
      ? "Canonical tags present — ensure each service area page has its own canonical URL."
      : "Add canonical link tags to all pages. Without them, Google may index duplicate versions and dilute your local ranking signals.",
    weight: 3,
    category: "website",
  });

  // 14. Image Alt Text (helps Google Images / Maps photos)
  const imgEv = evidence.find((e) => e.indicator_code === "UX-02-I01");
  const imgAltRatio = parseInt(imgEv?.value || "0");
  checks.push({
    code: "GMB-14",
    label: "Image Alt Text",
    description: "Alt text on images helps Google understand your business photos for Maps and Images search.",
    status: imgAltRatio >= 80 ? "pass" : imgAltRatio >= 50 ? "warn" : "fail",
    value: `${imgAltRatio}% of images have alt text`,
    recommendation: imgAltRatio >= 80
      ? "Good alt text coverage — include location keywords in alt text (e.g., 'plumber repairing pipe in Chicago')"
      : `Only ${imgAltRatio}% of images have alt text. Add descriptive alt text with location keywords to all images.`,
    weight: 5,
    category: "content",
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

  // Category scores
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
      profile: calcCategory("profile"),
      website: calcCategory("website"),
      content: calcCategory("content"),
      reviews: calcCategory("reviews"),
    },
  };
}
