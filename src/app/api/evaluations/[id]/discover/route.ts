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
 * 1. Tavily fetches top 20 Google search results
 * 2. Claude AI captures 20 cited sources
 * 3. We match by host — only competitors appearing in BOTH are returned (up to 10)
 *
 * This surfaces competitors that rank on Google AND get cited by AI.
 * Sites in only one list are filtered out.
 *
 * Body: { query?: string, limit?: number, force?: boolean }
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
  const baseQuery: string = (body?.query || evaluation.primary_query || "").trim();

  // Anchor the query to the market before capturing.
  //
  // The search path this replaced appended the location to the query text, and dropping that
  // showed up immediately: "office cleaning services" for an Australian client retrieved
  // ServiceMaster, Office Pride, a Cleveland maid service and Yelp listings for Los Angeles.
  // A retrieval set from the wrong continent is worse than no discovery — every downstream
  // verdict is then computed against businesses the client will never compete with.
  //
  // The market becomes part of the query string rather than a side channel, so the reuse
  // lookup keys on it too: the same topic in a different market is a different capture.
  const market = (evaluation.target_location ?? "").trim();
  const searchQuery: string =
    market && !baseQuery.toLowerCase().includes(market.toLowerCase())
      ? `${baseQuery} ${market}`
      : baseQuery;
  if (!baseQuery) {
    return NextResponse.json(
      { error: "No query — set primary_query on the evaluation or pass one" },
      { status: 400 }
    );
  }

  const selfHost = hostOf(evaluation.digital_asset_url);
  const hasTavily = !!process.env.TAVILY_API_KEY;
  const hasClaude = !!process.env.ANTHROPIC_API_KEY;

  if (!hasTavily || !hasClaude) {
    return NextResponse.json(
      { error: "Both TAVILY_API_KEY and ANTHROPIC_API_KEY are required for cross-match discovery.", reason: "no_api_key" },
      { status: 500 }
    );
  }

  // --- Fetch Tavily (Google) and Claude (AI) in parallel ---
  const [tavilySettled, claudeSettled] = await Promise.allSettled([
    searchTavily(searchQuery, {
      maxResults: FETCH_COUNT,
      searchDepth: "basic",
      excludeDomains: selfHost ? [selfHost] : [],
      includeAnswer: false,
    }),
    captureClaudeAnswer(
      searchQuery,
      evaluation.project_id ?? "",
      evaluation.digital_asset_url,
      DISCOVERY_PROFILE
    ),
  ]);

  if (tavilySettled.status === "rejected") {
    const msg = tavilySettled.reason instanceof Error ? tavilySettled.reason.message : String(tavilySettled.reason);
    return NextResponse.json({ error: `Google search failed: ${msg}`, reason: "tavily_failed" }, { status: 502 });
  }
  if (claudeSettled.status === "rejected") {
    const msg = claudeSettled.reason instanceof Error ? claudeSettled.reason.message : String(claudeSettled.reason);
    return NextResponse.json({ error: `AI search failed: ${msg}`, reason: "claude_failed" }, { status: 502 });
  }

  // --- Build host sets ---
  const tavilyByHost = new Map<string, { url: string; title: string; content: string }>();
  for (const r of tavilySettled.value.results) {
    const host = hostOf(r.url);
    if (!host || host === selfHost) continue;
    if (!tavilyByHost.has(host)) {
      tavilyByHost.set(host, { url: r.url, title: r.title, content: r.content });
    }
  }

  const claudeByHost = new Map<string, { url: string; title: string }>();
  for (const c of claudeSettled.value.citations) {
    const host = hostOf(c.url);
    if (!host || host === selfHost) continue;
    if (!claudeByHost.has(host)) {
      claudeByHost.set(host, { url: c.url, title: host });
    }
  }

  // --- Match: only hosts in BOTH sets ---
  const matched: { host: string; url: string; title: string; description: string; competitor_type: string }[] = [];
  for (const [host, tavilyEntry] of tavilyByHost) {
    if (!claudeByHost.has(host)) continue;
    const type = classifyCompetitor(tavilyEntry.url, tavilyEntry.title, tavilyEntry.content);
    if (type !== "direct") continue;
    matched.push({
      host,
      url: tavilyEntry.url,
      title: tavilyEntry.title,
      description: tavilyEntry.content.slice(0, 200),
      competitor_type: type,
    });
    if (matched.length >= MAX_MATCHED) break;
  }

  if (matched.length === 0) {
    return NextResponse.json(
      { error: "No competitors found in both Google and AI results. Try adding URLs manually.", reason: "no_match" },
      { status: 404 }
    );
  }

  // --- Register matched competitors ---
  const known = new Set(
    (await query<{ url: string }>("SELECT url FROM competitors WHERE evaluation_id = ?", [id])).map((r) =>
      hostOf(r.url)
    )
  );

  const registered = matched.filter((m) => !known.has(m.host));
  for (const m of registered) {
    await run(
      `INSERT INTO competitors (id, evaluation_id, url, competitor_name, competitor_type, discovered_via)
       VALUES (?, ?, ?, ?, ?, 'google_ai_match')`,
      [generateId(), id, m.url, m.host, m.competitor_type]
    );
  }

  return NextResponse.json({
    query: searchQuery,
    market: market || null,
    discovered_via: "google_ai_match",
    estimated_cost_usd: claudeSettled.value.usage.estimated_usd,
    google_results: tavilyByHost.size,
    ai_results: claudeByHost.size,
    matched: matched.length,
    already_known: matched.length - registered.length,
    results: matched.map((m) => ({
      url: m.url,
      title: m.title,
      description: m.description,
      competitor_type: m.competitor_type,
    })),
  });
}

