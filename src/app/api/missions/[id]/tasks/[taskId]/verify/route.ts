import { NextRequest, NextResponse } from "next/server";
import { queryOne, run } from "@/lib/db";
import * as cheerio from "cheerio";
import type { Mission, Evaluation } from "@/types";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id: missionId, taskId } = await params;

  const mission = queryOne<Mission & { audit_data: string | null }>(
    "SELECT * FROM missions WHERE id = ?", [missionId]
  );
  if (!mission) return NextResponse.json({ error: "Mission not found" }, { status: 404 });

  const evaluation = queryOne<Evaluation>(
    "SELECT * FROM evaluations WHERE id = ?", [mission.evaluation_id]
  );
  if (!evaluation || !evaluation.digital_asset_url) {
    return NextResponse.json({ error: "No website URL set for this project" }, { status: 400 });
  }

  const task = queryOne<{ id: string; indicator_code: string | null; title: string }>(
    "SELECT id, indicator_code, title FROM mission_tasks WHERE id = ? AND mission_id = ?",
    [taskId, missionId]
  );
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  if (!task.indicator_code) {
    return NextResponse.json({ error: "This task cannot be auto-verified" }, { status: 400 });
  }

  try {
    const response = await fetch(evaluation.digital_asset_url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(30000),
      redirect: "follow",
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Failed to fetch site: ${response.status}` }, { status: 500 });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();
    const url = evaluation.digital_asset_url;

    let passed = false;
    let currentValue = "";
    let detail = "";

    switch (task.indicator_code) {
      case "schema": {
        const count = $('script[type="application/ld+json"]').length;
        passed = count > 0;
        currentValue = count > 0 ? `${count} JSON-LD blocks` : "None found";
        detail = passed ? "Structured data detected." : "No Schema.org structured data found.";
        break;
      }
      case "h1": {
        const count = $("h1").length;
        passed = count === 1;
        currentValue = `${count} H1 tag${count !== 1 ? "s" : ""}`;
        detail = passed ? "Exactly 1 H1 tag." : count === 0 ? "No H1 tag found." : `${count} H1 tags — should be exactly 1.`;
        break;
      }
      case "nav": {
        const hasNav = $("nav").length > 0 || $("header nav").length > 0;
        passed = hasNav;
        currentValue = hasNav ? "Present" : "Missing";
        detail = passed ? "Navigation menu found." : "No navigation menu found.";
        break;
      }
      case "faq": {
        const hasFaq = /faq|frequently asked/i.test(bodyText) || $("section").filter((_, el) => /faq/i.test($(el).text())).length > 0;
        passed = hasFaq;
        currentValue = hasFaq ? "Found" : "Not found";
        detail = passed ? "FAQ section detected." : "No FAQ section found.";
        break;
      }
      case "pricing": {
        const hasPricing = /price|pricing|\$\d|cost|quote|estimate/i.test(bodyText);
        passed = hasPricing;
        currentValue = hasPricing ? "Found" : "Not found";
        detail = passed ? "Pricing information detected." : "No pricing information found.";
        break;
      }
      case "word_count": {
        const wc = bodyText.split(/\s+/).filter(Boolean).length;
        passed = wc >= 600;
        currentValue = `${wc} words`;
        detail = passed ? "Good content depth." : `Only ${wc} words — aim for 600+.`;
        break;
      }
      case "license": {
        const has = /license|licensed|certified|certification/i.test(bodyText);
        passed = has;
        currentValue = has ? "Found" : "Not found";
        detail = passed ? "License or certification mentioned." : "No license or certification found.";
        break;
      }
      case "author": {
        const has = /author|byline|written by/i.test(bodyText);
        passed = has;
        currentValue = has ? "Found" : "Not found";
        detail = passed ? "Author bio or reference detected." : "No author bios found.";
        break;
      }
      case "viewport": {
        const has = $('meta[name="viewport"]').length > 0;
        passed = has;
        currentValue = has ? "Present" : "Missing";
        detail = passed ? "Viewport meta tag is set." : "No viewport meta tag found.";
        break;
      }
      case "alt_text": {
        const imgs = $("img").length;
        const withAlt = $('img[alt]').length;
        const ratio = imgs > 0 ? Math.round((withAlt / imgs) * 100) : 100;
        passed = ratio >= 90;
        currentValue = imgs > 0 ? `${withAlt}/${imgs} (${ratio}%)` : "No images";
        detail = passed ? "Good alt text coverage." : `${imgs - withAlt} images missing alt text.`;
        break;
      }
      case "https": {
        passed = url.startsWith("https://");
        currentValue = passed ? "Enabled" : "Not enabled";
        detail = passed ? "Site is served over HTTPS." : "Site is NOT using HTTPS.";
        break;
      }
      case "canonical": {
        const has = $('link[rel="canonical"]').length > 0;
        passed = has;
        currentValue = has ? "Present" : "Missing";
        detail = passed ? "Canonical tag found." : "No canonical tag found.";
        break;
      }
      case "robots": {
        const has = $('meta[name="robots"]').length > 0;
        passed = has;
        currentValue = has ? "Present" : "Missing";
        detail = passed ? "Robots meta tag found." : "No robots meta tag found.";
        break;
      }
      case "speed": {
        const _loadTime = Date.now() - (response.headers.get("date") ? new Date(response.headers.get("date")!).getTime() : 0);
        const htmlSizeKB = Math.round(html.length / 1024);
        passed = htmlSizeKB < 200;
        currentValue = `${htmlSizeKB} KB`;
        detail = passed ? "Page size is reasonable." : `Page is ${htmlSizeKB} KB — optimize images and minify CSS/JS.`;
        break;
      }
      case "social": {
        const count = $('a[href*="facebook"], a[href*="twitter"], a[href*="instagram"], a[href*="linkedin"], a[href*="youtube"]').length;
        passed = count > 0;
        currentValue = `${count} link${count !== 1 ? "s" : ""}`;
        detail = passed ? `${count} social media links found.` : "No social media links found.";
        break;
      }
      case "page_size": {
        const htmlSizeKB = Math.round(html.length / 1024);
        passed = htmlSizeKB < 200;
        currentValue = `${htmlSizeKB} KB`;
        detail = passed ? "Page size is reasonable." : `Page is ${htmlSizeKB} KB — optimize images and minify CSS/JS.`;
        break;
      }
      case "h2": {
        const count = $("h2").length;
        passed = count > 0;
        currentValue = `${count} H2 tags`;
        detail = passed ? `${count} H2 tags found.` : "No H2 tags found — add them for content structure.";
        break;
      }
      case "title_tag": {
        const title = $("title").text().trim();
        const len = title.length;
        passed = len >= 30 && len <= 60;
        currentValue = len > 0 ? `${len} chars` : "Missing";
        detail = passed ? "Title tag has good length." : len === 0 ? "No title tag found." : `Title is ${len} chars — aim for 50-60.`;
        break;
      }
      case "meta_desc": {
        const desc = $('meta[name="description"]').attr("content") || "";
        const len = desc.length;
        passed = len >= 70 && len <= 160;
        currentValue = len > 0 ? `${len} chars` : "Missing";
        detail = passed ? "Meta description has good length." : len === 0 ? "No meta description found." : `Description is ${len} chars — aim for 150-160.`;
        break;
      }
      case "og_tags": {
        const ogTitle = $('meta[property="og:title"]').attr("content");
        const ogDesc = $('meta[property="og:description"]').attr("content");
        const ogImage = $('meta[property="og:image"]').attr("content");
        const count = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
        passed = count === 3;
        currentValue = `${count}/3 tags`;
        detail = passed ? "All Open Graph tags found." : `Only ${count}/3 Open Graph tags — add og:title, og:description, og:image.`;
        break;
      }
      case "contact": {
        const has = /contact|email|phone|call|address/i.test(bodyText);
        passed = has;
        currentValue = has ? "Found" : "Not found";
        detail = passed ? "Contact information found." : "No contact information found.";
        break;
      }
      case "reviews": {
        const has = /review|testimonial|rating|star/i.test(bodyText);
        passed = has;
        currentValue = has ? "Found" : "Not found";
        detail = passed ? "Reviews or testimonials detected." : "No reviews or testimonials found.";
        break;
      }
      case "internal_links": {
        const count = $('a[href^="/"], a[href^="' + url + '"]').length;
        passed = count >= 3;
        currentValue = `${count} links`;
        detail = passed ? `${count} internal links found.` : `Only ${count} internal links — add more for navigation.`;
        break;
      }
      case "external_links": {
        const count = $('a[href^="http"]').not(`a[href^="${url}"]`).length;
        passed = count > 0;
        currentValue = `${count} links`;
        detail = passed ? `${count} external links found.` : "No external links found — link to authoritative sources.";
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown check type" }, { status: 400 });
    }

    // If passed, auto-mark task as done
    if (passed) {
      run(
        "UPDATE mission_tasks SET status = 'done', completed_at = datetime('now') WHERE id = ?",
        [taskId]
      );
    }

    return NextResponse.json({
      passed,
      currentValue,
      detail,
      task_title: task.title,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
