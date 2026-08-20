/**
 * Tavily Search API adapter — free tier (1,000 searches/month).
 *
 * Returns web search results with URLs, titles, and content snippets.
 * Used as a free alternative to Claude AI capture for competitor discovery.
 *
 * Requires TAVILY_API_KEY in environment. Get one at https://app.tavily.com
 */

export interface TavilyResult {
  url: string;
  title: string;
  content: string;
  score: number;
}

export interface TavilySearchResponse {
  query: string;
  answer: string | null;
  results: TavilyResult[];
}

const TAVILY_API_URL = "https://api.tavily.com/search";

export async function searchTavily(
  query: string,
  options?: {
    maxResults?: number;
    searchDepth?: "basic" | "advanced" | "fast" | "ultra-fast";
    excludeDomains?: string[];
    includeAnswer?: boolean;
  }
): Promise<TavilySearchResponse> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error("TAVILY_API_KEY is not set — get one at https://app.tavily.com");
  }

  const body = {
    query,
    max_results: options?.maxResults ?? 10,
    search_depth: options?.searchDepth ?? "basic",
    exclude_domains: options?.excludeDomains ?? [],
    include_answer: options?.includeAnswer ?? true,
  };

  const response = await fetch(TAVILY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Tavily search failed: ${response.status} ${text}`);
  }

  const data = await response.json();

  return {
    query,
    answer: data.answer ?? null,
    results: (data.results ?? []).map((r: {
      url: string;
      title: string;
      content: string;
      score?: number;
    }) => ({
      url: r.url,
      title: r.title,
      content: r.content,
      score: r.score ?? 0,
    })),
  };
}
