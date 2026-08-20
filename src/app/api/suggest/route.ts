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
    } catch {}

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

    // Buying and evaluating questions first.
    //
    // The wizard pre-selects the top three, so this ordering decides what gets paid for.
    // Autocomplete ranks by raw popularity, and for a profession the most popular queries are
    // definitional — leaving "what is a commercial broker" to be auto-selected ahead of
    // "how much does a broker cost", which is the one a buyer actually asks.
    // Intent is the primary sort and question-shape only the tiebreak, not the other way round.
    //
    // Sorting question-shaped items first put every "what is a commercial broker" above every
    // "business insurance broker melbourne", because for a profession the question-shaped
    // queries are almost all definitional. The three that got auto-selected — and paid for —
    // were the three least useful ones on the list.
    //
    // A phrase is a perfectly good thing to ask an assistant. "commercial insurance broker
    // melbourne" is what a buyer types; "what is a commercial broker" is what a student types.
    const INTENT_RANK: Record<string, number> = { buying: 0, evaluating: 1, general: 2 };
    const rankOf = (q: string) => INTENT_RANK[classifyCommercialIntent(q)] ?? 3;

    const questions = [...buying]
      .sort(
        (a, b) =>
          rankOf(a.question) - rankOf(b.question) ||
          Number(b.isQuestion) - Number(a.isQuestion)
      )
      .slice(0, 12)
      .map((s) => ({ question: s.question, source: s.source }));

    return NextResponse.json({
      questions,
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

  const candidates: string[] = [];
  if (h1) candidates.push(clean(h1));
  if (title) {
    const segments = title.split(/[|\-–—:]/).map(clean).filter(Boolean);
    // The longer segment tends to be the descriptive one; the shorter is the brand.
    candidates.push(...segments.sort((a, b) => b.length - a.length));
  }
  if (metaDesc) candidates.push(clean(metaDesc).split(/[.!?]/)[0]);

  for (const c of candidates) {
    const words = c.split(/\s+/);
    if (words.length >= 2 && words.length <= 8 && c.length >= 8 && c.length <= 80) {
      return c.toLowerCase();
    }
  }
  return "";
}
