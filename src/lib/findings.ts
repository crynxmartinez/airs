import { query, run, generateId } from "@/lib/db";
import type { Evidence, Competitor, Finding } from "@/types";

interface OpportunityPattern {
  dimension: string;
  indicator_code: string;
  category: string;
  check: (evidence: Evidence[]) => boolean;
  title: string;
  description: (matching: Evidence[], totalCompetitors: number) => string;
  impact: "high" | "medium" | "low";
}

const OPPORTUNITY_PATTERNS: OpportunityPattern[] = [
  // Structural
  {
    dimension: "intent",
    indicator_code: "ST-03-I01",
    category: "structural",
    check: (ev) => ev.some((e) => e.indicator_code === "ST-03-I01" && e.value === "false"),
    title: "Add structured data (Schema.org markup)",
    description: (matching, total) => {
      const missing = matching.filter((e) => e.value === "false").length;
      const having = total - missing;
      return `${missing} of ${total} competitors are missing Schema.org structured data. Only ${having} competitor${having !== 1 ? "s" : ""} have it. Adding Organization, LocalBusiness, or Service schema to your page would help AI systems understand your content and give you an edge.`;
    },
    impact: "high",
  },
  {
    dimension: "intent",
    indicator_code: "ST-01-I01",
    category: "structural",
    check: (ev) => ev.some((e) => e.indicator_code === "ST-01-I01" && parseInt(e.value || "0") > 5),
    title: "Fix heading structure — too many H1 tags",
    description: (matching, _total) => {
      const offenders = matching.filter((e) => parseInt(e.value || "0") > 5);
      return `${offenders.length} competitor${offenders.length !== 1 ? "s" : ""} have too many H1 tags (best practice is exactly 1 H1 per page). Ensure your page has a single H1 with logical H2/H3 hierarchy underneath.`;
    },
    impact: "medium",
  },
  {
    dimension: "intent",
    indicator_code: "ST-02-I01",
    category: "structural",
    check: (ev) => ev.some((e) => e.indicator_code === "ST-02-I01" && e.value === "false"),
    title: "Ensure clear navigation menu",
    description: (matching, _total) => {
      const missing = matching.filter((e) => e.value === "false").length;
      return `${missing} competitor${missing !== 1 ? "s" : ""} lack a proper navigation menu. Make sure your site has a clear nav menu so users and AI can easily find their way around.`;
    },
    impact: "medium",
  },
  // Content
  {
    dimension: "content",
    indicator_code: "CE-03-I01",
    category: "content",
    check: (ev) => ev.some((e) => e.indicator_code === "CE-03-I01" && e.value === "false"),
    title: "Add a FAQ section",
    description: (matching, total) => {
      const missing = matching.filter((e) => e.value === "false").length;
      const having = total - missing;
      return `${missing} of ${total} competitors don't have a FAQ section. Only ${having} competitor${having !== 1 ? "s" : ""} do. Adding a FAQ section targeting common customer questions would set you apart and capture more search traffic. Use FAQ Schema markup for rich snippets.`;
    },
    impact: "high",
  },
  {
    dimension: "content",
    indicator_code: "CE-02-I01",
    category: "content",
    check: (ev) => ev.some((e) => e.indicator_code === "CE-02-I01" && e.value === "false"),
    title: "Add pricing information",
    description: (matching, _total) => {
      const missing = matching.filter((e) => e.value === "false").length;
      return `${missing} competitor${missing !== 1 ? "s" : ""} don't display pricing information. Being transparent about pricing builds trust and helps AI systems recommend your service when users ask about cost.`;
    },
    impact: "medium",
  },
  {
    dimension: "content",
    indicator_code: "CE-01-I01",
    category: "content",
    check: (ev) => ev.some((e) => e.indicator_code === "CE-01-I01" && parseInt(e.value || "0") < 500),
    title: "Expand page content depth",
    description: (matching, _total) => {
      const thin = matching.filter((e) => parseInt(e.value || "0") < 500);
      const wordCounts = matching.map((e) => parseInt(e.value || "0"));
      const avg = Math.round(wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length);
      return `${thin.length} competitor${thin.length !== 1 ? "s" : ""} have thin content (under 500 words). The average is ${avg} words. Aim for 500+ words with comprehensive service descriptions to stand out.`;
    },
    impact: "medium",
  },
  // Trust
  {
    dimension: "trust",
    indicator_code: "TA-04-I01",
    category: "trust",
    check: (ev) => ev.some((e) => e.indicator_code === "TA-04-I01" && e.value === "false"),
    title: "Display licenses and certifications",
    description: (matching, total) => {
      const missing = matching.filter((e) => e.value === "false").length;
      const having = total - missing;
      return `${missing} of ${total} competitors don't mention licenses or certifications. Only ${having} do. Displaying your credentials prominently builds trust with both users and AI systems.`;
    },
    impact: "medium",
  },
  {
    dimension: "trust",
    indicator_code: "TA-01-I01",
    category: "trust",
    check: (ev) => ev.some((e) => e.indicator_code === "TA-01-I01" && e.value === "false"),
    title: "Add author bios or references",
    description: (matching, _total) => {
      const missing = matching.filter((e) => e.value === "false").length;
      return `${missing} competitor${missing !== 1 ? "s" : ""} don't have author bios or references. Adding author information establishes credibility and expertise signals for AI recommendations.`;
    },
    impact: "low",
  },
  // UX
  {
    dimension: "ux",
    indicator_code: "UX-01-I01",
    category: "ux",
    check: (ev) => ev.some((e) => e.indicator_code === "UX-01-I01" && e.value === "false"),
    title: "Add mobile viewport meta tag",
    description: (matching, _total) => {
      const missing = matching.filter((e) => e.value === "false").length;
      return `${missing} competitor${missing !== 1 ? "s" : ""} don't have a mobile viewport meta tag. Ensure your page is mobile-ready with a proper viewport tag — this is essential for mobile users and AI crawlers.`;
    },
    impact: "high",
  },
  {
    dimension: "ux",
    indicator_code: "UX-02-I01",
    category: "ux",
    check: (ev) => ev.some((e) => e.indicator_code === "UX-02-I01" && parseInt(e.value || "100") < 80),
    title: "Improve image alt text coverage",
    description: (matching, _total) => {
      const offenders = matching.filter((e) => parseInt(e.value || "100") < 80);
      return `${offenders.length} competitor${offenders.length !== 1 ? "s" : ""} have incomplete image alt text. Make sure all your images have descriptive alt text for accessibility and AI understanding.`;
    },
    impact: "medium",
  },
  // Technical
  {
    dimension: "technical",
    indicator_code: "TE-01-I01",
    category: "technical",
    check: (ev) => ev.some((e) => e.indicator_code === "TE-01-I01" && e.value === "false"),
    title: "Enable HTTPS",
    description: (matching, _total) => {
      const missing = matching.filter((e) => e.value === "false").length;
      return `${missing} competitor${missing !== 1 ? "s" : ""} don't use HTTPS. Make sure your site is served over HTTPS — it's a basic security requirement and a ranking signal.`;
    },
    impact: "high",
  },
  {
    dimension: "technical",
    indicator_code: "TE-03-I01",
    category: "technical",
    check: (ev) => ev.some((e) => e.indicator_code === "TE-03-I01" && e.value === "false"),
    title: "Add canonical link tags",
    description: (matching, _total) => {
      const missing = matching.filter((e) => e.value === "false").length;
      return `${missing} competitor${missing !== 1 ? "s" : ""} don't have canonical link tags. Adding canonical tags prevents duplicate content issues and helps AI systems identify your primary page.`;
    },
    impact: "medium",
  },
  {
    dimension: "technical",
    indicator_code: "TE-04-I01",
    category: "technical",
    check: (ev) => ev.some((e) => e.indicator_code === "TE-04-I01" && e.value === "false"),
    title: "Add robots meta tag",
    description: (matching, _total) => {
      const missing = matching.filter((e) => e.value === "false").length;
      return `${missing} competitor${missing !== 1 ? "s" : ""} don't have a robots meta tag. Configure robots meta to control how search engines and AI crawlers index your page.`;
    },
    impact: "low",
  },
  {
    dimension: "technical",
    indicator_code: "TE-02-I01",
    category: "technical",
    check: (ev) => ev.some((e) => e.indicator_code === "TE-02-I01" && parseInt(e.value || "0") > 2000),
    title: "Optimize page load speed",
    description: (matching, _total) => {
      const slow = matching.filter((e) => parseInt(e.value || "0") > 2000);
      const loadTimes = matching.map((e) => parseInt(e.value || "0"));
      const avg = Math.round(loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length);
      return `${slow.length} competitor${slow.length !== 1 ? "s" : ""} have load times over 2 seconds (average: ${avg}ms). Keep your page load under 2 seconds by compressing images, minifying CSS/JS, and using a CDN.`;
    },
    impact: "medium",
  },
  // Ecosystem
  {
    dimension: "ecosystem",
    indicator_code: "EP-01-I01",
    category: "ecosystem",
    check: (ev) => ev.some((e) => e.indicator_code === "EP-01-I01" && parseInt(e.value || "0") === 0),
    title: "Add social media links",
    description: (matching, total) => {
      const missing = matching.filter((e) => parseInt(e.value || "0") === 0);
      const having = total - missing.length;
      return `${missing.length} of ${total} competitors don't link to social media. Only ${having} do. Adding links to your Facebook, Instagram, LinkedIn, and YouTube profiles builds ecosystem presence and signals legitimacy to AI systems.`;
    },
    impact: "medium",
  },
];

export function generateFindings(evaluationId: string): Finding[] {
  run("DELETE FROM findings WHERE evaluation_id = ?", [evaluationId]);

  const competitors = query<Competitor>(
    "SELECT * FROM competitors WHERE evaluation_id = ?",
    [evaluationId]
  );

  if (competitors.length === 0) return [];

  const evidence = query<Evidence>(
    "SELECT * FROM evidence WHERE evaluation_id = ?",
    [evaluationId]
  );

  const findings: Finding[] = [];
  const totalCompetitors = competitors.length;

  // Group evidence by indicator_code across all competitors
  const evidenceByIndicator: Record<string, Evidence[]> = {};
  for (const ev of evidence) {
    const code = ev.indicator_code || "";
    if (!evidenceByIndicator[code]) evidenceByIndicator[code] = [];
    evidenceByIndicator[code].push(ev);
  }

  // Check each opportunity pattern
  const usedIndicators = new Set<string>();
  for (const pattern of OPPORTUNITY_PATTERNS) {
    const matching = evidenceByIndicator[pattern.indicator_code] || [];
    if (matching.length === 0) continue;
    if (!pattern.check(matching)) continue;

    const description = pattern.description(matching, totalCompetitors);
    const evidenceIds = matching.slice(0, 5).map((e) => e.id).join(",");
    const findingId = generateId();

    run(
      `INSERT INTO findings (id, evaluation_id, competitor_id, type, dimension_code, factor_code, description, impact_level, evidence_ids)
       VALUES (?, ?, NULL, 'opportunity', ?, ?, ?, ?, ?)`,
      [findingId, evaluationId, pattern.dimension, pattern.indicator_code, description, pattern.impact, evidenceIds]
    );

    findings.push({
      id: findingId,
      evaluation_id: evaluationId,
      competitor_id: null,
      type: "opportunity",
      dimension_code: pattern.dimension,
      factor_code: pattern.indicator_code,
      description,
      impact_level: pattern.impact,
      evidence_ids: evidenceIds,
    });

    usedIndicators.add(pattern.indicator_code);
  }

  // Also generate "match competitors" findings for things most competitors have
  // These become Phase 3 tasks: "Your competitors all have X — add it to your site too"
  const STRENGTH_PATTERNS = OPPORTUNITY_PATTERNS.filter((p) => p.impact === "high" || p.impact === "medium");
  for (const pattern of STRENGTH_PATTERNS) {
    if (usedIndicators.has(pattern.indicator_code)) continue; // Skip if opportunity already fired

    const matching = evidenceByIndicator[pattern.indicator_code] || [];
    if (matching.length === 0) continue;

    // If most competitors DO have this, it's table stakes the user needs to match
    const positiveCount = matching.filter((e) => e.value === "true" || (e.indicator_code === "CE-01-I01" && parseInt(e.value || "0") >= 500) || (e.indicator_code === "UX-02-I01" && parseInt(e.value || "100") >= 80)).length;
    if (positiveCount >= Math.ceil(totalCompetitors * 0.6)) {
      const description = `${positiveCount} of ${totalCompetitors} competitors have ${pattern.title.toLowerCase()}. This is table stakes — make sure your site has it too. ${pattern.description(matching, totalCompetitors)}`;
      const evidenceIds = matching.slice(0, 3).map((e) => e.id).join(",");
      const findingId = generateId();

      run(
        `INSERT INTO findings (id, evaluation_id, competitor_id, type, dimension_code, factor_code, description, impact_level, evidence_ids)
         VALUES (?, ?, NULL, 'opportunity', ?, ?, ?, 'medium', ?)`,
        [findingId, evaluationId, pattern.dimension, pattern.indicator_code, description, evidenceIds]
      );

      findings.push({
        id: findingId,
        evaluation_id: evaluationId,
        competitor_id: null,
        type: "opportunity",
        dimension_code: pattern.dimension,
        factor_code: pattern.indicator_code,
        description,
        impact_level: "medium",
        evidence_ids: evidenceIds,
      });
    }
  }

  // Competitive position findings removed — they produce vague tasks
  // like "Outperform w3schools" that can't be auto-verified.
  // The opportunity patterns above already generate specific, verifiable tasks.

  return findings;
}
