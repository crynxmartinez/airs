import { NextRequest, NextResponse } from "next/server";
import { searchDuckDuckGo, classifyCompetitor, resolveRegion, ALL_REGIONS } from "@/lib/search";

/**
 * Competitor discovery.
 *
 * The region is resolved explicitly and returned to the caller, because a silently
 * wrong region is invisible in the results — an Australian evaluation came back full
 * of Philippine brokers and nothing in the response said why.
 */
export async function POST(req: NextRequest) {
  const { query: searchQuery, excludeUrl, location } = await req.json();

  if (!searchQuery) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  // Falls back to the asset's country TLD when no location was given.
  const region = resolveRegion(location, excludeUrl);
  // Only append the location to the query text when it is a real place; appending
  // "null" or a stray word narrows the search for no reason.
  const fullQuery = location && String(location).trim() ? `${searchQuery} ${String(location).trim()}` : searchQuery;

  try {
    const results = await searchDuckDuckGo(fullQuery, region);

    const excludeHost = (() => {
      if (!excludeUrl) return null;
      try {
        return new URL(excludeUrl.startsWith("http") ? excludeUrl : `https://${excludeUrl}`).hostname.replace("www.", "");
      } catch {
        return null;
      }
    })();

    // Deduplicate by host before taking the top 10. A domain often ranks several
    // times for one query, and coverage analysis groups by site anyway — so
    // duplicates silently shrink the competitive field rather than filling it.
    const seenHosts = new Set<string>();
    const competitors = results
      .filter((r) => {
        let host: string;
        try {
          host = new URL(r.url).hostname.replace("www.", "");
        } catch {
          return false;
        }
        if (excludeHost && host === excludeHost) return false;
        if (seenHosts.has(host)) return false;
        seenHosts.add(host);
        return true;
      })
      .slice(0, 10)
      .map((r) => ({
        url: r.url,
        title: r.title,
        description: r.description,
        competitor_type: classifyCompetitor(r.url, r.title, r.description),
        competitor_name: (() => {
          try {
            return new URL(r.url).hostname.replace("www.", "");
          } catch {
            return r.title;
          }
        })(),
      }));

    return NextResponse.json({
      results: competitors,
      region,
      region_source: location ? "location" : region !== ALL_REGIONS ? "asset_tld" : "all_regions",
      query: fullQuery,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
