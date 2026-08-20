/**
 * robots.txt parsing for AI crawlers — pure, so it can be tested against real files.
 *
 * Split out of `geo.ts` for the same reason `grid-score.ts` is split out of `grid.ts` and
 * `brief-format.ts` out of `briefs.ts`: `geo.ts` imports the database, and a module that
 * imports the database cannot be run under bare `node --test`. Every claim here ends up in a
 * document sent to a stranger, so it is exactly the code that must be testable.
 */

/**
 * AI crawlers, grouped by the platform a client actually cares about.
 *
 * One platform, several user agents — Anthropic alone ships `ClaudeBot`, `Claude-Web`,
 * `Claude-SearchBot` and the legacy `anthropic-ai`, and a robots.txt commonly names some but
 * not all. A platform counts as blocked if **any** of its agents is disallowed, because one
 * blocked agent is enough to lose the retrieval.
 *
 * Corrected against a live file on 2026-08-09. The previous list had six entries and missed
 * `Applebot-Extended`, `CCBot`, `meta-externalagent`, `anthropic-ai` and `Claude-Web`, so an
 * audit of `claytoninsurancebrokers.com.au` reported "blocks 5 AI crawlers" against a
 * robots.txt that disallows eleven agents across nine platforms. Understating the problem in a
 * document whose entire job is to name the problem.
 *
 * `Amazonbot` was also labelled "Alexa/Roku". Roku has nothing to do with Amazonbot, and a
 * wrong product name in a client deliverable costs more credibility than the finding earns.
 */
export const AI_CRAWLERS = [
  { platform: "ChatGPT", agents: ["GPTBot", "OAI-SearchBot", "ChatGPT-User"] },
  { platform: "Claude", agents: ["ClaudeBot", "Claude-Web", "Claude-SearchBot", "anthropic-ai"] },
  { platform: "Perplexity", agents: ["PerplexityBot", "Perplexity-User"] },
  { platform: "Google AI", agents: ["Google-Extended"] },
  { platform: "Apple Intelligence", agents: ["Applebot-Extended"] },
  { platform: "Meta AI", agents: ["meta-externalagent", "FacebookBot"] },
  { platform: "Amazon", agents: ["Amazonbot"] },
  { platform: "ByteDance", agents: ["Bytespider"] },
  { platform: "Common Crawl", agents: ["CCBot"] },
  { platform: "Cohere", agents: ["cohere-ai", "cohere-training-data-crawler"] },
];

/**
 * Whether a robots.txt section disallows everything.
 *
 * `Disallow: /` blocks the site. A bare `Disallow:` is the opposite — it permits everything —
 * so the two cannot be told apart by substring matching alone.
 */
function sectionBlocksAll(section: string): boolean {
  return section
    .split(/\r?\n/)
    .some((line) => /^\s*Disallow:\s*\/\s*$/i.test(line));
}

/**
 * The robots.txt section for one user agent.
 *
 * Anchored to a whole line, so `GPTBot` cannot match a hypothetical `GPTBot-Image` and
 * report a block that was never written. The previous implementation used an unanchored
 * `User-agent:\\s*NAME` substring match, which had exactly that failure mode.
 */
function sectionForAgent(robotsTxt: string, agent: string): string | null {
  const escaped = agent.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^[ \\t]*User-agent:[ \\t]*${escaped}[ \\t]*$`, "im");
  const match = robotsTxt.match(pattern);
  if (!match || match.index === undefined) return null;

  const after = robotsTxt.substring(match.index + match[0].length);
  const next = after.match(/^[ \t]*User-agent:/im);
  return next && next.index !== undefined ? after.substring(0, next.index) : after;
}

/**
 * Whether the blocks come from Cloudflare's managed robots.txt rather than a deliberate
 * choice by the site owner.
 *
 * This is the single most useful fact in the whole crawlability section and the audit did not
 * report it. Cloudflare injects a managed block list, so the site owner often has no idea the
 * rules exist — and the fix is a toggle in a dashboard, not a code change. "You are blocking
 * nine AI platforms" and "your CDN turned this on and you can turn it off in a minute" are
 * very different conversations, and only one of them closes.
 */
export function blocksAreCloudflareManaged(robotsTxt: string | null): boolean {
  if (!robotsTxt) return false;
  return /BEGIN Cloudflare Managed content/i.test(robotsTxt);
}


export function parseRobotsForAiCrawlers(robotsTxt: string | null): {
  allowed: string[];
  blocked: string[];
  hasRobotsTxt: boolean;
} {
  if (!robotsTxt) {
    return { allowed: [], blocked: [], hasRobotsTxt: false };
  }

  const allowed: string[] = [];
  const blocked: string[] = [];

  // The `User-agent: *` section is the fallback for any agent without its own rules.
  const wildcard = sectionForAgent(robotsTxt, "\*");
  const wildcardBlocks = wildcard !== null && sectionBlocksAll(wildcard);

  for (const crawler of AI_CRAWLERS) {
    const sections = crawler.agents
      .map((agent) => sectionForAgent(robotsTxt, agent))
      .filter((section): section is string => section !== null);

    if (sections.length === 0) {
      // No rule naming any of this platform's agents, so the wildcard decides.
      (wildcardBlocks ? blocked : allowed).push(crawler.platform);
      continue;
    }

    // Any one blocked agent loses the retrieval, so the platform counts as blocked.
    (sections.some(sectionBlocksAll) ? blocked : allowed).push(crawler.platform);
  }

  return { allowed, blocked, hasRobotsTxt: true };
}

/**
 * Fetch a site's robots.txt.
 *
 * Tolerates a missing scheme — two of fourteen evaluations store a bare hostname, and
 * `new URL("example.com")` throws rather than guessing.
 */
export async function fetchRobotsTxt(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url.startsWith("http") ? url : `https://${url}`);
    const robotsUrl = `${parsed.protocol}//${parsed.hostname}/robots.txt`;
    const res = await fetch(robotsUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
