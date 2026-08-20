import { NextRequest, NextResponse } from "next/server";
import { query, queryOne } from "@/lib/db";
import { exportAudit, type Tier } from "@/lib/export";
import {
  blocksAreCloudflareManaged,
  fetchRobotsTxt,
  parseRobotsForAiCrawlers,
} from "@/lib/geo";
import type { Evaluation } from "@/types";
import { hostOf } from "@/lib/url";

/**
 * The deliverable, as Markdown.
 *
 * Separate from `/report`, which serves JSON to the in-app report view. This one returns the
 * document an agency forwards under their own logo — unbranded, editable, no locked PDF.
 *
 *   GET /api/evaluations/[id]/export?tier=1        → free snapshot, top 3 fixes only
 *   GET /api/evaluations/[id]/export?tier=2        → full gap list + briefs + hygiene appendix
 *   &download=1                                     → Content-Disposition attachment
 *   &robots=0                                       → skip the live crawlability fetch
 *
 * Crawlability is fetched live rather than read from the last analysis run, because it is the
 * one finding a client may have acted on since — reporting a stale block would be the single
 * most embarrassing error this document could contain.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const evaluation = await queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });

  const tierParam = req.nextUrl.searchParams.get("tier");
  const tier: Tier = tierParam === "2" ? 2 : 1;
  const checkRobots = req.nextUrl.searchParams.get("robots") !== "0";

  let crawlability = null;
  let competitorsBlockingAi: string[] = [];

  if (checkRobots) {
    const selfRobotsTxt = await fetchRobotsTxt(evaluation.digital_asset_url);
    const selfRobots = parseRobotsForAiCrawlers(selfRobotsTxt);
    crawlability = {
      blocked_crawlers: selfRobots.blocked,
      has_robots_txt: selfRobots.hasRobotsTxt,
      disqualified: selfRobots.blocked.length > 0,
      cloudflare_managed: blocksAreCloudflareManaged(selfRobotsTxt),
    };

    // The field-wide version of the same gate. Only competitors that were actually crawled —
    // an unreachable site tells us nothing about its robots policy.
    const rivals = await query<{ url: string }>(
      `SELECT DISTINCT c.url
         FROM competitors c
         JOIN page_content p ON p.competitor_id = c.id AND p.evaluation_id = c.evaluation_id
        WHERE c.evaluation_id = ? AND (c.competitor_type IS NULL OR c.competitor_type != 'self')`,
      [id]
    );
    const checked = await Promise.all(
      rivals.map(async (r) => ({
        url: r.url,
        blocked: parseRobotsForAiCrawlers(await fetchRobotsTxt(r.url)).blocked.length > 0,
      }))
    );
    competitorsBlockingAi = checked.filter((c) => c.blocked).map((c) => hostOf(c.url));
  }

  const unreachable = (await query<{ url: string }>(
    `SELECT c.url FROM competitors c
      WHERE c.evaluation_id = ?
        AND (c.competitor_type IS NULL OR c.competitor_type != 'self')
        AND NOT EXISTS (
          SELECT 1 FROM page_content p
           WHERE p.competitor_id = c.id AND p.evaluation_id = c.evaluation_id
        )`,
    [id]
  )).map((r) => hostOf(r.url));

  // Did we read the client's own site at all? Distinct from robots.txt permitting us to.
  const selfPages = await queryOne<{ n: number }>(
    `SELECT COUNT(*) n FROM page_content p
       JOIN competitors c ON c.id = p.competitor_id
      WHERE p.evaluation_id = ? AND c.competitor_type = 'self'`,
    [id]
  );

  const markdown = await exportAudit({
    evaluationId: id,
    tier,
    crawlability,
    competitorsBlockingAi,
    unreachable,
    selfReachable: (selfPages?.n ?? 0) > 0,
  });

  // Not `|| digital_asset_url` here: an unparseable url is exactly the one that would carry a
  // slash or a quote into Content-Disposition. A dull constant is the safe fallback.
  const filename = `${hostOf(evaluation.digital_asset_url) || "evaluation"}-ai-visibility-tier${tier}.md`;
  const headers: Record<string, string> = {
    "Content-Type": "text/markdown; charset=utf-8",
  };
  if (req.nextUrl.searchParams.get("download") === "1") {
    headers["Content-Disposition"] = `attachment; filename="${filename}"`;
  }

  return new NextResponse(markdown, { headers });
}

