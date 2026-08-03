import { NextRequest, NextResponse } from "next/server";
import { searchDuckDuckGo, classifyCompetitor } from "@/lib/search";

export async function POST(req: NextRequest) {
  const { query: searchQuery, excludeUrl } = await req.json();

  if (!searchQuery) {
    return NextResponse.json({ error: "Query is required" }, { status: 400 });
  }

  try {
    const results = await searchDuckDuckGo(searchQuery);

    const competitors = results
      .filter((r) => {
        if (!excludeUrl) return true;
        try {
          const resultHost = new URL(r.url).hostname.replace("www.", "");
          const excludeHost = new URL(excludeUrl).hostname.replace("www.", "");
          return resultHost !== excludeHost;
        } catch {
          return true;
        }
      })
      .slice(0, 10)
      .map((r) => ({
        url: r.url,
        title: r.title,
        description: r.description,
        competitor_type: classifyCompetitor(r.url, r.title, r.description),
        competitor_name: (() => {
          try {
            return new URL(r.url).hostname.replace("www.", "").replace(/^https?:\/\//, "");
          } catch {
            return r.title;
          }
        })(),
      }));

    return NextResponse.json({ results: competitors });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Search failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
