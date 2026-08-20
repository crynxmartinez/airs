import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, generateId } from "@/lib/db";
import type { Mission, Finding, Evaluation, ContentBrief } from "@/types";

const PHASES = [
  { key: "phase1", label: "Foundation & Quick Wins", timeline: "Month 1", description: "Fix technical fundamentals from your site audit. These are quick wins — HTTPS, meta tags, heading structure, page speed, Schema.org. Fast to implement, high impact." },
  { key: "phase2", label: "Content & On-Page Optimization", timeline: "Month 2-3", description: "Build content that ranks. Create FAQ pages, expand thin content, add pricing transparency, and optimize on-page elements. This is where you start gaining ground on competitors." },
  { key: "phase3", label: "Authority & Trust Building", timeline: "Month 4-6", description: "Establish credibility signals that AI systems and search engines reward. Add author bios, display licenses, collect reviews, build social media presence, and earn third-party citations." },
  { key: "phase4", label: "Scale & AI Visibility", timeline: "Month 7-12", description: "Long-term strategic work — topic clusters, digital PR, Answer Engine Optimization (AEO) for ChatGPT/Perplexity, content refresh cycles, and competitive positioning. This is where compounding growth happens." },
];

export async function GET(req: NextRequest) {
  const evaluationId = req.nextUrl.searchParams.get("evaluation_id");
  if (evaluationId) {
    const missions = await query<Mission>("SELECT * FROM missions WHERE evaluation_id = ? ORDER BY created_at DESC", [evaluationId]);
    return NextResponse.json(missions);
  }
  const missions = await query<Mission>("SELECT * FROM missions ORDER BY created_at DESC");
  return NextResponse.json(missions);
}

export async function POST(req: NextRequest) {
  const { evaluation_id } = await req.json();
  if (!evaluation_id) return NextResponse.json({ error: "evaluation_id is required" }, { status: 400 });

  const evaluation = await queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [evaluation_id]);
  if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });

  // Deactivate existing active missions
  await run("UPDATE missions SET status = 'inactive' WHERE evaluation_id = ? AND status = 'active'", [evaluation_id]);

  const missionId = generateId();
  const missionName = `Action Plan: ${evaluation.primary_query}`;
  await run("INSERT INTO missions (id, evaluation_id, name, status) VALUES (?, ?, ?, 'active')", [missionId, evaluation_id, missionName]);

  // Track which questions already have tasks (for dedup)
  const questionsCovered = new Set<string>();

  // === SOURCE 1: Coverage Gaps (Phase 2) ===
  const coverageGaps = await query<{ question: string; score: number; answer_type: string; competitor_label: string }>(
    `SELECT DISTINCT ON (c.question) c.question, c.score, c.answer_type, c.competitor_label
     FROM coverage c
     WHERE c.evaluation_id = ?
       AND c.run_id = (SELECT id FROM coverage_runs WHERE evaluation_id = ? ORDER BY ran_at DESC LIMIT 1)
       AND c.score < 40
     ORDER BY c.question, c.score ASC`,
    [evaluation_id, evaluation_id]
  );

  const briefs = await query<ContentBrief>(
    "SELECT * FROM content_briefs WHERE evaluation_id = ? ORDER BY weakness_score DESC",
    [evaluation_id]
  );
  const briefsByQuestion = new Map(briefs.map((b) => [b.question, b]));

  for (const gap of coverageGaps) {
    if (questionsCovered.has(gap.question)) continue;
    questionsCovered.add(gap.question);

    const brief = briefsByQuestion.get(gap.question);
    const title = brief
      ? `Write: ${brief.target_heading || gap.question}`
      : `Cover: ${gap.question}`;

    const description = brief
      ? `${brief.rationale}\n\nRequired format: ${brief.required_format || "standard"}\nExtractability: ${brief.extractability_notes || "none"}`
      : `Coverage gap — score: ${gap.score}/100. Competitor "${gap.competitor_label}" answers this. Your site does not.`;

    await run(
      "INSERT INTO mission_tasks (id, mission_id, recommendation_id, title, description, phase, indicator_code, status, content_brief_id, source, priority_score) VALUES (?, ?, NULL, ?, ?, 'phase2', NULL, 'todo', ?, 'coverage_gap', ?)",
      [generateId(), missionId, title, description, brief?.id ?? null, gap.score]
    );
  }

  // === SOURCE 2: Content Briefs not already covered (Phase 2) ===
  for (const brief of briefs) {
    if (questionsCovered.has(brief.question)) continue;
    questionsCovered.add(brief.question);

    const title = `Write: ${brief.target_heading || brief.question}`;
    const description = `${brief.rationale}\n\nRequired format: ${brief.required_format || "standard"}\nExtractability: ${brief.extractability_notes || "none"}\nEffort: ${brief.effort}`;

    await run(
      "INSERT INTO mission_tasks (id, mission_id, recommendation_id, title, description, phase, indicator_code, status, content_brief_id, source, priority_score) VALUES (?, ?, NULL, ?, ?, 'phase2', NULL, 'todo', ?, 'content_brief', ?)",
      [generateId(), missionId, title, description, brief.id, brief.weakness_score]
    );
  }

  // === SOURCE 3: Findings (Phase 1-3) ===
  const findings = await query<Finding>(
    "SELECT * FROM findings WHERE evaluation_id = ? AND (type = 'opportunity' OR type = 'weakness' OR type = 'gap') ORDER BY CASE WHEN impact_level = 'high' THEN 0 WHEN impact_level = 'medium' THEN 1 ELSE 2 END",
    [evaluation_id]
  );

  for (const finding of findings) {
    const { title, indicatorCode } = actionableTitle(finding);
    if (!indicatorCode) continue;

    const phase = assignPhase(finding);
    await run(
      "INSERT INTO mission_tasks (id, mission_id, recommendation_id, title, description, phase, indicator_code, status, content_brief_id, source, priority_score) VALUES (?, ?, NULL, ?, ?, ?, ?, 'todo', NULL, 'finding', ?)",
      [generateId(), missionId, title, finding.description, phase, indicatorCode, finding.impact_level === "high" ? 50 : finding.impact_level === "medium" ? 30 : 10]
    );
  }

  // === SOURCE 4: Strategic Tasks (Phase 2-4) ===
  const usedIndicators = new Set(
    findings.map((f) => actionableTitle(f).indicatorCode).filter(Boolean)
  );

  for (const template of STRATEGIC_TASKS) {
    if (template.indicator && usedIndicators.has(template.indicator)) continue;

    await run(
      "INSERT INTO mission_tasks (id, mission_id, recommendation_id, title, description, phase, indicator_code, status, content_brief_id, source, priority_score) VALUES (?, ?, NULL, ?, ?, ?, ?, 'todo', NULL, 'strategic', 0)",
      [generateId(), missionId, template.title, template.description, template.phase, template.indicator || ""]
    );
  }

  const mission = await queryOne<Mission>("SELECT * FROM missions WHERE id = ?", [missionId]);
  return NextResponse.json(mission, { status: 201 });
}

// Strategic task templates — deeper tasks based on industry research
// These fill out Phases 2-4 with work beyond simple audit fixes
const STRATEGIC_TASKS: { title: string; description: string; phase: string; indicator: string }[] = [
  // Phase 2: Content & On-Page Optimization
  {
    title: "Build topic clusters — create 3-5 pillar pages with supporting content",
    description: "Identify 3-5 core topics your audience searches for. Create a comprehensive pillar page for each (1,500+ words). Then write 4-6 supporting articles per pillar targeting specific long-tail questions. Link supporting articles up to their pillar. This builds topical authority that AI systems and search engines reward.",
    phase: "phase2",
    indicator: "word_count",
  },
  {
    title: "Write answer-first content — lead with a direct, quotable answer",
    description: "For each key page, open with a 40-60 word direct answer to the user's question. AI engines (ChatGPT, Perplexity, Google AI Overviews) lift self-contained passages. Structure: answer first, then elaborate. One idea per paragraph. Descriptive H2s phrased as questions.",
    phase: "phase2",
    indicator: "word_count",
  },
  {
    title: "Add Open Graph and social sharing tags to all key pages",
    description: "Add og:title, og:description, and og:image meta tags to every important page. This controls how your content appears when shared on social media and messaging apps. Use unique, compelling images (1200x630px) for each page.",
    phase: "phase2",
    indicator: "og_tags",
  },
  {
    title: "Optimize title tags and meta descriptions for click-through rate",
    description: "Review every page's title tag (target 50-60 chars) and meta description (target 150-160 chars). Write them to earn clicks, not just stuff keywords. Include your primary keyword naturally. Add emotional triggers and clear value propositions.",
    phase: "phase2",
    indicator: "title_tag",
  },
  {
    title: "Add internal links between related pages — build a hub structure",
    description: "Create a logical internal linking structure. Every supporting article should link up to its pillar page. Pillar pages should link to each other where relevant. Aim for 3+ internal links per page. This helps search engines discover and understand your content architecture.",
    phase: "phase2",
    indicator: "internal_links",
  },

  // Phase 3: Authority & Trust Building
  {
    title: "Collect and display customer reviews and testimonials",
    description: "Add a system to collect customer reviews. Display them prominently on your site. Reach out to past clients for testimonials. Consider embedding Google Reviews or Trustpilot widgets. Social proof increases conversions and signals trust to AI systems.",
    phase: "phase3",
    indicator: "reviews",
  },
  {
    title: "Add contact information and make it easy to find",
    description: "Ensure your contact information (email, phone, address) is visible on every page — in the header or footer. Create a dedicated contact page with a form. This is a basic trust signal that both users and search engines expect.",
    phase: "phase3",
    indicator: "contact",
  },
  {
    title: "Link to authoritative external sources in your content",
    description: "When making claims, link to authoritative sources (studies, official documentation, industry reports). This builds credibility and signals expertise. Aim for 2-3 external links per article to relevant, high-quality sources.",
    phase: "phase3",
    indicator: "external_links",
  },
  {
    title: "Build presence on third-party platforms (G2, TrustRadius, industry directories)",
    description: "Create profiles on review platforms and industry directories relevant to your niche. AI systems like ChatGPT and Perplexity cite these sources. Being listed on G2, Capterra, or industry-specific directories increases your chances of being recommended by AI.",
    phase: "phase3",
    indicator: "social",
  },

  // Phase 4: Scale & AI Visibility
  {
    title: "Implement Answer Engine Optimization (AEO) — get cited by ChatGPT and Perplexity",
    description: "Structure content for AI extraction. Add FAQ schema. Write in clear, quotable chunks. Include specific numbers, named sources, and dates. Create comparison pages ('Your Brand vs Competitor'). Track when AI engines cite your content and optimize for those queries.",
    phase: "phase4",
    indicator: "schema",
  },
  {
    title: "Publish original research or data-driven content to earn backlinks",
    description: "Create 2-3 original research pieces or industry surveys per year. Original data earns natural backlinks from publications and blogs. This is the most effective link-building strategy for 2025-2026. Promote your research to industry publications and journalists.",
    phase: "phase4",
    indicator: "external_links",
  },
  {
    title: "Refresh and consolidate existing content quarterly",
    description: "Review your top pages every 3 months. Update statistics, refresh screenshots, add new sections. Merge thin or overlapping pages — redirect the weaker ones to the stronger. Google rewards fresh, comprehensive content. Aim to refresh your top 10 pages each quarter.",
    phase: "phase4",
    indicator: "word_count",
  },
  {
    title: "Target SERP features — featured snippets, People Also Ask, and FAQ rich results",
    description: "For each priority keyword, analyze what SERP features appear. Structure your content to win them: answer questions concisely in 40-60 words, use lists and tables, add FAQ schema. Track which features you're winning and optimize for more.",
    phase: "phase4",
    indicator: "faq",
  },
];

// Map indicator codes to actionable task titles
const INDICATOR_ACTIONS: Record<string, { title: string; indicator: string }> = {
  "ST-03-I01": { title: "Add Schema.org structured data to your pages", indicator: "schema" },
  "ST-01-I01": { title: "Fix heading structure — ensure single H1 per page", indicator: "h1" },
  "ST-01-I02": { title: "Use exactly one H1 per page", indicator: "h1" },
  "ST-02-I01": { title: "Add a clear navigation menu", indicator: "nav" },
  "CE-03-I01": { title: "Create a FAQ page targeting common questions", indicator: "faq" },
  "CE-02-I01": { title: "Add pricing information to your page", indicator: "pricing" },
  "CE-01-I01": { title: "Expand page content — aim for 600+ words", indicator: "word_count" },
  "TA-04-I01": { title: "Display licenses and certifications prominently", indicator: "license" },
  "TA-01-I01": { title: "Add author bios and credentials pages", indicator: "author" },
  "TA-02-I01": { title: "Publish reachable contact details", indicator: "contact" },
  "TA-03-I01": { title: "Publish reviews and testimonials with Review schema", indicator: "reviews" },
  "UX-01-I01": { title: "Add mobile viewport meta tag", indicator: "viewport" },
  "UX-02-I01": { title: "Add alt text to all images", indicator: "alt_text" },
  "TE-01-I01": { title: "Enable HTTPS with SSL certificate", indicator: "https" },
  "TE-03-I01": { title: "Add canonical link tags to prevent duplicates", indicator: "canonical" },
  "TE-04-I01": { title: "Add robots meta tag for indexing control", indicator: "robots" },
  "TE-02-I01": { title: "Optimize page load speed — target under 2s", indicator: "speed" },
  "EP-01-I01": { title: "Add social media profile links", indicator: "social" },
};

/** Natural home for each dimension's work within the 12-month structure. */
const PHASE_BY_DIMENSION: Record<string, string> = {
  intent: "phase1",
  technical: "phase1",
  content: "phase2",
  ux: "phase2",
  trust: "phase3",
  ecosystem: "phase3",
};

/**
 * Opportunities are differentiators, so a widespread one is pulled forward.
 * Parity work is baseline hygiene the field already has — it lands in its
 * dimension's natural phase rather than being deferred to months 7-12, which is
 * where a flat impact-level mapping used to put all of it.
 */
function assignPhase(finding: Finding): string {
  const dim = finding.dimension_code || "";
  const natural = PHASE_BY_DIMENSION[dim] || "phase3";

  if (finding.type === "opportunity" && finding.impact_level === "high") {
    return ["intent", "technical"].includes(dim) ? "phase1" : "phase2";
  }
  return natural;
}

function actionableTitle(finding: Finding): { title: string; indicatorCode: string } {
  // If we have a known indicator code, use the predefined actionable title
  const code = finding.factor_code || "";
  if (code && INDICATOR_ACTIONS[code]) {
    return { title: INDICATOR_ACTIONS[code].title, indicatorCode: INDICATOR_ACTIONS[code].indicator };
  }

  // For competitive position findings, generate actionable title
  if (finding.dimension_code === "competitive") {
    const desc = finding.description;
    if (desc.startsWith("Outperform")) {
      const name = desc.match(/Outperform (.+?) —/)?.[1] || "a competitor";
      return { title: `Outperform ${name} — improve content, trust, and technical SEO`, indicatorCode: "" };
    }
    if (desc.startsWith("Study")) {
      const name = desc.match(/Study (.+?) —/)?.[1] || "leading competitors";
      return { title: `Study ${name} and match their strengths`, indicatorCode: "" };
    }
  }

  // Fallback: extract action from description
  const firstSentence = finding.description.split(".")[0].trim();
  const clean = firstSentence.split(" — ")[0].split(": ")[0];
  return {
    title: clean.length < 90 ? clean : clean.substring(0, 85) + "...",
    indicatorCode: "",
  };
}

export { PHASES };
