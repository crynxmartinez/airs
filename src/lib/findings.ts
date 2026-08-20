import { query, run, generateId } from "@/lib/db";
import type { Evidence, Competitor, Finding } from "@/types";
import type { WeaknessScore } from "@/lib/citation";

/**
 * Competitor weakness analysis.
 *
 * A gap only becomes an exploitable opportunity when most of the field shares
 * it. Firing on a single competitor's imperfection (the previous `.some()`
 * behaviour) produced findings like "1 of 10 competitors don't display pricing —
 * add pricing for an edge", which is advice to catch up with the other nine.
 * Prevalence now decides both whether a finding is emitted and how it ranks.
 */

/**
 * Competitor types that represent a contestable rival. Informational and
 * AI-generated results share the SERP with you, but you don't win a commercial
 * query by out-featuring a documentation page, so they don't drive gap analysis.
 */
export const PRIMARY_TYPES = new Set(["direct", "functional", "platform"]);

/** Below this many primary competitors, prevalence over that subset is noise. */
export const MIN_PRIMARY_SET = 3;

/** Fraction of the field that must share a gap for it to be an opportunity. */
const OPPORTUNITY_MIN_GAP = 0.6;
/** At or above this, the gap is near-universal — the strongest kind of opening. */
const STRONG_GAP = 0.8;
/** At or below this, the field has it and you need parity, not an edge. */
const PARITY_MAX_GAP = 0.2;

type Impact = "high" | "medium" | "low";

interface GapContext {
  lacking: number;
  having: number;
  total: number;
  gapRate: number;
  /** Mean of the parsed numeric values across the field. 0 for boolean indicators. */
  avg: number;
}

interface IndicatorSpec {
  dimension: string;
  indicator_code: string;
  category: string;
  /** Does this one competitor's value mean the thing is missing or weak? */
  lacks: (value: string | null) => boolean;
  title: string;
  /** Copy for when most of the field lacks it — an exploitable gap. */
  gap: (ctx: GapContext) => string;
  /** Copy for when most of the field has it — table stakes you need to match. */
  parity: (ctx: GapContext) => string;
  /** Ceiling on impact. Prevalence can lower this but never raise it. */
  maxImpact: Impact;
}

const isFalse = (v: string | null) => v === "false";
const num = (v: string | null, fallback = 0) => {
  const n = parseInt(v ?? "", 10);
  return isNaN(n) ? fallback : n;
};

const INDICATORS: IndicatorSpec[] = [
  // --- Structural ---
  {
    dimension: "intent",
    indicator_code: "ST-03-I01",
    category: "structural",
    lacks: isFalse,
    title: "Add structured data (Schema.org markup)",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors have no Schema.org structured data — only ${c.having} do. This is a wide-open gap: adding Organization, LocalBusiness, Service or FAQPage schema makes your content machine-readable for AI systems while most of the field stays invisible to them.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors already use Schema.org structured data. This is table stakes — without it you are the outlier. Add Organization or Service schema to reach parity.`,
    maxImpact: "high",
  },
  {
    dimension: "intent",
    indicator_code: "ST-01-I02",
    category: "structural",
    lacks: (v) => num(v, 1) !== 1,
    title: "Use exactly one H1 per page",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors don't use a single clear H1 (average ${c.avg} H1 tags per page). Clean heading hierarchy — one H1 stating the page's subject, with logical H2/H3 beneath — is a cheap structural edge over a field that mostly gets it wrong.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors use exactly one H1. Match that: a single H1 naming the page subject, with H2/H3 nested underneath.`,
    maxImpact: "medium",
  },
  {
    dimension: "intent",
    indicator_code: "ST-02-I01",
    category: "structural",
    lacks: isFalse,
    title: "Provide a clear navigation menu",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors lack a proper semantic navigation menu. A clear <nav> structure helps both users and AI crawlers understand your site's shape.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors have a proper navigation menu. Make sure yours uses a semantic <nav> element.`,
    maxImpact: "medium",
  },

  // --- Content ---
  {
    dimension: "content",
    indicator_code: "CE-03-I01",
    category: "content",
    lacks: isFalse,
    title: "Add a FAQ section",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors have no FAQ section — only ${c.having} do. Answer-first FAQ content is what AI assistants quote directly. Target the questions your buyers actually ask and mark it up with FAQPage schema to take ground the field has left empty.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors publish FAQ content. This is expected in your market — add a FAQ section with FAQPage schema to reach parity.`,
    maxImpact: "high",
  },
  {
    dimension: "content",
    indicator_code: "CE-02-I01",
    category: "content",
    lacks: isFalse,
    title: "Publish pricing information",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors publish no pricing at all. Pricing transparency is a genuine differentiator here — buyers comparing options can't get an answer from ${c.lacking} of them, and AI assistants can't recommend on cost when nobody states one.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors publish pricing. Staying silent on cost makes you the harder option to evaluate — publish rates, ranges, or a starting-from price.`,
    maxImpact: "medium",
  },
  {
    dimension: "content",
    indicator_code: "CE-01-I01",
    category: "content",
    lacks: (v) => num(v) < 500,
    title: "Increase content depth",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors have thin pages under 500 words (field average ${c.avg} words). Comprehensive, specific content wins on depth against a shallow field — aim well past the average rather than just clearing 500.`,
    parity: (c) =>
      `The field averages ${c.avg} words per page and ${c.having} of ${c.total} competitors clear 500. Depth alone won't differentiate you here — compete on specificity and angle instead.`,
    maxImpact: "medium",
  },

  // --- Trust & Authority ---
  {
    dimension: "trust",
    indicator_code: "TA-03-I01",
    category: "trust",
    lacks: isFalse,
    title: "Show reviews and testimonials",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors show no reviews or testimonials. Social proof is the most persuasive trust signal there is and most of this field has none — publish named testimonials with Review/AggregateRating schema.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors display reviews or testimonials. Without visible social proof you look weaker than the field — collect and publish them with Review schema.`,
    maxImpact: "high",
  },
  {
    dimension: "trust",
    indicator_code: "TA-02-I01",
    category: "trust",
    lacks: isFalse,
    title: "Make contact details easy to find",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors don't surface reachable contact details. Being obviously contactable — a real phone number, email and address in machine-readable form — is a trust edge over a field that hides.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors surface clear contact details. Publish yours with tel:/mailto: links and a PostalAddress so both users and AI can find them.`,
    maxImpact: "medium",
  },
  {
    dimension: "trust",
    indicator_code: "TA-04-I01",
    category: "trust",
    lacks: isFalse,
    title: "Display licenses and certifications",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors never mention licenses, certifications or accreditation. Displaying real credentials prominently separates you from a field that offers no proof of competence.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors display credentials. Show your licenses and certifications to match the field's baseline.`,
    maxImpact: "medium",
  },
  {
    dimension: "trust",
    indicator_code: "TA-01-I01",
    category: "trust",
    lacks: isFalse,
    title: "Add author bios and bylines",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors publish content with no identifiable author. Named, credentialed authors are a direct expertise signal — attribute your content and link to real bios.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors attribute their content to named authors. Add bylines and author bios to match.`,
    maxImpact: "low",
  },

  // --- UX ---
  {
    dimension: "ux",
    indicator_code: "UX-01-I01",
    category: "ux",
    lacks: isFalse,
    title: "Add mobile viewport meta tag",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors have no mobile viewport meta tag, so their pages break on phones. Being properly mobile-ready is an easy win against them.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors are mobile-ready. A viewport meta tag is the bare minimum — make sure you have one.`,
    maxImpact: "high",
  },
  {
    dimension: "ux",
    indicator_code: "UX-02-I01",
    category: "ux",
    lacks: (v) => num(v, 100) < 80,
    title: "Improve image alt text coverage",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors have poor image alt text coverage (field average ${c.avg}%). Full alt text coverage helps accessibility, image search and AI comprehension at once.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors have good alt text coverage (field average ${c.avg}%). Keep yours near 100%.`,
    maxImpact: "medium",
  },

  // --- Technical ---
  {
    dimension: "technical",
    indicator_code: "TE-01-I01",
    category: "technical",
    lacks: isFalse,
    title: "Serve the site over HTTPS",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors don't serve their site over HTTPS. Browsers flag those pages as insecure — being properly secured is a visible advantage.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors use HTTPS. It is a baseline requirement, not a differentiator — make sure all HTTP traffic redirects to HTTPS.`,
    maxImpact: "high",
  },
  {
    dimension: "technical",
    indicator_code: "TE-02-I01",
    category: "technical",
    lacks: (v) => num(v) > 2000,
    title: "Optimize page load speed",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors load slower than 2 seconds (field average ${c.avg}ms). Speed is a real competitive lever here — compress images, minify assets, enable brotli and put a CDN in front.`,
    parity: (c) =>
      `The field loads in ${c.avg}ms on average and ${c.having} of ${c.total} competitors are under 2 seconds. You need to be fast just to keep up.`,
    maxImpact: "medium",
  },
  {
    dimension: "technical",
    indicator_code: "TE-03-I01",
    category: "technical",
    lacks: isFalse,
    title: "Add canonical link tags",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors have no canonical tags, leaving them exposed to duplicate-content dilution. Canonicalising your pages is a cheap technical edge.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors set canonical tags. Add yours to avoid duplicate-content issues.`,
    maxImpact: "medium",
  },
  {
    dimension: "technical",
    indicator_code: "TE-04-I01",
    category: "technical",
    // An absent robots meta tag is not a defect — the default is index,follow.
    // Capped at low so it can never outrank a substantive gap.
    lacks: isFalse,
    title: "Set an explicit robots meta tag",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors leave indexing directives implicit. Setting robots meta explicitly is optional housekeeping — the default is already index,follow — but it removes ambiguity for AI crawlers.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors set an explicit robots meta tag. Optional, but harmless to match.`,
    maxImpact: "low",
  },

  // --- Ecosystem ---
  {
    dimension: "ecosystem",
    indicator_code: "EP-01-I01",
    category: "ecosystem",
    lacks: (v) => num(v) === 0,
    title: "Link to your social profiles",
    gap: (c) =>
      `${c.lacking} of ${c.total} competitors link to no social profiles at all. An active, linked presence off your own domain signals a real operating business where the field shows none.`,
    parity: (c) =>
      `${c.having} of ${c.total} competitors link to social profiles. Link yours from the footer with matching sameAs schema.`,
    maxImpact: "medium",
  },
];

const IMPACT_RANK: Record<Impact, number> = { high: 0, medium: 1, low: 2 };

/** Prevalence sets the impact; the spec's ceiling can only lower it. */
function resolveImpact(gapRate: number, maxImpact: Impact): Impact {
  const derived: Impact = gapRate >= STRONG_GAP ? "high" : "medium";
  return IMPACT_RANK[derived] > IMPACT_RANK[maxImpact] ? derived : maxImpact;
}

export async function generateFindings(evaluationId: string): Promise<Finding[]> {
  await run("DELETE FROM findings WHERE evaluation_id = ?", [evaluationId]);

  // Your own asset is scored through the same pipeline but is not part of the
  // field — including it would let your own gaps dilute the prevalence figures
  // that decide whether a gap is worth attacking.
  const competitors = await query<Competitor>(
    "SELECT * FROM competitors WHERE evaluation_id = ? AND (competitor_type IS NULL OR competitor_type != 'self')",
    [evaluationId]
  );
  if (competitors.length === 0) return [];

  // Scope the analysis to contestable rivals where there are enough of them.
  const primary = competitors.filter(
    (c) => c.competitor_type !== null && PRIMARY_TYPES.has(c.competitor_type)
  );
  const usePrimary = primary.length >= MIN_PRIMARY_SET;
  const analysisSet = usePrimary ? primary : competitors;
  const analysisIds = new Set(analysisSet.map((c) => c.id));

  const evidence = await query<Evidence>(
    "SELECT * FROM evidence WHERE evaluation_id = ? ORDER BY collected_at ASC",
    [evaluationId]
  );

  // One value per competitor per indicator — the most recent wins. Re-scraping a
  // competitor previously let a single rival contribute several votes to the
  // same prevalence count.
  const latest = new Map<string, Evidence>();
  for (const ev of evidence) {
    if (!ev.indicator_code) continue;
    if (!analysisIds.has(ev.competitor_id)) continue;
    latest.set(`${ev.competitor_id}|${ev.indicator_code}`, ev);
  }

  const byIndicator = new Map<string, Evidence[]>();
  for (const ev of latest.values()) {
    const code = ev.indicator_code!;
    const list = byIndicator.get(code) ?? [];
    list.push(ev);
    byIndicator.set(code, list);
  }

  const findings: Finding[] = [];

  for (const spec of INDICATORS) {
    const items = byIndicator.get(spec.indicator_code) ?? [];
    if (items.length === 0) continue;

    const total = items.length;
    const lacking = items.filter((e) => spec.lacks(e.value)).length;
    const having = total - lacking;
    const gapRate = lacking / total;

    const parsed = items.map((e) => parseFloat(e.value ?? "")).filter((n) => !isNaN(n));
    const avg = parsed.length > 0 ? Math.round(parsed.reduce((a, b) => a + b, 0) / parsed.length) : 0;

    const ctx: GapContext = { lacking, having, total, gapRate, avg };

    let type: Finding["type"];
    let impact: Impact;
    let description: string;

    if (gapRate >= OPPORTUNITY_MIN_GAP) {
      type = "opportunity";
      impact = resolveImpact(gapRate, spec.maxImpact);
      description = spec.gap(ctx);
    } else if (gapRate <= PARITY_MAX_GAP) {
      // The field has it. Worth matching, never worth ranking as an edge.
      type = "gap";
      impact = "low";
      description = spec.parity(ctx);
    } else {
      // Mixed field: some have it, some don't. No edge either way — emitting
      // this is what produced the old checklist noise.
      continue;
    }

    const evidenceIds = items.slice(0, 5).map((e) => e.id).join(",");
    const findingId = generateId();

    await run(
      `INSERT INTO findings (id, evaluation_id, competitor_id, type, dimension_code, factor_code, description, impact_level, evidence_ids)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, ?)`,
      [findingId, evaluationId, type, spec.dimension, spec.indicator_code, description, impact, evidenceIds]
    );

    findings.push({
      id: findingId,
      evaluation_id: evaluationId,
      competitor_id: null,
      type,
      dimension_code: spec.dimension,
      factor_code: spec.indicator_code,
      description,
      impact_level: impact,
      evidence_ids: evidenceIds,
    });
  }

  // Opportunities first, then parity work, each by impact.
  const typeRank: Record<string, number> = { opportunity: 0, gap: 1 };
  findings.sort(
    (a, b) =>
      (typeRank[a.type] ?? 2) - (typeRank[b.type] ?? 2) ||
      IMPACT_RANK[(a.impact_level ?? "low") as Impact] - IMPACT_RANK[(b.impact_level ?? "low") as Impact]
  );

  return findings;
}

/**
 * Converts AIRS analysis weaknesses into findings rows.
 *
 * Each weakness becomes a finding with type 'opportunity' (for coverage/depth gaps
 * the field shares) or 'gap' (for ones you already cover). The dimension_code is
 * the answer type (money, duration, etc.) and the factor_code is prefixed with
 * 'AIRS-' to distinguish them from hygiene indicator findings.
 */
export async function generateWeaknessFindings(evaluationId: string, weaknesses: WeaknessScore[]): Promise<Finding[]> {
  // Remove old weakness-based findings (factor_code starting with 'AIRS-')
  await run("DELETE FROM findings WHERE evaluation_id = ? AND factor_code LIKE 'AIRS-%'", [evaluationId]);

  const findings: Finding[] = [];

  for (const w of weaknesses) {
    if (w.alreadyCovered) continue;

    const impact: "high" | "medium" | "low" =
      w.score >= 50 ? "high" : w.score >= 25 ? "medium" : "low";

    const type: Finding["type"] = w.forcesHedge ? "opportunity" : "opportunity";
    const dimensionCode = w.answerType;
    const factorCode = `AIRS-${w.answerType}`;
    const description = w.evidence
      ? `${w.rationale}. Evidence: "${w.evidence.slice(0, 200)}"`
      : w.rationale;

    const findingId = generateId();
    await run(
      `INSERT INTO findings (id, evaluation_id, competitor_id, type, dimension_code, factor_code, description, impact_level, evidence_ids)
       VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL)`,
      [findingId, evaluationId, type, dimensionCode, factorCode, description, impact]
    );

    findings.push({
      id: findingId,
      evaluation_id: evaluationId,
      competitor_id: null,
      type,
      dimension_code: dimensionCode,
      factor_code: factorCode,
      description,
      impact_level: impact,
      evidence_ids: null,
    });
  }

  return findings;
}
