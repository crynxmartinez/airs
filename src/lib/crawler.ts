import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { ScrapedEvidence } from "@/lib/scraper";

export interface CrawlResult {
  evidence: ScrapedEvidence[];
  title: string;
  description: string;
  pagesCrawled: number;
  pages: { url: string; title: string; status: "ok" | "failed" | "js-rendered" }[];
}

export interface CrawlProgress {
  currentPage: string;
  pagesCrawled: number;
  totalPages: number;
  phase: "discovering" | "crawling" | "rendering" | "aggregating" | "done";
}

type ProgressCallback = (progress: CrawlProgress) => void;

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const MAX_PAGES = 5;
const RATE_LIMIT_MS = 2000;

// Pages we want to discover beyond the homepage
const PRIORITY_PATHS = [
  { patterns: [/\/about/, /\/about-us/, /\/company/], label: "About" },
  { patterns: [/\/services/, /\/service/, /\/products/, /\/what-we-do/], label: "Services" },
  { patterns: [/\/contact/, /\/contact-us/, /\/get-in-touch/], label: "Contact" },
  { patterns: [/\/faq/, /\/frequently-asked/], label: "FAQ" },
  { patterns: [/\/pricing/, /\/plans/, /\/cost/], label: "Pricing" },
];

async function fetchPage(
  url: string,
  usePlaywright: boolean = false
): Promise<{ html: string; loadTime: number; rendered: boolean }> {
  if (usePlaywright) {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({ userAgent: USER_AGENT });
      const start = Date.now();
      await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
      const html = await page.content();
      await page.close();
      return { html, loadTime: Date.now() - start, rendered: true };
    } finally {
      await browser.close();
    }
  }

  const start = Date.now();
  const response = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const html = await response.text();
  return { html, loadTime: Date.now() - start, rendered: false };
}

function isJsRendered(html: string): boolean {
  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const hasContent = bodyText.length > 200;
  const hasRootDiv = $("#root, #app, #__next").length > 0;
  return !hasContent && hasRootDiv;
}

function discoverPages(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const found = new Map<string, string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const linkText = $(el).text().toLowerCase().trim();

    try {
      const fullUrl = new URL(href, baseUrl).href;
      const parsed = new URL(fullUrl);
      if (parsed.hostname !== base.hostname) return;
      if (parsed.pathname === base.pathname) return;
      if (parsed.hash) return;

      for (const { patterns, label } of PRIORITY_PATHS) {
        if (patterns.some((p) => p.test(parsed.pathname) || p.test(linkText))) {
          if (!found.has(fullUrl)) found.set(fullUrl, label);
          break;
        }
      }
    } catch {}
  });

  const priorityOrder = ["About", "Services", "Contact", "FAQ", "Pricing"];
  const sorted = Array.from(found.entries()).sort((a, b) => {
    return priorityOrder.indexOf(a[1]) - priorityOrder.indexOf(b[1]);
  });

  return sorted.slice(0, MAX_PAGES - 1).map(([url]) => url);
}

function extractEvidenceFromHtml(
  html: string,
  url: string,
  loadTime: number
): ScrapedEvidence[] {
  const $ = cheerio.load(html);
  const evidence: ScrapedEvidence[] = [];
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();

  // Structural
  const h1Count = $("h1").length;
  const h2Count = $("h2").length;
  const h3Count = $("h3").length;
  const navPresent = $("nav").length > 0;
  const schemaOrg = $('script[type="application/ld+json"]').length > 0;

  evidence.push(
    { category: "structural", indicator_code: "ST-01-I01", observation: `Page has ${h1Count} H1, ${h2Count} H2, ${h3Count} H3 headings`, source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(h1Count + h2Count + h3Count) },
    { category: "structural", indicator_code: "ST-02-I01", observation: navPresent ? "Navigation menu present" : "No navigation menu found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: navPresent ? "true" : "false" },
    { category: "structural", indicator_code: "ST-03-I01", observation: schemaOrg ? "Schema.org structured data found" : "No structured data found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: schemaOrg ? "true" : "false" }
  );

  // Content
  const wordCount = bodyText.split(/\s+/).length;
  const hasPricing = /price|pricing|\$\d|cost|quote|estimate/i.test(bodyText);
  const hasFaq = /faq|frequently asked/i.test(bodyText) || $("section").filter((_, el) => /faq/i.test($(el).text())).length > 0;

  evidence.push(
    { category: "content", indicator_code: "CE-01-I01", observation: `Page content has approximately ${wordCount} words`, source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(wordCount) },
    { category: "content", indicator_code: "CE-02-I01", observation: hasPricing ? "Pricing information found on page" : "No pricing information found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasPricing ? "true" : "false" },
    { category: "content", indicator_code: "CE-03-I01", observation: hasFaq ? "FAQ section found" : "No FAQ section found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasFaq ? "true" : "false" }
  );

  // Trust
  const hasAuthorBio = /author|by\s+[A-Z][a-z]+\s+[A-Z]|written by/i.test(bodyText);
  const hasContactInfo = /contact|email|phone|call|address/i.test(bodyText);
  const hasReviews = /review|testimonial|rating|star/i.test(bodyText);
  const hasLicense = /license|licensed|certified|certification/i.test(bodyText);

  evidence.push(
    { category: "trust", indicator_code: "TA-01-I01", observation: hasAuthorBio ? "Author bio/reference found" : "No author bio found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasAuthorBio ? "true" : "false" },
    { category: "trust", indicator_code: "TA-02-I01", observation: hasContactInfo ? "Contact information found" : "No contact information found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasContactInfo ? "true" : "false" },
    { category: "trust", indicator_code: "TA-03-I01", observation: hasReviews ? "Reviews/testimonials found" : "No reviews/testimonials found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasReviews ? "true" : "false" },
    { category: "trust", indicator_code: "TA-04-I01", observation: hasLicense ? "License/certification mentioned" : "No license/certification mentioned", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasLicense ? "true" : "false" }
  );

  // UX
  const hasViewport = $('meta[name="viewport"]').length > 0;
  const imgCount = $("img").length;
  const imgWithAlt = $('img[alt]').length;
  const imgAltRatio = imgCount > 0 ? Math.round((imgWithAlt / imgCount) * 100) : 100;
  const internalLinks = $('a[href^="/"], a[href^="' + url + '"]').length;
  const externalLinks = $('a[href^="http"]').not(`a[href^="${url}"]`).length;

  evidence.push(
    { category: "ux", indicator_code: "UX-01-I01", observation: hasViewport ? "Mobile viewport meta tag present" : "No mobile viewport meta tag", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasViewport ? "true" : "false" },
    { category: "ux", indicator_code: "UX-02-I01", observation: `${imgWithAlt} of ${imgCount} images have alt text (${imgAltRatio}%)`, source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(imgAltRatio) },
    { category: "ux", indicator_code: "UX-03-I01", observation: `${internalLinks} internal links, ${externalLinks} external links`, source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(internalLinks + externalLinks) }
  );

  // Technical
  const isHttps = url.startsWith("https://");
  const hasCanonical = $('link[rel="canonical"]').length > 0;
  const hasRobots = $('meta[name="robots"]').length > 0;

  evidence.push(
    { category: "technical", indicator_code: "TE-01-I01", observation: isHttps ? "HTTPS enabled" : "HTTPS not enabled", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: isHttps ? "true" : "false" },
    { category: "technical", indicator_code: "TE-02-I01", observation: `Page load time: ${loadTime}ms`, source_url: url, evidence_type: "audit", confidence_level: "B", value: String(loadTime) },
    { category: "technical", indicator_code: "TE-03-I01", observation: hasCanonical ? "Canonical link tag present" : "No canonical link tag", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasCanonical ? "true" : "false" },
    { category: "technical", indicator_code: "TE-04-I01", observation: hasRobots ? "Robots meta tag present" : "No robots meta tag", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasRobots ? "true" : "false" }
  );

  // Ecosystem
  const socialLinks = $('a[href*="facebook"], a[href*="twitter"], a[href*="instagram"], a[href*="linkedin"], a[href*="youtube"]').length;

  evidence.push(
    { category: "ecosystem", indicator_code: "EP-01-I01", observation: socialLinks > 0 ? `${socialLinks} social media links found` : "No social media links found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(socialLinks) },
    { category: "ecosystem", indicator_code: "EP-02-I01", observation: externalLinks > 0 ? `${externalLinks} external links (ecosystem presence)` : "No external links", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(externalLinks) }
  );

  return evidence;
}

interface PageEvidence {
  url: string;
  evidence: ScrapedEvidence[];
  title: string;
  loadTime: number;
  rendered: boolean;
}

async function crawlSinglePage(
  url: string,
  onProgress?: ProgressCallback
): Promise<PageEvidence> {
  onProgress?.({ currentPage: url, pagesCrawled: 0, totalPages: 0, phase: "crawling" });

  let { html, loadTime, rendered } = await fetchPage(url, false);

  if (isJsRendered(html)) {
    onProgress?.({ currentPage: url, pagesCrawled: 0, totalPages: 0, phase: "rendering" });
    const result = await fetchPage(url, true);
    html = result.html;
    loadTime = result.loadTime;
    rendered = result.rendered;
  }

  const $ = cheerio.load(html);
  const title = $("title").text().trim() || "";
  const evidence = extractEvidenceFromHtml(html, url, loadTime);

  return { url, evidence, title, loadTime, rendered };
}

function aggregateEvidence(pages: PageEvidence[]): ScrapedEvidence[] {
  const byIndicator = new Map<string, ScrapedEvidence[]>();

  for (const page of pages) {
    for (const ev of page.evidence) {
      const key = ev.indicator_code;
      if (!byIndicator.has(key)) byIndicator.set(key, []);
      byIndicator.get(key)!.push(ev);
    }
  }

  const aggregated: ScrapedEvidence[] = [];

  for (const [, items] of byIndicator) {
    if (items.length === 1) {
      aggregated.push(items[0]);
      continue;
    }

    // For boolean indicators: if any page is "true", use "true"
    const anyTrue = items.some((e) => e.value === "true");
    const anyFalse = items.some((e) => e.value === "false");

    if (anyTrue || anyFalse) {
      const value = anyTrue ? "true" : "false";
      const matching = items.filter((e) => e.value === value);
      const urls = matching.map((e) => e.source_url).join(", ");
      aggregated.push({
        ...matching[0],
        observation: `${matching[0].observation} (found on ${matching.length} page${matching.length !== 1 ? "s" : ""}: ${urls})`,
        source_url: matching[0].source_url,
      });
    } else {
      // For numeric indicators: take the max value (best page)
      const numeric = items
        .map((e) => ({ ev: e, num: parseFloat(e.value || "0") }))
        .filter((x) => !isNaN(x.num))
        .sort((a, b) => b.num - a.num);

      if (numeric.length > 0) {
        const best = numeric[0].ev;
        aggregated.push({
          ...best,
          observation: `${best.observation} (best of ${items.length} pages crawled)`,
        });
      } else {
        aggregated.push(items[0]);
      }
    }
  }

  return aggregated;
}

export async function crawlCompetitor(
  url: string,
  onProgress?: ProgressCallback
): Promise<CrawlResult> {
  const pages: CrawlResult["pages"] = [];
  const pageEvidence: PageEvidence[] = [];

  // Phase 1: Crawl homepage
  onProgress?.({ currentPage: url, pagesCrawled: 0, totalPages: 1, phase: "crawling" });

  let homeResult: PageEvidence;
  try {
    homeResult = await crawlSinglePage(url, onProgress);
    pageEvidence.push(homeResult);
    pages.push({ url, title: homeResult.title, status: homeResult.rendered ? "js-rendered" : "ok" });
  } catch {
    pages.push({ url, title: "", status: "failed" });
    return { evidence: [], title: "", description: "", pagesCrawled: 0, pages };
  }

  // Phase 2: Discover additional pages
  onProgress?.({ currentPage: url, pagesCrawled: 1, totalPages: 1, phase: "discovering" });

  let homeHtml: string;
  try {
    const { html } = await fetchPage(url, false);
    homeHtml = html;
  } catch {
    homeHtml = "";
  }

  const additionalUrls = discoverPages(homeHtml, url);
  const totalPages = 1 + additionalUrls.length;

  // Phase 3: Crawl additional pages with rate limiting
  for (let i = 0; i < additionalUrls.length; i++) {
    const pageUrl = additionalUrls[i];

    onProgress?.({
      currentPage: pageUrl,
      pagesCrawled: i + 1,
      totalPages,
      phase: "crawling",
    });

    await new Promise((resolve) => setTimeout(resolve, RATE_LIMIT_MS));

    try {
      const result = await crawlSinglePage(pageUrl, onProgress);
      pageEvidence.push(result);
      pages.push({ url: pageUrl, title: result.title, status: result.rendered ? "js-rendered" : "ok" });
    } catch {
      pages.push({ url: pageUrl, title: "", status: "failed" });
    }
  }

  // Phase 4: Aggregate evidence across all pages
  onProgress?.({ currentPage: "", pagesCrawled: pageEvidence.length, totalPages, phase: "aggregating" });

  const evidence = aggregateEvidence(pageEvidence);

  // Extract title and description from homepage
  const $ = cheerio.load(homeHtml);
  const title = $("title").text().trim() || "";
  const metaDesc = $('meta[name="description"]').attr("content") || "";

  onProgress?.({ currentPage: "", pagesCrawled: pages.length, totalPages, phase: "done" });

  return {
    evidence,
    title,
    description: metaDesc,
    pagesCrawled: pages.length,
    pages,
  };
}
