import * as cheerio from "cheerio";
import { chromium } from "playwright";
import { extractEvidence, extractMeta, extractContent, LOWER_IS_BETTER } from "@/lib/indicators";
import type { ScrapedEvidence, PageContent } from "@/lib/indicators";
import { fetchRobotsTxt } from "@/lib/geo";

/** Page content plus the URL it came from, ready to persist. */
export type CrawledPageContent = PageContent & { url: string; rendered: boolean };

export interface CrawlResult {
  evidence: ScrapedEvidence[];
  title: string;
  description: string;
  pagesCrawled: number;
  pages: { url: string; title: string; status: "ok" | "failed" | "js-rendered" | "blocked" }[];
  /** One entry per successfully crawled page — the input to coverage analysis. */
  content: CrawledPageContent[];
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

/**
 * Minimal robots.txt rule set for our user agent. We only ever read pages, but
 * a competitor-analysis crawler still has to honour the host's stated wishes.
 */
interface RobotsRules {
  disallow: string[];
  allow: string[];
  crawlDelayMs: number;
}

function parseRobots(txt: string | null): RobotsRules {
  const rules: RobotsRules = { disallow: [], allow: [], crawlDelayMs: 0 };
  if (!txt) return rules;

  let inScope = false;
  for (const rawLine of txt.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;

    const [rawKey, ...rest] = line.split(":");
    const key = rawKey.trim().toLowerCase();
    const value = rest.join(":").trim();

    if (key === "user-agent") {
      // A wildcard group applies to us; named bot groups do not.
      inScope = value === "*";
      continue;
    }
    if (!inScope) continue;

    if (key === "disallow" && value) rules.disallow.push(value);
    else if (key === "allow" && value) rules.allow.push(value);
    else if (key === "crawl-delay") {
      const seconds = parseFloat(value);
      if (!isNaN(seconds)) rules.crawlDelayMs = Math.min(seconds * 1000, 10000);
    }
  }

  return rules;
}

function isAllowed(rules: RobotsRules, url: string): boolean {
  let path: string;
  try {
    const parsed = new URL(url);
    path = parsed.pathname + parsed.search;
  } catch {
    return true;
  }

  const match = (pattern: string) => path.startsWith(pattern);
  // Longest matching rule wins, with Allow beating Disallow at equal length.
  const longestDisallow = rules.disallow.filter(match).reduce((a, b) => (b.length > a.length ? b : a), "");
  const longestAllow = rules.allow.filter(match).reduce((a, b) => (b.length > a.length ? b : a), "");

  if (!longestDisallow) return true;
  return longestAllow.length >= longestDisallow.length;
}

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

/**
 * Detects a shell page whose content only exists after client-side hydration.
 * Keyed on thin rendered text rather than a specific mount-node id — the App
 * Router emits no `#__next`, so an id allowlist missed most modern SPAs.
 */
function isJsRendered(html: string): boolean {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  if (bodyText.length > 500) return false;

  const hasMountPoint = $("#root, #app, #__next, [data-reactroot], [id*='app'], [ng-app]").length > 0;
  const scriptHeavy = html.length > 8000 && bodyText.length < 200;
  return hasMountPoint || scriptHeavy;
}

function discoverPages(html: string, baseUrl: string, rules: RobotsRules): string[] {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const found = new Map<string, string>();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const linkText = $(el).text().toLowerCase().trim();

    try {
      const fullUrl = new URL(href, baseUrl).href;
      const parsed = new URL(fullUrl);
      if (parsed.hostname !== base.hostname) return;
      if (parsed.pathname === base.pathname) return;
      if (parsed.hash) return;
      if (!isAllowed(rules, fullUrl)) return;

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

interface PageEvidence {
  url: string;
  evidence: ScrapedEvidence[];
  title: string;
  html: string;
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

  const { title } = extractMeta(html);
  const evidence = extractEvidence({ html, url, loadTime });

  return { url, evidence, title, html, loadTime, rendered };
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

  for (const [code, items] of byIndicator) {
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
      // Numeric indicators: pick the competitor's best showing. For load time
      // and anything else in LOWER_IS_BETTER that means the minimum — taking the
      // max reported the slowest page and labelled it "best".
      const lowerIsBetter = LOWER_IS_BETTER.has(code);
      const numeric = items
        .map((e) => ({ ev: e, num: parseFloat(e.value || "0") }))
        .filter((x) => !isNaN(x.num))
        .sort((a, b) => (lowerIsBetter ? a.num - b.num : b.num - a.num));

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

  const rules = parseRobots(await fetchRobotsTxt(url));
  const politeDelay = Math.max(RATE_LIMIT_MS, rules.crawlDelayMs);

  if (!isAllowed(rules, url)) {
    pages.push({ url, title: "", status: "blocked" });
    return { evidence: [], title: "", description: "", pagesCrawled: 0, pages, content: [] };
  }

  // Phase 1: Crawl homepage
  onProgress?.({ currentPage: url, pagesCrawled: 0, totalPages: 1, phase: "crawling" });

  let homeResult: PageEvidence;
  try {
    homeResult = await crawlSinglePage(url, onProgress);
    pageEvidence.push(homeResult);
    pages.push({ url, title: homeResult.title, status: homeResult.rendered ? "js-rendered" : "ok" });
  } catch {
    pages.push({ url, title: "", status: "failed" });
    return { evidence: [], title: "", description: "", pagesCrawled: 0, pages, content: [] };
  }

  // Phase 2: Discover additional pages from the homepage we already have. This
  // reuses the (possibly JS-rendered) HTML — re-fetching it plainly meant SPA
  // link discovery and metadata ran against an empty shell.
  onProgress?.({ currentPage: url, pagesCrawled: 1, totalPages: 1, phase: "discovering" });

  const homeHtml = homeResult.html;
  const additionalUrls = discoverPages(homeHtml, url, rules);
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

    await new Promise((resolve) => setTimeout(resolve, politeDelay));

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
  const { title, description } = extractMeta(homeHtml);

  onProgress?.({ currentPage: "", pagesCrawled: pages.length, totalPages, phase: "done" });

  // Persistable content for every page that actually returned HTML.
  const content: CrawledPageContent[] = pageEvidence.map((page) => ({
    url: page.url,
    rendered: page.rendered,
    ...extractContent({ html: page.html }),
  }));

  return {
    evidence,
    title,
    description,
    pagesCrawled: pages.length,
    pages,
    content,
  };
}
