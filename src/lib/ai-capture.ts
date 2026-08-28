import { query, run, generateId } from "@/lib/db";
import { sameHost } from "@/lib/url";

interface ClaudeCitation {
  url: string;
  quoted_passage: string | null;
  position: number;
}

export interface ClaudeSearchResult {
  query: string;
  answer_text: string;
  citations: ClaudeCitation[];
  fan_out_queries: string[];
  /** Token spend for this capture, so cost per audit is reportable rather than assumed. */
  usage: {
    input_tokens: number;
    output_tokens: number;
    /** Floor estimate in USD — see `estimateCost`. */
    estimated_usd: number;
  };
}

/**
 * Per-million token prices. **The single place this is defined — do not re-declare it.**
 *
 * ⚠️ **UNCONFIRMED, and the whole cost model rests on it.** This file previously used $5/$25
 * while the prospecting grid route used $15/$75 — a 3× disagreement inside one codebase, with
 * every "can I afford this" answer riding on whichever one happened to be read. The $15/$75
 * pair is kept because it is the conservative one: over-estimating cost cannot cause an
 * unaffordable run, and under-estimating it can.
 *
 * **Check this against the Anthropic console before quoting a price to anyone.** Token counts
 * in `ai_answers` are measured and trustworthy; the dollars are those counts multiplied by a
 * number nobody has verified. If the real price differs, change it here and every estimate in
 * the app moves with it.
 *
 * Still a floor even when correct: cache reads bill at a fraction of input, and server-side
 * tool time is not exposed per call.
 */
export const USD_PER_MILLION_INPUT = 15;
export const USD_PER_MILLION_OUTPUT = 75;

const USD_PER_INPUT_TOKEN = USD_PER_MILLION_INPUT / 1_000_000;
const USD_PER_OUTPUT_TOKEN = USD_PER_MILLION_OUTPUT / 1_000_000;

function estimateCost(usage: Record<string, number>): number {
  const input = (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
  const cached = usage.cache_read_input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const dollars =
    input * USD_PER_INPUT_TOKEN + cached * USD_PER_INPUT_TOKEN * 0.1 + output * USD_PER_OUTPUT_TOKEN;
  return Math.round(dollars * 10_000) / 10_000;
}

/**
 * Claude engine adapter — captures real AI answers with web search.
 *
 * Uses claude-opus-5 with the web_search_20260209 tool to get answers that
 * include retrieved sources and quoted passages. This is ground truth for
 * calibrating the citation prediction model.
 *
 * Requires ANTHROPIC_API_KEY in environment.
 */

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
// claude-opus-4-20250514 sat here until 2026-08-07. It retired on 2026-06-15, so every call
// had been 404ing for seven weeks while the doc comment above already claimed opus-5.
const CLAUDE_MODEL = "claude-opus-5";

// Opus 5 thinks by default and `max_tokens` caps thinking *plus* response, so the old 4096
// truncated the answer before the citations arrived. 16000 is also the practical ceiling for
// a non-streaming request — above roughly that, the call needs streaming to dodge timeouts.
const MAX_TOKENS = 16000;

// The dynamic-filtering web search tool. The predecessor (web_search_20250305) is for models
// older than Opus 4.6 and returns unfiltered results.
const WEB_SEARCH_TOOL = "web_search_20260209";

// Fan-out feeds sub_intents, and five searches starves it — the whole point of capture is to
// see the sub-queries the assistant actually issues.
const MAX_SEARCHES = 12;

// Opus 5 ships elevated safety classifiers that can decline a request. A decline is a
// successful HTTP 200 carrying stop_reason "refusal", not an error status, so it has to be
// handled as a content outcome. Server-side fallbacks re-run the declined request on another
// model in the same call; "default" lets Anthropic route by refusal category rather than
// pinning a model here that will itself age out.
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Cost knobs.
 *
 * Measured on a real capture: input 73,924 tokens, output 4,471, ≈$0.48. Input is 94% of
 * the bill, and it is dominated by search results being re-fed into context across
 * code-execution turns — so the levers that matter are how many searches run and how much
 * the model deliberates between them. `maxTokens` is nearly irrelevant: output never came
 * close to the cap.
 *
 * `discovery` is the cheap profile. Discovery needs *breadth of retrieval*, not depth of
 * prose — we want the hosts and the sub-queries, and a serviceable answer is a by-product.
 */
export interface CaptureOptions {
  /** `low` | `medium` | `high`. Fewer deliberation turns means fewer results re-read. */
  effort?: "low" | "medium" | "high";
  /** Search rounds. The single biggest driver of input tokens. */
  maxSearches?: number;
  maxTokens?: number;
  /** Ask for a short sourced answer rather than a full write-up. */
  concise?: boolean;
  /**
   * Batch tag written to `ai_answers.capture_group_id`.
   *
   * Set by `captureRepeated` so "retrieved in 2 of 3 runs" reads an exact set of rows instead
   * of guessing from matching query text and a nearby timestamp.
   */
  captureGroupId?: string;
  /**
   * The `sub_intents` row this capture was made for, recorded on `ai_queries.sub_intent_id`.
   *
   * Without it, "capture citations for exactly these three questions" is inexpressible: the
   * question table and the capture table only relate by matching strings, and the moment a
   * question is reworded the link is gone. Nullable — ad-hoc captures have no sub-intent, and
   * that is a legitimate state rather than missing data.
   */
  subIntentId?: string;
}

/**
 * Tuned for competitor discovery. Measured on three live captures, 2026-08-07:
 *
 * | profile                          | input  | output | cost   | sources | fan-out |
 * |----------------------------------|--------|--------|--------|---------|---------|
 * | default (high, 12 searches)      | 73,924 |  4,471 | $1.44  |      50 |       7 |
 * | **discovery (medium, 6)**        | 21,769 |    974 | $0.40  |      22 |       3 |
 * | medium, 10 searches              | 31,000 |  1,153 | $0.55  |      20 |       3 |
 *
 * The token counts were measured and hold up — a 9-capture live run on 2026-08-09 averaged
 * 20,209 input and 960 output on the discovery profile, within a few percent of the row above.
 * The **dollar column was wrong** and has been recomputed: it was priced at $5/$25 per million
 * against Opus rates of $15/$75, understating every figure by 3x. Costs below are ~3x what this
 * table said before, and the ratio between profiles is unchanged — discovery is still the one
 * to use.
 *
 * Two things that measurement settled and intuition would not have:
 *
 *   1. **Raising `max_uses` buys nothing.** Ten searches cost 38% more than six and returned
 *      *fewer* sources with identical fan-out — the model uses roughly half its budget either
 *      way, so the cap is not the binding constraint.
 *   2. **Effort drives fan-out, not the search cap.** High effort produced 7 sub-queries,
 *      medium produced 3, at any cap. Deliberation between searches is what generates new
 *      angles, and it is also where the input tokens go.
 *
 * So discovery runs at medium/6 for $0.13 — 72% cheaper than the default, and 22 sources is
 * comfortably more than the ten competitors discovery needs. The fan-out shortfall is
 * covered by autocomplete, which is free; observed sub-queries still rank above it.
 */
export const DISCOVERY_PROFILE: CaptureOptions = {
  effort: "medium",
  maxSearches: 6,
  maxTokens: 6000,
  concise: true,
};

export async function captureClaudeAnswer(
  query: string,
  projectId: string,
  digitalAssetUrl?: string,
  options: CaptureOptions = {}
): Promise<ClaudeSearchResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — cannot capture Claude answers");
  }

  const effort = options.effort ?? "high";
  const maxSearches = options.maxSearches ?? MAX_SEARCHES;
  const maxTokens = options.maxTokens ?? MAX_TOKENS;

  // A concise instruction cuts output tokens without cutting searches — the retrieval set,
  // which is what discovery actually needs, is unaffected.
  const brevity = options.concise
    ? " Answer in under 200 words. Prioritise naming and citing the sources over explaining them."
    : "";

  const systemPrompt = digitalAssetUrl
    ? `You are a search assistant. Answer the user's question about "${query}". Use web search to find relevant sources. Provide an answer citing the sources you found. If the website ${digitalAssetUrl} appears in your results, note it specifically.${brevity}`
    : `You are a search assistant. Answer the user's question about "${query}". Use web search to find relevant sources. Provide an answer citing the sources you found.${brevity}`;

  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": FALLBACK_BETA,
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: maxTokens,
      fallbacks: "default",
      // Effort governs how much the model deliberates between searches, which is where the
      // input tokens go. Discovery does not need deep reasoning; it needs coverage.
      output_config: { effort },
      system: systemPrompt,
      tools: [
        {
          type: WEB_SEARCH_TOOL,
          name: "web_search",
          max_uses: maxSearches,
        },
      ],
      messages: [
        {
          role: "user",
          content: query,
        },
      ],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Claude API error: ${response.status} ${error}`);
  }

  const data = await response.json();

  // A refusal arrives as HTTP 200 with `content` empty or partial. Reading content blocks
  // unconditionally would store an empty answer as though the model had answered, which is
  // the worst outcome: calibration would score a capture that never happened.
  if (data?.stop_reason === "refusal") {
    const category = data?.stop_details?.category ?? "unspecified";
    throw new Error(
      `Claude declined this await query(${category}). No answer captured. ` +
        `Benign security and life-sciences phrasing can trip the classifiers — rewording the ` +
        `query usually clears it.`
    );
  }

  const answerText = extractAnswerText(data);
  const citations = extractCitations(data);
  const fanOutQueries = extractFanOutQueries(data);

  // Persist to database
  const queryId = await ensureAiQuery(projectId, query, "claude", options.subIntentId);
  const answerId = generateId();
  // `usage` is the only trustworthy cost signal — token counts estimated client-side drift,
  // and web search plus code execution mean the output is nowhere near the visible answer's
  // length. Stored per capture so cost per audit can be totalled rather than guessed.
  const usage = (data?.usage ?? {}) as Record<string, number>;

  await run(
    `INSERT INTO ai_answers (id, ai_query_id, project_id, engine, query, answer_text,
                             fan_out_queries, input_tokens, output_tokens,
                             cache_read_tokens, cache_write_tokens, model, capture_group_id,
                             captured_at)
     VALUES (?, ?, ?, 'claude', ?, ?, ?, ?, ?, ?, ?, ?, ?, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))`,
    [
      answerId,
      queryId,
      projectId,
      query,
      answerText,
      JSON.stringify(fanOutQueries),
      usage.input_tokens ?? null,
      usage.output_tokens ?? null,
      usage.cache_read_input_tokens ?? null,
      usage.cache_creation_input_tokens ?? null,
      typeof data?.model === "string" ? data.model : CLAUDE_MODEL,
      options.captureGroupId ?? null,
    ]
  );

  for (const citation of citations) {
    const isSelf = digitalAssetUrl && sameHost(citation.url, digitalAssetUrl);
    await run(
      `INSERT INTO ai_citations (id, ai_answer_id, project_id, url, quoted_passage, position, is_self, captured_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))`,
      [
        generateId(),
        answerId,
        projectId,
        citation.url,
        citation.quoted_passage,
        citation.position,
        isSelf ? 1 : 0,
      ]
    );
  }

  return {
    query,
    answer_text: answerText,
    citations,
    fan_out_queries: fanOutQueries,
    usage: {
      input_tokens: usage.input_tokens ?? 0,
      output_tokens: usage.output_tokens ?? 0,
      estimated_usd: estimateCost(usage),
    },
  };
}

/**
 * The visible answer.
 *
 * Opus 5 splits a long answer across many `text` blocks — sixty-four blocks on one observed
 * response — and interleaves them with thinking and tool traffic. Joining every text block
 * with a blank line inserted paragraph breaks mid-sentence, so consecutive blocks are
 * concatenated directly and only a genuine break between runs of text gets the blank line.
 *
 * Thinking blocks are deliberately excluded: they are the model's reasoning, not the answer
 * a user would see, and the point of capture is what gets shown.
 */
function extractAnswerText(data: { content: unknown[] }): string {
  const content = data.content;
  if (!Array.isArray(content)) return "";

  const parts: string[] = [];
  let previousWasText = false;

  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as Record<string, unknown>;

    if (b.type !== "text") {
      previousWasText = false;
      continue;
    }

    const text = typeof b.text === "string" ? b.text : "";
    if (!text) continue;

    parts.push(previousWasText ? text : (parts.length > 0 ? `\n\n${text}` : text));
    previousWasText = true;
  }

  return parts.join("").trim();
}

/**
 * Cited sources, from the search-result blocks.
 *
 * Two things were wrong before, and both returned zero citations against a response that
 * carried twenty-five:
 *
 *   1. It read `block.tool`. The field is `block.name`.
 *   2. It expected results on the `server_tool_use` block. They arrive separately, in
 *      `web_search_tool_result.content` — an array of `{type, title, url, encrypted_content,
 *      page_age}`.
 *
 * `encrypted_content` is opaque, so there is no quotable passage here — only the URL and
 * title. That is what calibration needs: precision@5 compares predicted URLs against cited
 * URLs, and never touches the passage text.
 *
 * De-duplicated by URL. Dynamic filtering re-runs the same query across code-execution
 * turns, so the same source legitimately appears in several result blocks, and counting it
 * twice would inflate the denominator that precision@5 is measured over.
 */
function extractCitations(data: { content: unknown[] }): ClaudeCitation[] {
  const content = data.content;
  if (!Array.isArray(content)) return [];

  const citations: ClaudeCitation[] = [];
  const seen = new Set<string>();

  const add = (url: unknown, passage: unknown) => {
    if (typeof url !== "string" || !url) return;
    if (seen.has(url)) return;
    seen.add(url);
    citations.push({
      url,
      quoted_passage: typeof passage === "string" && passage ? passage : null,
      position: citations.length + 1,
    });
  };

  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as Record<string, unknown>;

    // The search results themselves.
    if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
      for (const item of b.content as Record<string, unknown>[]) {
        add(item?.url, item?.title);
      }
    }

    // Inline citations on assistant text, when the model attaches them. Absent on the
    // responses observed so far, but cheap to support and the richer source when present —
    // these carry the actual quoted span.
    if (b.type === "text" && Array.isArray(b.citations)) {
      for (const c of b.citations as Record<string, unknown>[]) {
        add(c?.url, c?.cited_text ?? c?.quoted_text);
      }
    }
  }

  return citations;
}

/**
 * The sub-queries the assistant actually issued — the fan-out.
 *
 * This is the most valuable thing capture produces: real evidence of how an assistant
 * decomposes a question, as against the autocomplete-derived guesses in `demand.ts`.
 *
 * It read `block.tool` where the field is `block.name`, so it always returned an empty
 * array. There is a second trap: with `web_search_20260209` the model drives search from
 * inside code execution, so most `server_tool_use` blocks are `name: "code_execution"` and
 * carry Python source, not a query. Only the `web_search` ones hold a query.
 */
function extractFanOutQueries(data: { content: unknown[] }): string[] {
  const content = data.content;
  if (!Array.isArray(content)) return [];

  const queries: string[] = [];
  const seen = new Set<string>();

  for (const block of content) {
    if (typeof block !== "object" || block === null) continue;
    const b = block as Record<string, unknown>;
    if (b.type !== "server_tool_use" || b.name !== "web_search") continue;

    const query = (b.input as { query?: unknown } | undefined)?.query;
    if (typeof query !== "string" || !query.trim()) continue;

    // Dynamic filtering repeats a query across turns; each distinct sub-query counts once.
    const key = query.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    queries.push(query.trim());
  }

  return queries;
}

async function ensureAiQuery(
  projectId: string,
  queryString: string,
  engine: string,
  subIntentId?: string
): Promise<string> {
  const existing = await query<{ id: string; sub_intent_id: string | null }>(
    "SELECT id, sub_intent_id FROM ai_queries WHERE project_id = ? AND query = ? AND engine = ?",
    [projectId, queryString, engine]
  );
  if (existing.length > 0) {
    // Backfill only. An existing row that already names a sub-intent keeps it: the same query
    // text can legitimately be reached from two questions, and overwriting would silently
    // re-point every historical answer at whichever capture ran most recently.
    if (subIntentId && !existing[0].sub_intent_id) {
      await run("UPDATE ai_queries SET sub_intent_id = ? WHERE id = ?", [subIntentId, existing[0].id]);
    }
    return existing[0].id;
  }

  const id = generateId();
  await run(
    `INSERT INTO ai_queries (id, project_id, query, engine, tracked, sub_intent_id, created_at)
     VALUES (?, ?, ?, ?, 1, ?, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))`,
    [id, projectId, queryString, engine, subIntentId ?? null]
  );
  return id;
}


/**
 * Computes Citation Share for a project: what fraction of tracked AI queries
 * cite the user's own site, across all engines.
 */
export async function computeCitationShare(projectId: string): Promise<{
  totalQueries: number;
  citedQueries: number;
  citationShare: number;
  perEngine: { engine: string; total: number; cited: number; share: number }[];
}> {
  const answers = await query<{ id: string; engine: string; query: string }>(
    "SELECT id, engine, query FROM ai_answers WHERE project_id = ?",
    [projectId]
  );

  if (answers.length === 0) {
    return { totalQueries: 0, citedQueries: 0, citationShare: 0, perEngine: [] };
  }

  const perEngineMap = new Map<string, { total: number; cited: number }>();
  let citedQueries = 0;

  for (const answer of answers) {
    const selfCitations = await query<{ count: number }>(
      "SELECT COUNT(*) as count FROM ai_citations WHERE ai_answer_id = ? AND is_self = 1",
      [answer.id]
    );
    const isCited = (selfCitations[0]?.count ?? 0) > 0;
    if (isCited) citedQueries++;

    if (!perEngineMap.has(answer.engine)) {
      perEngineMap.set(answer.engine, { total: 0, cited: 0 });
    }
    const entry = perEngineMap.get(answer.engine)!;
    entry.total++;
    if (isCited) entry.cited++;
  }

  const perEngine = Array.from(perEngineMap.entries()).map(([engine, data]) => ({
    engine,
    total: data.total,
    cited: data.cited,
    share: data.total > 0 ? Math.round((data.cited / data.total) * 100) / 100 : 0,
  }));

  return {
    totalQueries: answers.length,
    citedQueries,
    citationShare: answers.length > 0 ? Math.round((citedQueries / answers.length) * 100) / 100 : 0,
    perEngine,
  };
}

/**
 * Ask the same question N times, as one batch.
 *
 * Repetition is the whole point of the prospecting grid. A single capture tells you a business
 * was retrieved once, which is indistinguishable from luck; three tell you whether it holds.
 * "Retrieved in 2 of 3" is the claim, and it only means anything if the three runs are
 * genuinely independent observations.
 *
 * Two things make them not independent, and both are silent:
 *
 *   1. **`/discover` reuses captures.** It deliberately returns an existing capture for the
 *      same query rather than re-paying. Loop through that path and you get the same row three
 *      times and a confident "3 of 3" from one observation. This function calls
 *      `captureClaudeAnswer` directly, which never reuses.
 *   2. **Prompt caching.** Identical requests back to back can be served from cache. The delay
 *      below is not politeness — it is what makes run 2 a second look rather than an echo of
 *      run 1.
 *
 * Failures are collected, not thrown. Two good runs out of three is a weaker claim but a real
 * one; losing both to an error on the third would be worse.
 */
export async function captureRepeated(
  queryString: string,
  projectId: string,
  runs: number,
  digitalAssetUrl?: string,
  options: CaptureOptions = {},
  delayMs = 1500
): Promise<{
  captureGroupId: string;
  requested: number;
  completed: number;
  results: ClaudeSearchResult[];
  failures: { run: number; error: string }[];
}> {
  const captureGroupId = generateId();
  const results: ClaudeSearchResult[] = [];
  const failures: { run: number; error: string }[] = [];

  for (let i = 0; i < runs; i++) {
    if (i > 0 && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    try {
      results.push(
        await captureClaudeAnswer(queryString, projectId, digitalAssetUrl, {
          ...options,
          captureGroupId,
        })
      );
    } catch (e) {
      failures.push({ run: i + 1, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return { captureGroupId, requested: runs, completed: results.length, results, failures };
}
