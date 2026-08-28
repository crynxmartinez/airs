import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { discoverDemand, classifyCommercialIntent, acceptsIntent } from "@/lib/demand";

/**
 * Question-first URL analysis.
 *
 * Scrapes the page to find the *topic*, then expands that topic through real autocomplete
 * data (`discoverDemand`) into the questions people actually ask about it. The old version
 * returned keyword strings derived from word frequency on the page itself — which measures
 * what the site already says, not what anyone asks.
 */
export async function POST(req: NextRequest) {
  const { url } = await req.json();
  if (!url) return NextResponse.json({ error: "URL is required" }, { status: 400 });

  try {
    let fullUrl = url.trim();
    if (!fullUrl.startsWith("http")) fullUrl = "https://" + fullUrl;

    const response = await fetch(fullUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: `Could not fetch URL: ${response.status}` }, { status: 502 });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const title = $("title").text().trim();
    const metaDesc = $('meta[name="description"]').attr("content") || "";
    const h1 = $("h1").first().text().trim();
    const bodyText = $("body").text().replace(/\s+/g, " ").trim();

    // Extract domain name for location-based suggestions
    let domain = "";
    let hostname = "";
    try {
      const u = new URL(fullUrl);
      hostname = u.hostname.replace("www.", "");
      domain = hostname.split(".")[0];
    } catch (err) { console.error("[route.ts]", err); }

    // Extract location from page content
    const locationPatterns = [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?,\s+[A-Z]{2})\b/g,
      /\b(in|near|serving)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/g,
    ];
    const locations = new Set<string>();
    for (const pattern of locationPatterns) {
      let match;
      while ((match = pattern.exec(bodyText)) !== null) {
        const loc = match[2] || match[1];
        if (loc && loc.length > 2 && loc.length < 30) locations.add(loc.trim());
      }
    }
    const locationList = Array.from(locations).slice(0, 3);

    // Extract service/business type from title and h1
    const businessName = title.split(/[|\-–—:]/)[0].trim() || h1 || domain;

    // The topic seed for autocomplete expansion. The h1 or cleaned title names what the
    // business *does*, which is the subject people ask questions about — the brand name is
    // not: nobody types "how much does acme-plumbing-co cost".
    const topic = deriveTopic(title, h1, metaDesc);

    // Real autocomplete data — every suggestion is a string people have actually typed.
    const demand = topic ? await discoverDemand(topic) : [];

    // Buying questions only.
    //
    // Autocomplete's most popular results for a profession are overwhelmingly *career* and
    // *definition* queries — the first live run on an insurance broker returned "how to become
    // a commercial insurance broker", "what is a commercial broker" and three more of the same,
    // and not one buying question. Those are people who want the job or a dictionary, not a
    // quote. Every suggestion here becomes a paid AI capture, so an unfiltered list spends real
    // money asking questions no customer asks, and grades competitors on the answers.
    //
    // `classifyCommercialIntent` already exists for exactly this and simply was not called.
    //
    // `"commercial"` is passed explicitly. `acceptsIntent(intent)` with no second argument
    // returns true for *everything* by design — an absent search intent is not allowed to
    // silently narrow the set. The wizard stopped collecting a search intent when it went
    // question-first, so the caller has to name it, and a business audit is always commercial.
    // That drops `career` and `learning`, and keeps `general` — "what is commercial insurance"
    // is a real buyer question, just an early one.
    const buying = demand.filter((s) =>
      acceptsIntent(classifyCommercialIntent(s.question), "commercial")
    );

    // Split into two buckets:
    // - Questions (for Claude AI): question-shaped queries — "how much does X cost", "what is X"
    // - Keywords (for Google/Tavily): phrase-shaped queries — "X cost", "X near me", "X reviews"
    const INTENT_RANK: Record<string, number> = { buying: 0, evaluating: 1, general: 2 };
    const rankOf = (q: string) => INTENT_RANK[classifyCommercialIntent(q)] ?? 3;

    const questionShaped = buying.filter((s) => s.isQuestion);
    const keywordShaped = buying.filter((s) => !s.isQuestion);

    const questions = [...questionShaped]
      .sort(
        (a, b) =>
          rankOf(a.question) - rankOf(b.question) ||
          a.question.localeCompare(b.question)
      )
      .slice(0, 12)
      .map((s) => ({ question: s.question, source: s.source }));

    const keywords = [...keywordShaped]
      .sort(
        (a, b) =>
          rankOf(a.question) - rankOf(b.question) ||
          a.question.localeCompare(b.question)
      )
      .slice(0, 12)
      .map((s) => ({ keyword: s.question, source: s.source }));

    return NextResponse.json({
      questions,
      keywords,
      topic,
      pageTitle: title,
      metaDescription: metaDesc,
      h1,
      domain: hostname,
      businessName,
      locations: locationList,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to analyze URL";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * The topic people would ask about, from the page's own description of itself.
 *
 * Prefers the h1 ("Emergency Plumbing Services") over the title, which usually leads with
 * the brand ("Acme Co | Emergency Plumbing"). Strips the brand segment when the title is
 * all that exists, and gives up rather than guessing — an empty topic means no suggestions,
 * and the user types their own questions, which beats suggestions about the wrong subject.
 */
function deriveTopic(title: string, h1: string, metaDesc: string): string {
  const clean = (s: string) => s.replace(/\s+/g, " ").trim();

  // Strip common noise patterns from titles (app store badges, social icons, etc.)
  const stripNoise = (s: string) =>
    s
      .replace(/download.{0,5}on.{0,5}the.{0,5}app.{0,5}store[^|]*/gi, "")
      .replace(/(youtube|facebook|pinterest|instagram|linkedin|twitter|tiktok)\s*(icon|badge|logo)?/gi, "")
      .replace(/\b(RGB|SVG|PNG|JPG)\b[^|]*/g, "")
      .replace(/\s+/g, " ")
      .trim();

  const candidates: string[] = [];

  // h1 is the best signal — but extract the service part, not the tagline
  if (h1) {
    const cleanedH1 = clean(stripNoise(h1));
    // If h1 is a tagline like "The Plumbing Experts You've Trusted for Over 90 Years",
    // try to extract the core noun phrase
    const serviceMatch = cleanedH1.match(/\b([a-z]+(?:\s+[a-z]+)?)\s+(services?|experts?|company|contractors?|repair|cleaning|installation)\b/i);
    if (serviceMatch) {
      candidates.push(clean(serviceMatch[0]));
    }
    candidates.push(cleanedH1);
  }

  if (title) {
    const cleanedTitle = clean(stripNoise(title));
    const segments = cleanedTitle.split(/[|\-–—:•·]/).map(clean).filter(Boolean);
    // The longer segment tends to be the descriptive one; the shorter is the brand.
    candidates.push(...segments.sort((a, b) => b.length - a.length));
  }

  // Meta description first sentence is often the most concise description
  if (metaDesc) {
    const firstSentence = clean(metaDesc.split(/[.!?]/)[0]);
    // Try to extract a service phrase from meta description
    const metaServiceMatch = firstSentence.match(/\b([a-z]+(?:\s+[a-z]+)?)\s+(services?|company|contractors?|repair|cleaning|installation|solutions?)\b/i);
    if (metaServiceMatch) {
      candidates.push(clean(metaServiceMatch[0]));
    }
    candidates.push(firstSentence);
  }

  // Try each candidate, relaxing constraints
  for (const c of candidates) {
    const words = c.split(/\s+/).filter(Boolean);
    // First pass: 2-8 words, reasonable length
    if (words.length >= 2 && words.length <= 8 && c.length >= 8 && c.length <= 80) {
      return c.toLowerCase();
    }
  }

  // Second pass: if nothing fit, try extracting the first few meaningful words
  for (const c of candidates) {
    const words = c.split(/\s+/).filter((w) => w.length > 2);
    if (words.length >= 2) {
      // Take first 2-5 meaningful words
      const shortTopic = words.slice(0, Math.min(5, words.length)).join(" ");
      if (shortTopic.length >= 8 && shortTopic.length <= 60) {
        return shortTopic.toLowerCase();
      }
    }
  }

  return "";
}
