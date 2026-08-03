import * as cheerio from "cheerio";
import { ScrapedEvidence } from "@/lib/scraper";

export interface CrawlResult {
  evidence: ScrapedEvidence[];
  title: string;
  description: string;
  pagesCrawled: number;
}

async function fetchPage(url: string): Promise<{ html: string; loadTime: number }> {
  const startTime = Date.now();
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  const html = await response.text();
  return { html, loadTime: Date.now() - startTime };
}

function extractEvidenceFromHtml(html: string, url: string, loadTime: number): ScrapedEvidence[] {
  const $ = cheerio.load(html);
  const evidence: ScrapedEvidence[] = [];
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const _title = $("title").text().trim() || "";

  // Structural
  const h1Count = $("h1").length;
  const h2Count = $("h2").length;
  const h3Count = $("h3").length;
  const navPresent = $("nav").length > 0;
  const schemaOrg = $('script[type="application/ld+json"]').length > 0;

  evidence.push({ category: "structural", indicator_code: "ST-01-I01", observation: `Page has ${h1Count} H1, ${h2Count} H2, ${h3Count} H3 headings`, source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(h1Count + h2Count + h3Count) });
  evidence.push({ category: "structural", indicator_code: "ST-02-I01", observation: navPresent ? "Navigation menu present" : "No navigation menu found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: navPresent ? "true" : "false" });
  evidence.push({ category: "structural", indicator_code: "ST-03-I01", observation: schemaOrg ? "Schema.org structured data found" : "No structured data found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: schemaOrg ? "true" : "false" });

  // Content
  const wordCount = bodyText.split(/\s+/).length;
  const hasPricing = /price|pricing|\$\d|cost|quote|estimate/i.test(bodyText);
  const hasFaq = /faq|frequently asked/i.test(bodyText) || $("section").filter((_, el) => /faq/i.test($(el).text())).length > 0;

  evidence.push({ category: "content", indicator_code: "CE-01-I01", observation: `Page content has approximately ${wordCount} words`, source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(wordCount) });
  evidence.push({ category: "content", indicator_code: "CE-02-I01", observation: hasPricing ? "Pricing information found on page" : "No pricing information found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasPricing ? "true" : "false" });
  evidence.push({ category: "content", indicator_code: "CE-03-I01", observation: hasFaq ? "FAQ section found" : "No FAQ section found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasFaq ? "true" : "false" });

  // Trust
  const hasAuthorBio = /author|by\s+[A-Z][a-z]+\s+[A-Z]|written by/i.test(bodyText);
  const hasContactInfo = /contact|email|phone|call|address/i.test(bodyText);
  const hasReviews = /review|testimonial|rating|star/i.test(bodyText);
  const hasLicense = /license|licensed|certified|certification/i.test(bodyText);

  evidence.push({ category: "trust", indicator_code: "TA-01-I01", observation: hasAuthorBio ? "Author bio/reference found" : "No author bio found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasAuthorBio ? "true" : "false" });
  evidence.push({ category: "trust", indicator_code: "TA-02-I01", observation: hasContactInfo ? "Contact information found" : "No contact information found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasContactInfo ? "true" : "false" });
  evidence.push({ category: "trust", indicator_code: "TA-03-I01", observation: hasReviews ? "Reviews/testimonials found" : "No reviews/testimonials found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasReviews ? "true" : "false" });
  evidence.push({ category: "trust", indicator_code: "TA-04-I01", observation: hasLicense ? "License/certification mentioned" : "No license/certification mentioned", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasLicense ? "true" : "false" });

  // UX
  const hasViewport = $('meta[name="viewport"]').length > 0;
  const imgCount = $("img").length;
  const imgWithAlt = $('img[alt]').length;
  const imgAltRatio = imgCount > 0 ? Math.round((imgWithAlt / imgCount) * 100) : 100;
  const internalLinks = $('a[href^="/"], a[href^="' + url + '"]').length;
  const externalLinks = $('a[href^="http"]').not(`a[href^="${url}"]`).length;

  evidence.push({ category: "ux", indicator_code: "UX-01-I01", observation: hasViewport ? "Mobile viewport meta tag present" : "No mobile viewport meta tag", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasViewport ? "true" : "false" });
  evidence.push({ category: "ux", indicator_code: "UX-02-I01", observation: `${imgWithAlt} of ${imgCount} images have alt text (${imgAltRatio}%)`, source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(imgAltRatio) });
  evidence.push({ category: "ux", indicator_code: "UX-03-I01", observation: `${internalLinks} internal links, ${externalLinks} external links`, source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(internalLinks + externalLinks) });

  // Technical
  const isHttps = url.startsWith("https://");
  const hasCanonical = $('link[rel="canonical"]').length > 0;
  const hasRobots = $('meta[name="robots"]').length > 0;

  evidence.push({ category: "technical", indicator_code: "TE-01-I01", observation: isHttps ? "HTTPS enabled" : "HTTPS not enabled", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: isHttps ? "true" : "false" });
  evidence.push({ category: "technical", indicator_code: "TE-02-I01", observation: `Page load time: ${loadTime}ms`, source_url: url, evidence_type: "audit", confidence_level: "B", value: String(loadTime) });
  evidence.push({ category: "technical", indicator_code: "TE-03-I01", observation: hasCanonical ? "Canonical link tag present" : "No canonical link tag", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasCanonical ? "true" : "false" });
  evidence.push({ category: "technical", indicator_code: "TE-04-I01", observation: hasRobots ? "Robots meta tag present" : "No robots meta tag", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: hasRobots ? "true" : "false" });

  // Ecosystem
  const socialLinks = $('a[href*="facebook"], a[href*="twitter"], a[href*="instagram"], a[href*="linkedin"], a[href*="youtube"]').length;

  evidence.push({ category: "ecosystem", indicator_code: "EP-01-I01", observation: socialLinks > 0 ? `${socialLinks} social media links found` : "No social media links found", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(socialLinks) });
  evidence.push({ category: "ecosystem", indicator_code: "EP-02-I01", observation: externalLinks > 0 ? `${externalLinks} external links (ecosystem presence)` : "No external links", source_url: url, evidence_type: "direct_observation", confidence_level: "A", value: String(externalLinks) });

  return evidence;
}

function findInternalLinks(html: string, baseUrl: string): string[] {
  const $ = cheerio.load(html);
  const base = new URL(baseUrl);
  const links = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    try {
      const fullUrl = new URL(href, baseUrl).href;
      const url = new URL(fullUrl);
      if (url.hostname === base.hostname && url.pathname !== base.pathname && !url.hash) {
        links.add(fullUrl);
      }
    } catch {}
  });

  return Array.from(links).slice(0, 4); // up to 4 additional pages
}

export async function crawlCompetitor(url: string): Promise<CrawlResult> {
  const { html, loadTime } = await fetchPage(url);
  const $ = cheerio.load(html);
  const title = $("title").text().trim() || "";
  const metaDesc = $('meta[name="description"]').attr("content") || "";

  // Crawl homepage
  let allEvidence = extractEvidenceFromHtml(html, url, loadTime);
  let pagesCrawled = 1;

  // Find and crawl internal pages
  const internalLinks = findInternalLinks(html, url);
  for (const link of internalLinks) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // 2s rate limit
      const { html: pageHtml, loadTime: pageLoadTime } = await fetchPage(link);
      allEvidence = allEvidence.concat(extractEvidenceFromHtml(pageHtml, link, pageLoadTime));
      pagesCrawled++;
    } catch {}
  }

  return { evidence: allEvidence, title, description: metaDesc, pagesCrawled };
}
