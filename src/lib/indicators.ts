import * as cheerio from "cheerio";

/**
 * Single source of truth for indicator extraction.
 *
 * Both the single-page scraper and the multi-page crawler emit evidence through
 * this module so an indicator can only ever be defined once. Detection prefers
 * structural signals (schema.org types, semantic elements, link protocols) and
 * falls back to word-boundary text matching — unanchored substring matching
 * produced false positives severe enough to mask real competitor weaknesses
 * ("get started" reading as a testimonial, "typically" as a phone number).
 */

export interface ScrapedEvidence {
  category: string;
  indicator_code: string;
  observation: string;
  source_url: string;
  evidence_type: string;
  confidence_level: string;
  value: string | null;
}

/**
 * Numeric indicators where a lower value is the better result. Everything else
 * numeric is treated as higher-is-better when aggregating across pages.
 */
export const LOWER_IS_BETTER = new Set(["TE-02-I01"]);

export type Cheerio = cheerio.CheerioAPI;

function anyMatch(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

function hasSchemaType(html: string, ...types: string[]): boolean {
  return types.some((t) =>
    new RegExp(`"@type"\\s*:\\s*"?${t}"?`, "i").test(html)
  );
}

// --- Pricing -----------------------------------------------------------------
// Deliberately excludes bare "cost": "cost-effective" is marketing copy, not a
// published price.
const PRICING_PATTERNS = [
  /[$€£]\s?\d/,
  /\b\d+(?:[.,]\d+)?\s?(?:usd|eur|gbp)\b/i,
  /\bpricing\b/i,
  /\bprices?\b/i,
  /\bquote\b/i,
  /\bhow much\b/i,
  /\bstarting (?:at|from)\b/i,
  /\bper (?:month|year|hour|user|seat|project)\b/i,
];

function detectPricing($: Cheerio, html: string, bodyText: string): boolean {
  if (hasSchemaType(html, "Offer", "PriceSpecification", "AggregateOffer")) return true;
  if ($('[itemprop="price"], [class*="price" i]').length > 0) return true;
  return anyMatch(bodyText, PRICING_PATTERNS);
}

// --- FAQ ---------------------------------------------------------------------
const FAQ_PATTERNS = [/\bfaqs?\b/i, /\bfrequently asked\b/i, /\bcommon questions\b/i];

function detectFaq($: Cheerio, html: string, bodyText: string): boolean {
  if (hasSchemaType(html, "FAQPage", "Question")) return true;
  // An accordion of 3+ disclosure widgets is a de facto FAQ.
  if ($("details").length >= 3) return true;
  const headings = $("h1, h2, h3, h4").text();
  if (anyMatch(headings, FAQ_PATTERNS)) return true;
  return anyMatch(bodyText, FAQ_PATTERNS);
}

// --- Reviews / social proof --------------------------------------------------
const REVIEW_PATTERNS = [
  /\btestimonials?\b/i,
  /\breviews?\b/i,
  /\bratings?\b/i,
  /\bstars?\b/i,
  /\b\d(?:\.\d)?\s*(?:out of|\/)\s*5\b/i,
];

function detectReviews($: Cheerio, html: string, bodyText: string): boolean {
  if (hasSchemaType(html, "Review", "AggregateRating")) return true;
  if ($('[class*="review" i], [class*="testimonial" i], [itemprop="reviewBody"]').length > 0) return true;
  return anyMatch(bodyText, REVIEW_PATTERNS);
}

// --- Contact info ------------------------------------------------------------
const CONTACT_PATTERNS = [
  /\bcontact\s+us\b/i,
  /\bcontact\b/i,
  /\bget in touch\b/i,
  /\bphone\b/i,
  /\be-?mail\b/i,
  /\b\+?\d[\d\s().-]{7,}\d\b/,
];

function detectContact($: Cheerio, html: string, bodyText: string): boolean {
  if ($('a[href^="tel:"], a[href^="mailto:"]').length > 0) return true;
  if ($("address").length > 0) return true;
  if (hasSchemaType(html, "PostalAddress", "ContactPoint")) return true;
  return anyMatch(bodyText, CONTACT_PATTERNS);
}

// --- Author / bylines --------------------------------------------------------
const AUTHOR_PATTERNS = [
  /\bwritten by\b/i,
  /\bauthored by\b/i,
  /\bauthor\b/i,
  /\bby\s+[A-Z][a-z]+\s+[A-Z][a-z]+/,
];

function detectAuthor($: Cheerio, html: string, bodyText: string): boolean {
  if (/"author"\s*:/i.test(html)) return true;
  if ($('[rel="author"], [itemprop="author"], [class*="author" i], [class*="byline" i]').length > 0) return true;
  return anyMatch(bodyText, AUTHOR_PATTERNS);
}

// --- Credentials -------------------------------------------------------------
const LICENSE_PATTERNS = [
  /\blicen[cs]ed?\b/i,
  /\blicen[cs]es\b/i,
  /\bcertified\b/i,
  /\bcertifications?\b/i,
  /\baccredited\b/i,
  /\binsured\b/i,
];

function detectLicense(bodyText: string): boolean {
  return anyMatch(bodyText, LICENSE_PATTERNS);
}

// --- Links -------------------------------------------------------------------
/**
 * Classifies links by resolved hostname rather than by href prefix. The old
 * prefix test counted absolute same-domain links as external, inflating
 * ecosystem scores, and missed relative links without a leading slash.
 */
function countLinks($: Cheerio, pageUrl: string): { internal: number; external: number; social: number } {
  let internal = 0;
  let external = 0;
  let social = 0;

  let host: string;
  try {
    host = new URL(pageUrl).hostname.replace(/^www\./, "");
  } catch {
    host = "";
  }

  const SOCIAL_HOSTS = /(?:facebook|twitter|x|instagram|linkedin|youtube|tiktok|pinterest)\./i;

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    if (/^(?:mailto:|tel:|javascript:|#)/i.test(href)) return;

    let parsed: URL;
    try {
      parsed = new URL(href, pageUrl);
    } catch {
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;

    const linkHost = parsed.hostname.replace(/^www\./, "");
    if (linkHost === host) {
      internal++;
    } else {
      external++;
      if (SOCIAL_HOSTS.test(parsed.hostname)) social++;
    }
  });

  return { internal, external, social };
}

export interface SignalInput {
  $: Cheerio;
  html: string;
  bodyText: string;
}

/**
 * Named signal detectors, keyed by the check names used for mission-task
 * verification. Sharing these with extraction means a task can't be verified as
 * complete by looser rules than the ones that found the gap.
 */
export const SIGNALS: Record<string, (input: SignalInput) => boolean> = {
  pricing: ({ $, html, bodyText }) => detectPricing($, html, bodyText),
  faq: ({ $, html, bodyText }) => detectFaq($, html, bodyText),
  reviews: ({ $, html, bodyText }) => detectReviews($, html, bodyText),
  contact: ({ $, html, bodyText }) => detectContact($, html, bodyText),
  author: ({ $, html, bodyText }) => detectAuthor($, html, bodyText),
  license: ({ bodyText }) => detectLicense(bodyText),
};

export { countLinks };

export interface ExtractInput {
  html: string;
  url: string;
  loadTime: number;
}

export function extractEvidence({ html, url, loadTime }: ExtractInput): ScrapedEvidence[] {
  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();

  const direct = (
    category: string,
    indicator_code: string,
    observation: string,
    value: string
  ): ScrapedEvidence => ({
    category,
    indicator_code,
    observation,
    source_url: url,
    evidence_type: "direct_observation",
    confidence_level: "A",
    value,
  });

  const bool = (
    category: string,
    code: string,
    present: boolean,
    yes: string,
    no: string
  ) => direct(category, code, present ? yes : no, present ? "true" : "false");

  const evidence: ScrapedEvidence[] = [];

  // --- Structural ---
  const h1Count = $("h1").length;
  const h2Count = $("h2").length;
  const h3Count = $("h3").length;
  const navPresent = $("nav").length > 0;
  const schemaOrg = $('script[type="application/ld+json"]').length > 0;

  evidence.push(
    direct(
      "structural",
      "ST-01-I01",
      `Page has ${h1Count} H1, ${h2Count} H2, ${h3Count} H3 headings`,
      String(h1Count + h2Count + h3Count)
    ),
    // Tracked separately from total heading count: "exactly one H1" is its own
    // signal and cannot be recovered from the sum.
    direct(
      "structural",
      "ST-01-I02",
      h1Count === 1 ? "Exactly one H1 heading" : `Page has ${h1Count} H1 headings`,
      String(h1Count)
    ),
    bool("structural", "ST-02-I01", navPresent, "Navigation menu present", "No navigation menu found"),
    bool("structural", "ST-03-I01", schemaOrg, "Schema.org structured data found", "No structured data found")
  );

  // --- Content ---
  const wordCount = bodyText ? bodyText.split(/\s+/).length : 0;
  const hasPricing = detectPricing($, html, bodyText);
  const hasFaq = detectFaq($, html, bodyText);

  evidence.push(
    direct("content", "CE-01-I01", `Page content has approximately ${wordCount} words`, String(wordCount)),
    bool("content", "CE-02-I01", hasPricing, "Pricing information found on page", "No pricing information found"),
    bool("content", "CE-03-I01", hasFaq, "FAQ section found", "No FAQ section found")
  );

  // --- Trust & Authority ---
  evidence.push(
    bool("trust", "TA-01-I01", detectAuthor($, html, bodyText), "Author bio/reference found", "No author bio found"),
    bool("trust", "TA-02-I01", detectContact($, html, bodyText), "Contact information found", "No contact information found"),
    bool("trust", "TA-03-I01", detectReviews($, html, bodyText), "Reviews/testimonials found", "No reviews/testimonials found"),
    bool("trust", "TA-04-I01", detectLicense(bodyText), "License/certification mentioned", "No license/certification mentioned")
  );

  // --- UX ---
  const hasViewport = $('meta[name="viewport"]').length > 0;
  const imgCount = $("img").length;
  const imgWithAlt = $("img[alt]").length;
  const imgAltRatio = imgCount > 0 ? Math.round((imgWithAlt / imgCount) * 100) : 100;
  const { internal: internalLinks, external: externalLinks, social: socialLinks } = countLinks($, url);

  evidence.push(
    bool("ux", "UX-01-I01", hasViewport, "Mobile viewport meta tag present", "No mobile viewport meta tag"),
    direct(
      "ux",
      "UX-02-I01",
      `${imgWithAlt} of ${imgCount} images have alt text (${imgAltRatio}%)`,
      String(imgAltRatio)
    ),
    direct(
      "ux",
      "UX-03-I01",
      `${internalLinks} internal links, ${externalLinks} external links`,
      String(internalLinks + externalLinks)
    )
  );

  // --- Technical ---
  const isHttps = url.startsWith("https://");
  const hasCanonical = $('link[rel="canonical"]').length > 0;
  const hasRobots = $('meta[name="robots"]').length > 0;

  evidence.push(
    bool("technical", "TE-01-I01", isHttps, "HTTPS enabled", "HTTPS not enabled"),
    {
      category: "technical",
      indicator_code: "TE-02-I01",
      observation: `Page load time: ${loadTime}ms`,
      source_url: url,
      evidence_type: "audit",
      confidence_level: "B",
      value: String(loadTime),
    },
    bool("technical", "TE-03-I01", hasCanonical, "Canonical link tag present", "No canonical link tag"),
    bool("technical", "TE-04-I01", hasRobots, "Robots meta tag present", "No robots meta tag")
  );

  // --- Ecosystem ---
  evidence.push(
    direct(
      "ecosystem",
      "EP-01-I01",
      socialLinks > 0 ? `${socialLinks} social media links found` : "No social media links found",
      String(socialLinks)
    ),
    direct(
      "ecosystem",
      "EP-02-I01",
      externalLinks > 0 ? `${externalLinks} external links (ecosystem presence)` : "No external links",
      String(externalLinks)
    )
  );

  return evidence;
}

export function extractMeta(html: string): { title: string; description: string } {
  const $ = cheerio.load(html);
  return {
    title: $("title").text().trim() || "",
    description: $('meta[name="description"]').attr("content") || "",
  };
}

export interface Heading {
  level: number;
  text: string;
}

/** A heading together with the copy that belongs to it. */
export interface Section {
  level: number;
  heading: string;
  text: string;
  wordCount: number;
}

export interface PageContent {
  title: string;
  metaDesc: string;
  headings: Heading[];
  /** Heading-anchored passages. Retrievers chunk on structure, so this is the
   *  unit that should be scored — a fixed word window splits an answer from the
   *  heading that introduces it. */
  sections: Section[];
  mainText: string;
  wordCount: number;
  publishedAt: string | null;
  modifiedAt: string | null;
  /** Structural evidence the `steps` and `comparison` answer types depend on. */
  hasOrderedList: boolean;
  hasTable: boolean;
}

/**
 * Elements that are navigation or furniture rather than page content.
 *
 * Deliberately limited to semantic tags and ARIA roles. Blanket class matching
 * (`[class*="nav"]`, `[class*="menu"]`) was tried and removed: it reliably strips
 * mega-menus on some sites but silently deletes the article body on others whose
 * content wrapper happens to carry a matching class. Navigation headings are
 * filtered by link density below instead, which fails safe.
 */
const BOILERPLATE = [
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "iframe",
  "svg",
  '[role="navigation"]',
  '[role="banner"]',
  '[role="contentinfo"]',
  '[aria-hidden="true"]',
].join(", ");

/**
 * Candidate content roots, most to least specific. Checking id/class conventions
 * matters because plenty of sites predate <main> and use `<div id="main">`.
 */
const CONTENT_ROOTS = [
  "article",
  "main",
  '[role="main"]',
  "#main",
  "#content",
  "#main-content",
  ".post-content",
  ".article-content",
  ".entry-content",
];

/**
 * A heading whose entire text is a single link is a navigation label
 * (`<h4><a>HTML</a></h4>`), not a section title. Real content headings may contain
 * a link, but their text is not wholly consumed by one.
 */
function isNavHeading(text: string, linkText: string, insideAnchor: boolean): boolean {
  if (!text) return true;
  if (insideAnchor) return true;
  return linkText.length > 0 && linkText.length >= text.length * 0.9;
}

function firstDate(...candidates: (string | undefined | null)[]): string | null {
  for (const raw of candidates) {
    if (!raw) continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const parsed = new Date(trimmed);
    if (!isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return null;
}

/** Pulls a date field out of any JSON-LD block on the page. */
function schemaDate(html: string, field: string): string | null {
  const match = html.match(new RegExp(`"${field}"\\s*:\\s*"([^"]+)"`, "i"));
  return match ? match[1] : null;
}

/**
 * Extracts the readable content of a page: its heading outline, body copy with
 * boilerplate removed, and whatever publish/update dates it declares.
 *
 * The heading outline is the highest-value part — it is both a freshness-independent
 * map of what the page chose to answer and the anchor an AI assistant's retrieval
 * quotes against.
 */
export function extractContent({ html }: { html: string }): PageContent {
  const $ = cheerio.load(html);

  const title = $("title").text().trim() || "";
  const metaDesc = $('meta[name="description"]').attr("content") || "";

  // Date signals live in <head> / JSON-LD, so read them before pruning the body.
  const publishedAt = firstDate(
    schemaDate(html, "datePublished"),
    $('meta[property="article:published_time"]').attr("content"),
    $("time[datetime]").first().attr("datetime")
  );
  const modifiedAt = firstDate(
    schemaDate(html, "dateModified"),
    $('meta[property="article:modified_time"]').attr("content")
  );

  // Prefer a semantic content root; fall back to body with furniture removed.
  const bodyLen = $("body").text().trim().length;
  let rootSelector = "body";
  for (const selector of CONTENT_ROOTS) {
    const $candidate = $(selector).first();
    if ($candidate.length === 0) continue;
    // Guard against an empty shell root (a hydration-only <main>) winning over a
    // populated body. Relative rather than absolute so it holds at any page size.
    if ($candidate.text().trim().length >= bodyLen * 0.25) {
      rootSelector = selector;
      break;
    }
  }

  const $content = $(rootSelector).first();
  $content.find(BOILERPLATE).remove();

  // Headings come from the pruned root, not the whole document — the outline has to
  // describe what the page answers, not what the site links to.
  const headings: Heading[] = [];
  $content.find("h1, h2, h3, h4").each((_, el) => {
    const $el = $(el);
    const text = $el.text().replace(/\s+/g, " ").trim();
    // .text() on a selection concatenates every match, giving total anchor text.
    const linkText = $el.find("a").text().replace(/\s+/g, " ").trim();
    if (isNavHeading(text, linkText, $el.closest("a").length > 0)) return;
    headings.push({ level: parseInt(el.tagName.slice(1), 10), text });
  });

  const mainText = $content.text().replace(/\s+/g, " ").trim();
  const wordCount = mainText ? mainText.split(/\s+/).length : 0;

  return {
    title,
    metaDesc,
    headings,
    sections: buildSections($, $content),
    mainText,
    wordCount,
    publishedAt,
    modifiedAt,
    hasOrderedList: $content.find("ol").length > 0,
    hasTable: $content.find("table").length > 0,
  };
}

/**
 * Groups a page into heading-anchored sections.
 *
 * Walks the content root in document order producing a flat stream of heading
 * boundaries and text runs, then attributes each run to the heading above it.
 * Sibling-walking is unreliable here because headings and their copy often sit at
 * different nesting depths, so a full ordered traversal is the robust approach.
 */
function buildSections($: Cheerio, $root: ReturnType<Cheerio>): Section[] {
  type Node =
    | { kind: "heading"; level: number; text: string }
    | { kind: "text"; text: string; linked: boolean };
  const stream: Node[] = [];

  // Depth of enclosing <a> elements, so text can be attributed to links or prose.
  const walk = (el: unknown, anchorDepth: number) => {
    for (const child of $(el as never).contents().toArray()) {
      if (child.type === "text") {
        const text = ($(child).text() || "").replace(/\s+/g, " ").trim();
        if (text) stream.push({ kind: "text", text, linked: anchorDepth > 0 });
        continue;
      }
      if (child.type !== "tag") continue;

      const tag = (child as { tagName?: string }).tagName ?? "";
      if (/^h[1-4]$/i.test(tag)) {
        const $h = $(child);
        const text = $h.text().replace(/\s+/g, " ").trim();
        const linkText = $h.find("a").text().replace(/\s+/g, " ").trim();
        // Skip nav labels here too, so their following copy joins the real section.
        if (!isNavHeading(text, linkText, $h.closest("a").length > 0)) {
          stream.push({ kind: "heading", level: parseInt(tag.slice(1), 10), text });
          continue;
        }
      }
      walk(child, tag.toLowerCase() === "a" ? anchorDepth + 1 : anchorDepth);
    }
  };

  walk($root.get(0), 0);

  const sections: Section[] = [];
  // Copy appearing before the first heading still belongs to the page — an intro
  // paragraph is frequently the passage a retriever quotes.
  let current = { level: 0, heading: "", parts: [] as string[], linkChars: 0, totalChars: 0 };

  const flush = () => {
    const text = current.parts.join(" ").replace(/\s+/g, " ").trim();
    if (!text && !current.heading) return;

    // A block whose prose is mostly link labels is navigation, whatever tag wraps it.
    // Div-built mega-menus survive the tag-and-role stripping above, and left in they
    // win retrieval slots with runs like "Courses Tutorials Practice Jobs".
    const linkRatio = current.totalChars > 0 ? current.linkChars / current.totalChars : 0;
    if (text.length > 40 && linkRatio > 0.6) return;

    sections.push({
      level: current.level,
      heading: current.heading,
      text,
      wordCount: text ? text.split(/\s+/).length : 0,
    });
  };

  for (const node of stream) {
    if (node.kind === "heading") {
      flush();
      current = { level: node.level, heading: node.text, parts: [], linkChars: 0, totalChars: 0 };
    } else {
      current.parts.push(node.text);
      current.totalChars += node.text.length;
      if (node.linked) current.linkChars += node.text.length;
    }
  }
  flush();

  return sections;
}
