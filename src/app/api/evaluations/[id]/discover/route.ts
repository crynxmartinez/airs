import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, generateId } from "@/lib/db";
import { classifyCompetitor } from "@/lib/search";
import { searchTavily } from "@/lib/tavily";
import { captureClaudeAnswer, DISCOVERY_PROFILE } from "@/lib/ai-capture";
import type { Evaluation } from "@/types";
import { hostOf } from "@/lib/url";

/**
 * Competitor discovery — Google + AI cross-match.
 *
 * 1. Tavily fetches Google results for each keyword
 * 2. Claude AI captures cited sources for each question
 * 3. We match by host — only competitors appearing in BOTH are returned (up to 10)
 *
 * Body: { questions?: string[], keywords?: string[], limit?: number, force?: boolean }
 * Falls back to evaluation.primary_query if questions/keywords not provided.
 */

const FETCH_COUNT = 20;
const MAX_MATCHED = 10;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const evaluation = await queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));

  // Questions go to Claude AI, keywords go to Tavily/Google
  const questions: string[] = Array.isArray(body?.questions) ? body.questions : [];
  const keywords: string[] = Array.isArray(body?.keywords) ? body.keywords : [];

  // Fallback to primary_query if neither is provided
  const fallbackQuery: string = (body?.query || evaluation.primary_query || "").trim();
  if (questions.length === 0 && keywords.length === 0 && !fallbackQuery) {
    return NextResponse.json(
      { error: "No questions or keywords provided" },
      { status: 400 }
    );
  }
  const effectiveQuestions = questions.length > 0 ? questions : [fallbackQuery];
  const effectiveKeywords = keywords.length > 0 ? keywords : [fallbackQuery];

  // Anchor queries to the market
  const market = (evaluation.target_location ?? "").trim();
  const anchorToMarket = (q: string): string => {
    if (market && !q.toLowerCase().includes(market.toLowerCase())) {
      return `${q} ${market}`;
    }
    return q;
  };

  const selfHost = hostOf(evaluation.digital_asset_url);
  const hasTavily = !!process.env.TAVILY_API_KEY;
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;

  if (!hasTavily || !hasClaude) {
    return NextResponse.json(
      { error: "Both TAVILY_API_KEY and ANTHROPIC_API_KEY are required for cross-match discovery.", reason: "no_api_key" },
      { status: 500 }
    );
  }

  // --- Run Tavily searches (keywords) and Claude captures (questions) in parallel ---
  // Multiple keywords → multiple Tavily searches, merge all results
  // Multiple questions → multiple Claude captures, merge all citations
  const tavilyPromises = effectiveKeywords.map((kw) =>
    searchTavily(anchorToMarket(kw), {
      maxResults: FETCH_COUNT,
      searchDepth: "basic",
      excludeDomains: selfHost ? [selfHost] : [],
      includeAnswer: false,
    })
  );

  const claudePromises = effectiveQuestions.map((q) =>
    captureClaudeAnswer(
      anchorToMarket(q),
      evaluation.project_id || "",
      evaluation.digital_asset_url,
      DISCOVERY_PROFILE
    )
  );

  const [tavilyResults, claudeResults] = await Promise.allSettled([
    Promise.all(tavilyPromises),
    Promise.all(claudePromises),
  ]);

  if (tavilyResults.status === "rejected") {
    const msg = tavilyResults.reason instanceof Error ? tavilyResults.reason.message : String(tavilyResults.reason);
    return NextResponse.json({ error: `Google search failed: ${msg}`, reason: "tavily_failed" }, { status: 502 });
  }
  if (claudeResults.status === "rejected") {
    const msg = claudeResults.reason instanceof Error ? claudeResults.reason.message : String(claudeResults.reason);
    return NextResponse.json({ error: `AI search failed: ${msg}`, reason: "claude_failed" }, { status: 502 });
  }

  // --- Build host sets from merged results ---
  const tavilyByHost = new Map<string, { url: string; title: string; content: string }>();
  for (const tavilyResult of tavilyResults.value) {
    for (const r of tavilyResult.results) {
      const host = hostOf(r.url);
      if (!host || host === selfHost) continue;
      if (!tavilyByHost.has(host)) {
        tavilyByHost.set(host, { url: r.url, title: r.title, content: r.content });
      }
    }
  }

  const claudeByHost = new Map<string, { url: string; title: string }>();
  let totalEstimatedCost = 0;
  for (const claudeResult of claudeResults.value) {
    totalEstimatedCost += claudeResult.usage.estimated_usd;
    for (const c of claudeResult.citations) {
      const host = hostOf(c.url);
      if (!host || host === selfHost) continue;
      if (!claudeByHost.has(host)) {
        claudeByHost.set(host, { url: c.url, title: host });
      }
    }
  }

  // --- Classify each host into: primary (both), googleOnly, or aiOnly ---
  const makeEntry = (host: string, url: string, title: string, content: string, discoveredVia: string) => {
    const type = classifyCompetitor(url, title, content);
    return {
      host,
      url,
      title,
      description: content.slice(0, 200),
      competitor_type: type,
      discovered_via: discoveredVia,
    };
  };

  const primary: { host: string; url: string; title: string; description: string; competitor_type: string; discovered_via: string }[] = [];
  const googleOnly: { host: string; url: string; title: string; description: string; competitor_type: string; discovered_via: string }[] = [];
  const aiOnly: { host: string; url: string; title: string; description: string; competitor_type: string; discovered_via: string }[] = [];

  for (const [host, tav] of tavilyByHost) {
    if (claudeByHost.has(host)) {
      primary.push(makeEntry(host, tav.url, tav.title, tav.content, "both"));
    } else {
      googleOnly.push(makeEntry(host, tav.url, tav.title, tav.content, "google"));
    }
  }

  for (const [host, ai] of claudeByHost) {
    if (!tavilyByHost.has(host)) {
      aiOnly.push(makeEntry(host, ai.url, ai.title, "", "ai"));
    }
  }

  // Sort primary first, then googleOnly by relevance, then aiOnly
  // Limit each bucket
  const primaryLimited = primary.slice(0, MAX_MATCHED);
  const googleOnlyLimited = googleOnly.slice(0, MAX_MATCHED);
  const aiOnlyLimited = aiOnly.slice(0, MAX_MATCHED);

  // Filter to direct competitors for primary, but keep all for googleOnly/aiOnly
  const primaryDirect = primaryLimited.filter((m) => m.competitor_type === "direct");

  if (primaryDirect.length === 0 && googleOnlyLimited.length === 0 && aiOnlyLimited.length === 0) {
    return NextResponse.json(
      { error: "No competitors found in Google or AI results. Try adding URLs manually.", reason: "no_match" },
      { status: 404 }
    );
  }

  // --- Register all competitors (primary + google-only + ai-only) ---
  const known = new Set(
    (await query<{ url: string }>("SELECT url FROM competitors WHERE evaluation_id = ?", [id])).map((r) =>
      hostOf(r.url)
    )
  );

  const allResults = [...primaryDirect, ...googleOnlyLimited, ...aiOnlyLimited];
  const registered = allResults.filter((m) => !known.has(m.host));
  for (const m of registered) {
    await run(
      `INSERT INTO competitors (id, evaluation_id, url, competitor_name, competitor_type, discovered_via)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [generateId(), id, m.url, m.host, m.competitor_type, m.discovered_via]
    );
  }

  return NextResponse.json({
    questions: effectiveQuestions,
    keywords: effectiveKeywords,
    market: market || null,
    estimated_cost_usd: totalEstimatedCost,
    stats: {
      googleResults: tavilyByHost.size,
      aiResults: claudeByHost.size,
      matched: primaryDirect.length,
      googleOnly: googleOnlyLimited.length,
      aiOnly: aiOnlyLimited.length,
    },
    primary: primaryDirect.map((m) => ({
      url: m.url,
      title: m.title,
      description: m.description,
      competitor_type: m.competitor_type,
      discovered_via: m.discovered_via,
    })),
    googleOnly: googleOnlyLimited.map((m) => ({
      url: m.url,
      title: m.title,
      description: m.description,
      competitor_type: m.competitor_type,
      discovered_via: m.discovered_via,
    })),
    aiOnly: aiOnlyLimited.map((m) => ({
      url: m.url,
      title: m.title,
      description: m.description,
      competitor_type: m.competitor_type,
      discovered_via: m.discovered_via,
    })),
  });
}

