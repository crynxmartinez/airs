/**
 * Headless audit runner — one command, one Markdown file.
 *
 * This looks like platform work and isn't. The whole outreach motion is twenty unsolicited
 * Tier 1 audits before breakfast, and that is impossible by hand. It passes the tool test:
 * I would build it if I were the only person who would ever use it, because I am the one
 * running it twenty times.
 *
 * It orchestrates the existing HTTP routes rather than reimplementing the pipeline. Two
 * reasons: the analysis logic stays in exactly one place, and the runner exercises the same
 * code path the app does, so a bug here is a bug there.
 *
 *   npm run audit -- --url acme.com.au --query "commercial cleaning" --location Australia
 *   npm run audit -- --csv ./prospects.csv --tier 1 --out ./audits
 *
 * CSV columns: url,query,location  (header row required)
 *
 * Requires the dev server to be running. A failing target is logged and the run continues —
 * one unreachable prospect must not cost the other nineteen.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { hostOf as canonicalHost, normaliseUrl } from "../src/lib/url.ts";

interface Target {
  url: string;
  query: string;
  location?: string;
}

interface Options {
  base: string;
  tier: 1 | 2;
  out: string;
  limit: number;
  targets: Target[];
}

const DEFAULT_BASE = process.env.AIRS_BASE_URL ?? "http://localhost:3000";

async function main(): Promise<void> {
  const opts = await parseArgs(process.argv.slice(2));
  if (opts.targets.length === 0) {
    usage("No targets. Pass --url and --query, or --csv <file>.");
    process.exitCode = 1;
    return;
  }

  await mkdir(opts.out, { recursive: true });
  console.log(`${opts.targets.length} target(s) → ${opts.out}  (tier ${opts.tier})\n`);

  let ok = 0;
  let totalCost = 0;
  const failures: { target: Target; reason: string }[] = [];

  for (const [i, target] of opts.targets.entries()) {
    const label = `[${i + 1}/${opts.targets.length}] ${target.url}`;
    try {
      const { path, costUsd } = await auditOne(target, opts);
      totalCost += costUsd;
      console.log(`${label} → ${path}${costUsd > 0 ? `  ($${costUsd.toFixed(3)})` : "  (cached)"}`);
      ok += 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`${label} FAILED: ${reason}`);
      failures.push({ target, reason });
    }
  }

  console.log(`\n${ok} succeeded, ${failures.length} failed. Estimated AI spend: $${totalCost.toFixed(2)}.`);
  if (failures.length > 0) {
    // Written to disk as well as stdout: a batch of twenty scrolls past, and the failures
    // are the part worth acting on.
    const log = failures.map((f) => `${f.target.url}\t${f.target.query}\t${f.reason}`).join("\n");
    await writeFile(join(opts.out, "failures.tsv"), `url\tquery\treason\n${log}\n`, "utf-8");
    console.log(`Failures written to ${join(opts.out, "failures.tsv")}`);
    process.exitCode = 1;
  }
}

/**
 * One target, end to end: project → evaluation → competitors → crawl → self → demand →
 * analysis → export. Each step is the same route the UI calls.
 */
async function auditOne(target: Target, opts: Options): Promise<{ path: string; costUsd: number }> {
  const { base, tier } = opts;
  const host = hostOf(target.url);

  const project = await api<{ id: string }>(base, "POST", "/api/projects", {
    name: host,
    description: target.url,
  });

  const evaluation = await api<{ id: string }>(base, "POST", "/api/evaluations", {
    project_id: project.id,
    primary_query: target.query,
    // Prospect audits are commercial by definition — someone is being sold to. This also
    // switches on the intent gates: contestable-rival scoping and the buyer-question filter.
    search_intent: "transactional",
    digital_asset_url: normaliseUrl(target.url),
    target_location: target.location ?? null,
  });

  // Discovery: whoever the assistant actually retrieves for this query. One capture returns
  // both the competitor set and the fan-out sub-queries, and /discover registers and
  // classifies them in the same call — so unlike the old search path there is no separate
  // fetch-classify-store dance here.
  //
  // There is no search-engine fallback by design. A failed capture fails the target rather
  // than quietly substituting SERP results the report would go on to call "AI-retrieved".
  const discovery = await api<{
    registered: number;
    retrieved_hosts: number;
    estimated_cost_usd: number;
    fan_out_stored: number;
  }>(base, "POST", `/api/evaluations/${evaluation.id}/discover`, { limit: opts.limit });

  if (!discovery.retrieved_hosts) {
    throw new Error(`the assistant retrieved no sources for "${target.query}"`);
  }

  const competitors = await api<{ id: string; url: string }[]>(
    base,
    "GET",
    `/api/evaluations/${evaluation.id}/competitors`
  );

  // Crawl each one. A single unreachable competitor is normal — ausure.com.au 403s
  // everything — and the export names it rather than pretending the field was complete.
  for (const c of competitors.slice(0, opts.limit)) {
    try {
      await api(base, "POST", `/api/evaluations/${evaluation.id}/crawl`, {
        url: c.url,
        evaluation_id: evaluation.id,
        competitor_id: c.id,
      });
    } catch {
      // Recorded by the export as unreachable; not fatal to the audit.
    }
  }

  // The client's own site, so the report has a "you" to compare against.
  //
  // A target whose own site cannot be read is not auditable, and the run must stop here. A
  // nonexistent domain previously produced a complete, confident-looking audit that opened
  // "Yes, this site allows the major AI crawlers" — because an unreachable host returns no
  // robots.txt, and no robots.txt reads as permissive. Sending that to an agency is the one
  // failure that ends the channel.
  const self = await api<{ pages_stored?: number; pages_crawled?: number }>(
    base,
    "POST",
    `/api/evaluations/${evaluation.id}/self`,
    {}
  ).catch(() => ({ pages_stored: 0, pages_crawled: 0 }));

  if (!self.pages_stored) {
    throw new Error(
      `could not read ${target.url} — 0 pages crawled. Nothing to audit; check the URL is live.`
    );
  }

  // Demand, then coverage. Demand must run first — analysis reads sub_intents.
  await api(base, "POST", `/api/evaluations/${evaluation.id}/demand`, {}).catch(() => undefined);
  await api(base, "GET", `/api/evaluations/${evaluation.id}/analysis?limit=12`);

  const markdown = await text(base, `/api/evaluations/${evaluation.id}/export?tier=${tier}`);
  const filename = `${host}-tier${tier}.md`;
  const path = join(opts.out, filename);
  await writeFile(path, markdown, "utf-8");
  return { path, costUsd: discovery.estimated_cost_usd ?? 0 };
}

// ---------------------------------------------------------------- http

async function api<T>(base: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    // A crawl of five pages behind a slow origin genuinely takes minutes.
    signal: AbortSignal.timeout(300_000),
  });
  const raw = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${raw.slice(0, 200)}`);
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as T;
  }
}

async function text(base: string, path: string): Promise<string> {
  const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(300_000) });
  const raw = await res.text();
  if (!res.ok) throw new Error(`GET ${path} → ${res.status} ${raw.slice(0, 200)}`);
  return raw;
}

// ---------------------------------------------------------------- args

async function parseArgs(argv: string[]): Promise<Options> {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    flags.set(key, next && !next.startsWith("--") ? next : "true");
    if (next && !next.startsWith("--")) i += 1;
  }

  const targets: Target[] = [];
  const csv = flags.get("csv");
  if (csv) {
    targets.push(...(await readTargets(csv)));
  } else if (flags.get("url") && flags.get("query")) {
    targets.push({
      url: flags.get("url")!,
      query: flags.get("query")!,
      location: flags.get("location"),
    });
  }

  return {
    base: flags.get("base") ?? DEFAULT_BASE,
    tier: flags.get("tier") === "2" ? 2 : 1,
    out: flags.get("out") ?? "./audits",
    limit: Number(flags.get("limit") ?? 10),
    targets,
  };
}

/** Minimal CSV: quoted fields supported, embedded newlines not. Prospect lists are flat. */
async function readTargets(path: string): Promise<Target[]> {
  const raw = await readFile(path, "utf-8");
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const [urlAt, queryAt, locationAt] = [col("url"), col("query"), col("location")];
  if (urlAt < 0 || queryAt < 0) {
    throw new Error(`CSV must have "url" and "query" columns; found: ${header.join(", ")}`);
  }

  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return {
      url: (cells[urlAt] ?? "").trim(),
      query: (cells[queryAt] ?? "").trim(),
      location: locationAt >= 0 ? (cells[locationAt] ?? "").trim() || undefined : undefined,
    };
  }).filter((t) => t.url && t.query);
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }
  cells.push(cell);
  return cells;
}

function usage(message?: string): void {
  if (message) console.error(`${message}\n`);
  console.error(
    [
      "Usage:",
      '  npm run audit -- --url acme.com.au --query "commercial cleaning" --location Australia',
      "  npm run audit -- --csv ./prospects.csv --tier 1 --out ./audits",
      "",
      "  --tier 1|2     1 = free snapshot (default), 2 = full package",
      "  --out DIR      output directory (default ./audits)",
      "  --limit N      max competitors to crawl per target (default 10)",
      "  --base URL     server base (default http://localhost:3000)",
      "",
      "CSV columns: url,query,location  (header row required)",
      "The dev server must be running.",
    ].join("\n")
  );
}



main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

/**
 * Host for display and for the output filename.
 *
 * Wraps the canonical `hostOf`, which returns "" for anything unparseable — fine for
 * grouping, useless as a filename. A bad target still needs to appear in the failure log
 * under something recognisable.
 */
function hostOf(url: string): string {
  return canonicalHost(url) || url.replace(/[^a-z0-9.-]/gi, "-");
}
