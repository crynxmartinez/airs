import { searchTavily } from "@/lib/tavily";
import { query, run, generateId } from "@/lib/db";
import * as cheerio from "cheerio";
import type { SearchCitation } from "@/types";

/**
 * Extracts the root domain from a URL for matching purposes.
 * "https://www.example.com/page" → "example.com"
 */
function extractDomain(url: string): string {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, "");
  } catch {
    return url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
  }
}

/**
 * Checks whether a page's content mentions or links to the user's domain.
 * Fetches the page HTML and inspects:
 * - All anchor href attributes (links)
 * - Body text (mentions)
 * - Image alt text (references)
 */
function checkPageForDomain(html: string, pageUrl: string, userDomain: string): boolean {
  const $ = cheerio.load(html);
  const cleanUserDomain = userDomain.replace(/^www\./, "");

  const links = $("a[href]");
  for (let i = 0; i < links.length; i++) {
    const href = $(links[i]).attr("href") || "";
    if (href.includes(cleanUserDomain)) {
      return true;
    }
  }

  const bodyText = $("body").text().toLowerCase();
  if (bodyText.includes(cleanUserDomain.toLowerCase())) {
    return true;
  }

  const imgs = $("img[alt]");
  for (let i = 0; i < imgs.length; i++) {
    const alt = ($(imgs[i]).attr("alt") || "").toLowerCase();
    if (alt.includes(cleanUserDomain.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * For a given query, searches Google (via Tavily), fetches the top 5 pages,
 * and checks each page's content for mentions of the user's domain.
 *
 * Stores results in the search_citations table.
 */
export async function checkGoogleCitation(
  queryText: string,
  userDomain: string,
  projectId: string
): Promise<{ query: string; cited: number; total: number; pages: SearchCitation[] }> {
  const cleanDomain = extractDomain(userDomain);

  const searchResponse = await searchTavily(queryText, {
    maxResults: 5,
    searchDepth: "advanced",
    includeAnswer: false,
  });

  const top5 = searchResponse.results.slice(0, 5);

  await run(
    "DELETE FROM search_citations WHERE project_id = ? AND query = ? AND engine = 'google'",
    [projectId, queryText]
  );

  const pages: SearchCitation[] = [];
  let cited = 0;

  for (let i = 0; i < top5.length; i++) {
    const result = top5[i];
    let isSelf = 0;

    try {
      const pageResponse = await fetch(result.url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000),
        redirect: "follow",
      });

      if (pageResponse.ok) {
        const html = await pageResponse.text();
        if (checkPageForDomain(html, result.url, cleanDomain)) {
          isSelf = 1;
          cited++;
        }
      }
    } catch (err) {
      console.error(`[citation-check] Failed to fetch ${result.url}:`, err);
    }

    const id = generateId();
    await run(
      "INSERT INTO search_citations (id, project_id, query, engine, result_url, result_title, result_position, is_self, found_at) VALUES (?, ?, ?, 'google', ?, ?, ?, ?, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))",
      [id, projectId, queryText, result.url, result.title, i + 1, isSelf]
    );

    pages.push({
      id,
      project_id: projectId,
      query: queryText,
      engine: "google",
      result_url: result.url,
      result_title: result.title,
      result_position: i + 1,
      is_self: isSelf,
      found_at: new Date().toISOString().replace("T", " ").substring(0, 19),
    });
  }

  return { query: queryText, cited, total: top5.length, pages };
}

/**
 * Runs Google citation checks for all tracked questions in a project.
 * Returns aggregated results.
 */
export async function checkAllGoogleCitations(
  projectId: string,
  userDomain: string
): Promise<{
  questions: { query: string; cited: number; total: number; pages: SearchCitation[] }[];
  overallCited: number;
  overallTotal: number;
}> {
  const trackedQueries = await query<{ query: string; engine: string }>(
    "SELECT DISTINCT query, engine FROM ai_queries WHERE project_id = ? AND tracked = 1",
    [projectId]
  );

  const questions = [];
  let overallCited = 0;
  let overallTotal = 0;

  for (const q of trackedQueries) {
    const result = await checkGoogleCitation(q.query, userDomain, projectId);
    questions.push(result);
    overallCited += result.cited;
    overallTotal += result.total;
  }

  return { questions, overallCited, overallTotal };
}

/**
 * Retrieves stored Google citation results from the database
 * (without running a fresh check).
 */
export async function getStoredGoogleCitations(
  projectId: string
): Promise<{
  questions: { query: string; cited: number; total: number; pages: SearchCitation[] }[];
  overallCited: number;
  overallTotal: number;
}> {
  const citations = await query<SearchCitation>(
    "SELECT * FROM search_citations WHERE project_id = ? AND engine = 'google' ORDER BY query, result_position",
    [projectId]
  );

  const byQuery = new Map<string, SearchCitation[]>();
  for (const c of citations) {
    if (!byQuery.has(c.query)) byQuery.set(c.query, []);
    byQuery.get(c.query)!.push(c);
  }

  const questions = [];
  let overallCited = 0;
  let overallTotal = 0;

  for (const [queryText, pages] of byQuery) {
    const cited = pages.filter((p) => p.is_self === 1).length;
    questions.push({ query: queryText, cited, total: pages.length, pages });
    overallCited += cited;
    overallTotal += pages.length;
  }

  return { questions, overallCited, overallTotal };
}
