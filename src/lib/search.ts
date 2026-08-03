import * as cheerio from "cheerio";

export interface SearchResult {
  url: string;
  title: string;
  description: string;
}

export async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;

  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://duckduckgo.com/",
    },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Search failed: ${response.status}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const results: SearchResult[] = [];

  // Try multiple selectors for DuckDuckGo HTML results
  const selectors = [".result", ".web-result", ".results_links", "[data-result]"];

  for (const selector of selectors) {
    if (results.length > 0) break;
    results.length = 0;

    $(selector).each((_, el) => {
      const titleEl = $(el).find(".result__title a, .result__a, h2 a, a.result-link").first();
      const snippetEl = $(el).find(".result__snippet, .result__snippet, .snippet, .result-snippet").first();
      const urlEl = $(el).find(".result__url, .result__url, .url").first();

      let url = titleEl.attr("href") || urlEl.text().trim() || "";

      // Decode DuckDuckGo redirect URLs
      if (url.includes("duckduckgo.com/l/?uddg=")) {
        const match = url.match(/uddg=([^&]+)/);
        if (match) url = decodeURIComponent(match[1]);
      } else if (url.startsWith("//duckduckgo.com/l/?uddg=")) {
        const match = url.match(/uddg=([^&]+)/);
        if (match) url = decodeURIComponent(match[1]);
      }

      // Handle relative URLs
      if (url && !url.startsWith("http")) {
        if (url.startsWith("//")) url = "https:" + url;
        else if (url.startsWith("/")) url = "https://duckduckgo.com" + url;
        else url = "https://" + url;
      }

      const title = titleEl.text().trim();
      const description = snippetEl.text().trim();

      if (url && title && !url.includes("duckduckgo.com")) {
        results.push({ url, title, description });
      }
    });
  }

  // Fallback: try to find any links that look like results
  if (results.length === 0) {
    $("a").each((_, el) => {
      const href = $(el).attr("href") || "";
      const text = $(el).text().trim();
      if (href.includes("uddg=")) {
        const match = href.match(/uddg=([^&]+)/);
        if (match) {
          const url = decodeURIComponent(match[1]);
          if (url && text && !url.includes("duckduckgo.com")) {
            results.push({ url, title: text, description: "" });
          }
        }
      }
    });
  }

  return results;
}

export function classifyCompetitor(
  url: string,
  title: string,
  description: string
): "direct" | "functional" | "platform" | "informational" | "ai_generated" {
  const lowerUrl = url.toLowerCase();
  const lowerTitle = title.toLowerCase();
  const lowerDesc = description.toLowerCase();
  const combined = `${lowerUrl} ${lowerTitle} ${lowerDesc}`;

  if (combined.includes("yelp") || combined.includes("tripadvisor") || combined.includes("angieslist") || combined.includes("bbb.org") || combined.includes("yellowpages") || combined.includes("facebook.com") || combined.includes("linkedin.com")) {
    return "platform";
  }

  if (combined.includes("wikipedia") || combined.includes("wiki") || combined.includes("blog") || combined.includes("guide") || combined.includes("what is") || combined.includes("how to")) {
    return "informational";
  }

  if (combined.includes("chatgpt") || combined.includes("perplexity") || combined.includes("ai answer")) {
    return "ai_generated";
  }

  if (combined.includes("amazon") || combined.includes("ebay") || combined.includes("etsy")) {
    return "functional";
  }

  return "direct";
}
