import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRobotsForAiCrawlers, blocksAreCloudflareManaged } from "./robots.ts";

/**
 * Anchored on a real file.
 *
 * The excerpt below is the live `claytoninsurancebrokers.com.au/robots.txt` as of 2026-08-09,
 * which is what exposed the original defect: the audit reported "blocks 5 AI crawlers" against
 * a file disallowing eleven agents across nine platforms. Verifying a claim against the site
 * it describes is the whole point of the rule, and it took one check to find.
 */
const CLAYTON = `# BEGIN Cloudflare Managed content

User-agent: *
Content-Signal: search=yes,ai-train=no,use=reference
Allow: /

User-agent: Amazonbot
Disallow: /

User-agent: Applebot-Extended
Disallow: /

User-agent: Bytespider
Disallow: /

User-agent: CCBot
Disallow: /

User-agent: Claude-Web
Disallow: /

User-agent: ClaudeBot
Disallow: /

User-agent: GPTBot
Disallow: /

User-agent: Google-Extended
Disallow: /

User-agent: anthropic-ai
Disallow: /

User-agent: meta-externalagent
Disallow: /

# END Cloudflare Managed content
`;

test("every blocked platform in a real robots.txt is reported", () => {
  const { blocked } = parseRobotsForAiCrawlers(CLAYTON);

  // The old six-entry list missed Apple, Meta and Common Crawl entirely, so an audit
  // understated the problem in a document whose only job is to name the problem.
  for (const platform of [
    "ChatGPT",
    "Claude",
    "Google AI",
    "Apple Intelligence",
    "Meta AI",
    "Amazon",
    "ByteDance",
    "Common Crawl",
  ]) {
    assert.ok(blocked.includes(platform), `${platform} should be blocked. got: ${blocked.join(", ")}`);
  }
});

test("a platform is blocked when any one of its agents is", () => {
  // Anthropic ships four agent names and a robots.txt commonly names some but not all. One
  // blocked agent is enough to lose the retrieval.
  const oneAgentOnly = `User-agent: *\nAllow: /\n\nUser-agent: anthropic-ai\nDisallow: /\n`;
  assert.ok(parseRobotsForAiCrawlers(oneAgentOnly).blocked.includes("Claude"));
});

test("an unblocked platform is not reported as blocked", () => {
  const { allowed, blocked } = parseRobotsForAiCrawlers(CLAYTON);
  assert.ok(allowed.includes("Perplexity"), "Perplexity has no rule and the wildcard allows");
  assert.ok(!blocked.includes("Perplexity"));
});

test("a bare Disallow permits rather than blocks", () => {
  // `Disallow:` with no path is the opposite of `Disallow: /`, and substring matching cannot
  // tell them apart.
  const permissive = `User-agent: GPTBot\nDisallow:\n`;
  assert.ok(parseRobotsForAiCrawlers(permissive).allowed.includes("ChatGPT"));
  assert.ok(!parseRobotsForAiCrawlers(permissive).blocked.includes("ChatGPT"));
});

test("agent matching is anchored, so a longer name is not a match", () => {
  // The old unanchored `User-agent:\s*GPTBot` pattern matched `GPTBot-Image` and would report
  // a block nobody wrote.
  const other = `User-agent: GPTBot-Image\nDisallow: /\n\nUser-agent: *\nAllow: /\n`;
  assert.ok(!parseRobotsForAiCrawlers(other).blocked.includes("ChatGPT"));
});

test("a wildcard site-wide block blocks every platform", () => {
  const closed = `User-agent: *\nDisallow: /\n`;
  const { blocked, allowed } = parseRobotsForAiCrawlers(closed);
  assert.equal(allowed.length, 0);
  assert.ok(blocked.length >= 8);
});

test("a missing robots.txt is not a block", () => {
  const result = parseRobotsForAiCrawlers(null);
  assert.equal(result.hasRobotsTxt, false);
  assert.deepEqual(result.blocked, []);
});

test("Cloudflare-managed blocks are identified", () => {
  // Changes the pitch entirely: a dashboard toggle the owner may not know is on, not a
  // deliberate policy to argue with.
  assert.ok(blocksAreCloudflareManaged(CLAYTON));
  assert.ok(!blocksAreCloudflareManaged("User-agent: *\nDisallow: /\n"));
  assert.ok(!blocksAreCloudflareManaged(null));
});
