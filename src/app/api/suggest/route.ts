import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";

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

    // Build keyword set from title, h1, meta description
    const stopWords = new Set([
      "the", "a", "an", "and", "or", "in", "on", "at", "to", "for", "of", "with",
      "by", "from", "is", "are", "was", "were", "be", "been", "being", "have",
      "has", "had", "do", "does", "did", "will", "would", "could", "should",
      "may", "might", "must", "can", "this", "that", "these", "those", "your",
      "you", "we", "our", "us", "they", "them", "their", "it", "its", "home",
      "page", "welcome", "contact", "about", "services", "service", "inc", "llc",
      "co", "company", "official", "site", "website", "best", "top", "near",
    ]);

    const rawWords = `${title} ${h1} ${metaDesc}`.toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !stopWords.has(w));

    // Count word frequency
    const wordFreq: Record<string, number> = {};
    for (const w of rawWords) {
      wordFreq[w] = (wordFreq[w] || 0) + 1;
    }
    const topKeywords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([w]) => w);

    // Build suggestions
    const suggestions: { query: string; type: string }[] = [];

    // 1. Business name + location
    if (businessName && locationList.length > 0) {
      for (const loc of locationList) {
        suggestions.push({ query: `${businessName.toLowerCase()} ${loc.toLowerCase()}`, type: "brand + location" });
      }
    }

    // 2. Top keyword + location
    if (topKeywords.length > 0 && locationList.length > 0) {
      for (const loc of locationList) {
        suggestions.push({ query: `${topKeywords[0]} ${loc.toLowerCase()}`, type: "service + location" });
      }
    }

    // 3. Top keywords combined
    if (topKeywords.length >= 2) {
      suggestions.push({ query: topKeywords.slice(0, 3).join(" "), type: "keywords" });
    }

    // 4. H1 as a query
    if (h1 && h1.length > 5 && h1.length < 60) {
      suggestions.push({ query: h1.toLowerCase(), type: "page heading" });
    }

    // 5. Title-based query (cleaned)
    if (title && title.length > 5) {
      const cleanTitle = title.split(/[|\-–—:]/)[0].trim().toLowerCase();
      if (cleanTitle.length > 5 && cleanTitle.length < 60) {
        suggestions.push({ query: cleanTitle, type: "page title" });
      }
    }

    // 6. Top keyword alone
    if (topKeywords.length > 0) {
      suggestions.push({ query: topKeywords[0], type: "single keyword" });
    }

    // 7. Domain name
    if (domain && domain.length > 2) {
      suggestions.push({ query: domain, type: "brand name" });
    }

    // Deduplicate
    const seen = new Set<string>();
    const unique = suggestions.filter((s) => {
      const key = s.query.toLowerCase().trim();
      if (seen.has(key) || key.length < 3) return false;
      seen.add(key);
      return true;
    }).slice(0, 8);

    return NextResponse.json({
      suggestions: unique,
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
