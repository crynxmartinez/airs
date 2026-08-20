/**
 * The deliverable.
 *
 * AIRS is not the product — a document is. Until now nothing rendered one: the report route
 * serialised the hygiene layer (evaluation, competitors, evidence, findings, recommendations,
 * scores) into a `reports` table with zero rows that nothing read, and the coverage verdicts,
 * ranked weaknesses, and content briefs — the entire Tier 2 output — were excluded.
 *
 * Three rules this file exists to enforce:
 *
 *   1. **Every claim traces to a row.** Prevalence figures state the denominator they were
 *      computed over, quotes come from `coverage.passage`, and nothing is asserted that
 *      cannot be checked against the database or the live site in under a minute. An agency
 *      forwards this under their own logo; a single unverifiable sentence ends that channel.
 *
 *   2. **Absence is stated, not hidden.** No captured AI answers, unreachable competitors, a
 *      corpus of the wrong intent — each is printed. A report that quietly omits what it
 *      could not measure reads as complete when it is not.
 *
 *   3. **Markdown, unbranded.** A locked PDF is useless to a reseller who needs to drop a
 *      logo on it and edit a sentence.
 *
 * Tier 1 is deliberately incomplete: it names the top three fixes and stops. Tier 2 is the
 * full ranked list with briefs.
 */

import { query, queryOne } from "@/lib/db";
import { looksLikeProse, stripProcessNarration, trimToBoundary } from "@/lib/prose";
import { hostOf } from "@/lib/url";

export type Tier = 1 | 2;

interface EvaluationRow {
  id: string;
  primary_query: string;
  search_intent: string;
  digital_asset_url: string;
  target_location: string | null;
  rrs_score: number | null;
  rating: string | null;
  created_at: string;
}

interface CoverageRow {
  competitor_label: string;
  question: string;
  answer_type: string;
  level: string;
  specificity: number;
  passage: string | null;
  gap_evidence: string | null;
  source_url: string | null;
}

interface BriefRow {
  question: string;
  answer_type: string;
  weakness_score: number;
  effort: string;
  rationale: string;
  evidence: string | null;
  target_heading: string | null;
  required_format: string | null;
  extractability_notes: string | null;
  draft_content: string | null;
}

interface FindingRow {
  description: string;
  impact_level: string | null;
  type: string;
}

export interface ExportInput {
  evaluationId: string;
  tier: Tier;
  /** Live crawlability verdict for the client's own site, from the analysis endpoint. */
  crawlability?: {
    blocked_crawlers: string[];
    has_robots_txt: boolean;
    disqualified: boolean;
    /**
     * Whether the blocks are Cloudflare's managed list rather than the owner's own policy.
     *
     * Changes the entire conversation. "You block eight AI platforms" invites an argument
     * about why; "your CDN switched this on by default and it is a toggle" is a fix the owner
     * can make this afternoon.
     */
    cloudflare_managed?: boolean;
  } | null;
  /** Competitors that also block AI crawlers — the field-wide version of the same gate. */
  competitorsBlockingAi?: string[];
  /** Registered competitors that produced no crawled page. */
  unreachable?: string[];
  /** Whether the client's own site produced any crawled page. */
  selfReachable?: boolean;
}

/** How many fixes Tier 1 shows before it stops. The incompleteness is the point. */
const TIER_1_FIXES = 3;

const LEVEL_LABEL: Record<string, string> = {
  answered: "Answers it",
  lexical: "Mentions it, does not answer",
  none: "Silent",
};

const ANSWER_TYPE_MISSING: Record<string, string> = {
  money: "a figure",
  duration: "a timeframe",
  count: "a number",
  steps: "an ordered process",
  comparison: "a direct contrast",
  entity: "a named provider",
  boolean: "a yes or no",
  definition: "a plain definition",
};

export async function exportAudit(input: ExportInput): Promise<string> {
  const { evaluationId, tier } = input;

  const evaluation = await queryOne<EvaluationRow>("SELECT * FROM evaluations WHERE id = ?", [evaluationId]);
  if (!evaluation) throw new Error(`Evaluation ${evaluationId} not found`);

  // Verdicts from the most recent run only. Mixing runs would blend a pre-fix and post-fix
  // view of the same competitor into one prevalence figure.
  const latestRun = await queryOne<{ id: string; ran_at: string }>(
    "SELECT id, ran_at FROM coverage_runs WHERE evaluation_id = ? ORDER BY ran_at DESC, rowid DESC LIMIT 1",
    [evaluationId]
  );

  const coverage = latestRun
    ? await query<CoverageRow>(
        `SELECT competitor_label, question, answer_type, level, specificity, passage,
                gap_evidence, source_url
           FROM coverage WHERE run_id = ?`,
        [latestRun.id]
      )
    : [];

  const briefs = await query<BriefRow>(
    `SELECT question, answer_type, weakness_score, effort, rationale, evidence,
            target_heading, required_format, extractability_notes, draft_content
       FROM content_briefs WHERE evaluation_id = ? ORDER BY weakness_score DESC`,
    [evaluationId]
  );

  const findings = await query<FindingRow>(
    "SELECT description, impact_level, type FROM findings WHERE evaluation_id = ?",
    [evaluationId]
  );

  const aiAnswers = await query<{ query: string; answer_text: string | null; engine: string; captured_at: string }>(
    `SELECT a.query, a.answer_text, a.engine, a.captured_at
       FROM ai_answers a JOIN evaluations e ON e.project_id = a.project_id
      WHERE e.id = ? ORDER BY a.captured_at DESC`,
    [evaluationId]
  );

  // One capture per query, most recent wins. Re-capturing a query is normal — the answer
  // moves — but printing both makes the report look like it double-counted the evidence.
  const latestByQuery = new Map<string, (typeof aiAnswers)[number]>();
  for (const a of aiAnswers) {
    if (!latestByQuery.has(a.query)) latestByQuery.set(a.query, a);
  }
  const distinctAnswers = Array.from(latestByQuery.values()).slice(0, 5);

  const out: string[] = [];
  // `hostOf` returns "" for anything unparseable, which is right for grouping and wrong for a
  // report heading — fall back to the raw value so the document still names its subject.
  const host = hostOf(evaluation.digital_asset_url) || evaluation.digital_asset_url;

  out.push(...header(evaluation, host, tier, latestRun?.ran_at ?? null));
  out.push(...sectionZeroCrawlability(input, host));
  out.push(...sectionWhatAiAnswers(distinctAnswers));
  out.push(...sectionFieldWeakness(coverage, input, tier));

  if (tier === 1) {
    out.push(...sectionTopFixes(briefs, TIER_1_FIXES));
  } else {
    out.push(...sectionFullGapList(briefs));
    out.push(...sectionBriefs(briefs));
    out.push(...sectionHygieneAppendix(findings));
  }

  out.push(...footer(evaluation, coverage, input));
  return out.join("\n");
}

// ---------------------------------------------------------------- sections

function header(e: EvaluationRow, host: string, tier: Tier, ranAt: string | null): string[] {
  const scope = e.target_location ? `${e.target_location}` : "All regions";
  return [
    `# AI Search Visibility — ${host}`,
    "",
    `**Query analysed:** ${e.primary_query}  `,
    `**Market:** ${scope}  `,
    `**Search intent:** ${e.search_intent}  `,
    `**Analysis date:** ${(ranAt ?? e.created_at).slice(0, 10)}`,
    "",
    tier === 1
      ? "This is a free snapshot. It names the three highest-value fixes and stops short of the full list."
      : "Full gap analysis with the content briefs needed to close each one.",
    "",
    "---",
    "",
  ];
}

/**
 * Gate zero. Printed before anything else because it invalidates everything else: a site AI
 * crawlers cannot fetch is uncitable regardless of content quality.
 */
function sectionZeroCrawlability(input: ExportInput, host: string): string[] {
  const c = input.crawlability;
  const out = ["## 1. Can AI assistants read your site?", ""];

  if (input.selfReachable === false) {
    // Absence of a robots.txt reads as permissive, so an unreachable host would otherwise
    // be reported as allowing every crawler — a confident claim about a site nobody read.
    out.push(
      `**Could not reach \`${host}\`.** No pages were retrieved, so nothing below describes`,
      "this site — only the field it competes in. Check the address is live and reachable",
      "before treating any of this as an audit of it.",
      "",
      "---",
      ""
    );
    return out;
  }

  if (!c) {
    out.push("_Not checked on this run._", "", "---", "");
    return out;
  }

  if (c.disqualified) {
    out.push(
      `**No. \`${host}\` blocks ${c.blocked_crawlers.length} AI crawler${c.blocked_crawlers.length === 1 ? "" : "s"} in its robots.txt:**`,
      "",
      ...c.blocked_crawlers.map((b) => `- ${b}`),
      "",
      "While these rules are in place, nothing you publish can be quoted by those assistants —",
      "content quality is irrelevant to a crawler that is refused at the door.",
      "",
      `Verify in ten seconds: open \`https://${host}/robots.txt\`.`,
      ""
    );

    if (c.cloudflare_managed) {
      out.push(
        "**These rules came from Cloudflare, not from you.** The file carries Cloudflare's",
        "managed content block, which is switched on by default — most owners have no idea it",
        "is there. That makes this a dashboard toggle rather than a project: Cloudflare →",
        "your domain → **Settings → AI Crawl Control**, and the blocks lift on the next fetch.",
        ""
      );
    }

    out.push(
      "**This is the highest-value fix on this page and it is a robots.txt edit, not a content project.**",
      ""
    );
  } else {
    out.push(`**Yes.** \`${host}\` allows the major AI crawlers.`, "");
  }

  const blockedRivals = input.competitorsBlockingAi ?? [];
  if (blockedRivals.length > 0) {
    out.push(
      `### The same is true of ${blockedRivals.length} of your competitors`,
      "",
      ...blockedRivals.map((r) => `- ${r}`),
      "",
      "A market where most of the field is invisible to AI assistants is a market where being",
      "readable is itself the advantage. Whoever unblocks first has the category to themselves.",
      ""
    );
  }

  out.push("---", "");
  return out;
}

/**
 * What assistants actually answer today.
 *
 * Prints its own absence rather than being skipped. An "AI search audit" silently missing
 * this section reads as though nothing was found, when the truth is nothing was captured.
 */
function sectionWhatAiAnswers(
  answers: { query: string; answer_text: string | null; engine: string; captured_at: string }[]
): string[] {
  const out = ["## 2. What AI assistants say about this topic today", ""];

  if (answers.length === 0) {
    out.push(
      "_No AI answers captured for this evaluation yet._",
      "",
      "The gap analysis below does not depend on this section — it is computed from the",
      "content of the sources competing for these questions, not from a captured answer.",
      "Read the findings as **where the field is weak**, not as observed citations.",
      "",
      "---",
      ""
    );
    return out;
  }

  for (const a of answers) {
    out.push(`### "${a.query}"`, "", `_${a.engine}, ${a.captured_at.slice(0, 10)}_`, "");
    if (a.answer_text) {
      out.push(quoteBlock(trimToBoundary(stripProcessNarration(a.answer_text), 1200)), "");
    }
  }
  out.push("---", "");
  return out;
}

/**
 * Where the cited sources are weak — the section the product exists for.
 *
 * Every row states the denominator it was computed over. "8 of 8 publish no pricing" implies
 * a field of eight; if two of ten were unreachable, the reader deserves to know that before
 * forwarding the claim to a client.
 */
function sectionFieldWeakness(coverage: CoverageRow[], input: ExportInput, tier: Tier): string[] {
  const out = ["## 3. Where the sources competing for these questions are weak", ""];

  if (coverage.length === 0) {
    out.push("_No coverage analysis on record for this evaluation._", "", "---", "");
    return out;
  }

  const byQuestion = new Map<string, CoverageRow[]>();
  for (const row of coverage) {
    if (row.competitor_label === "Self") continue;
    const list = byQuestion.get(row.question) ?? [];
    list.push(row);
    byQuestion.set(row.question, list);
  }

  const gaps = Array.from(byQuestion.entries())
    .map(([question, rows]) => {
      const answered = rows.filter((r) => r.level === "answered");
      // Highest specificity that is also quotable. Ranking on specificity alone put a
      // navigation menu at the top for three separate questions, because a dense list of
      // product names scores as fact-dense.
      const best =
        rows
          .slice()
          .sort((a, b) => b.specificity - a.specificity)
          .find((r) => {
            const quote = r.gap_evidence ?? r.passage;
            return quote != null && looksLikeProse(quote);
          }) ?? null;
      return {
        question,
        answerType: rows[0]?.answer_type ?? "definition",
        total: rows.length,
        answered: answered.length,
        gapRate: rows.length > 0 ? (rows.length - answered.length) / rows.length : 0,
        best,
      };
    })
    .filter((g) => g.gapRate > 0)
    .sort((a, b) => b.gapRate - a.gapRate);

  if (gaps.length === 0) {
    out.push("Every question analysed is answered by at least one source in the field.", "", "---", "");
    return out;
  }

  const shown = tier === 1 ? gaps.slice(0, TIER_1_FIXES) : gaps;

  for (const g of shown) {
    const missing = ANSWER_TYPE_MISSING[g.answerType] ?? "a direct answer";
    const silent = g.total - g.answered;

    out.push(`### ${g.question}`, "");
    // "1 of the 6 sources analysed do not state" reads as a bug to the client forwarding it.
    out.push(
      silent === 1
        ? `**1 of the ${g.total} sources analysed does not state ${missing}.**`
        : `**${silent} of the ${g.total} sources analysed do not state ${missing}.**`,
      ""
    );

    // The quoted passage is what makes this checkable. Without it the claim is a score.
    const quote = g.best ? g.best.gap_evidence ?? g.best.passage : null;
    if (quote && g.best) {
      // Two different findings, and they need different words. A source that answers is the
      // bar to clear — quote it as the standard. A source that stops short is the opening.
      const answers = g.best.level === "answered";
      out.push(
        answers
          ? `**${g.best.competitor_label}** does answer it` +
            (g.best.source_url ? ` (${g.best.source_url})` : "") +
            ", and this is the passage to beat:"
          : `The closest any of them comes is **${g.best.competitor_label}**` +
            (g.best.source_url ? ` (${g.best.source_url})` : "") +
            ":",
        "",
        quoteBlock(trimToBoundary(quote, 400)),
        ""
      );
      out.push(
        answers
          ? `Publishing ${missing} more specific than that is what displaces it.`
          : `That passage approaches the question and stops short of ${missing}.`,
        ""
      );
    } else {
      // Not a rendering failure — a finding. Nothing in the field says anything on this
      // question worth quoting, which is a wider opening than a field that hedges.
      out.push(
        "None of the sources analysed has a passage on this question worth quoting — the",
        "topic appears only in navigation and boilerplate. That is a wider opening than a",
        "field that discusses it and stops short.",
        ""
      );
    }
  }

  const notes: string[] = [];
  if ((input.unreachable ?? []).length > 0) {
    notes.push(
      input.unreachable!.length === 1
        ? `1 registered competitor was unreachable and is excluded from every count above: ${input.unreachable![0]}.`
        : `${input.unreachable!.length} registered competitors were unreachable and are excluded from every count above: ${input.unreachable!.join(", ")}.`
    );
  }
  if (tier === 1 && gaps.length > TIER_1_FIXES) {
    notes.push(`${gaps.length - TIER_1_FIXES} further gaps were found and are not shown here.`);
  }
  if (notes.length > 0) out.push(...notes.map((n) => `_${n}_`), "");

  out.push("---", "");
  return out;
}

function sectionTopFixes(briefs: BriefRow[], limit: number): string[] {
  const out = ["## 4. The three highest-value fixes", ""];

  if (briefs.length === 0) {
    out.push("_No ranked opportunities on record for this evaluation._", "", "---", "");
    return out;
  }

  briefs.slice(0, limit).forEach((b, i) => {
    out.push(`### ${i + 1}. ${b.target_heading ?? b.question}`, "");
    out.push(`**Why:** ${b.rationale}`, "");
    out.push(`**Effort:** ${b.effort}`, "");
  });

  if (briefs.length > limit) {
    out.push(
      `_${briefs.length - limit} further opportunities were identified, with the drafted content ` +
        `needed to close each one. Those are not included in this snapshot._`,
      ""
    );
  }
  out.push("---", "");
  return out;
}

function sectionFullGapList(briefs: BriefRow[]): string[] {
  const out = ["## 4. Ranked opportunities", ""];
  if (briefs.length === 0) {
    out.push("_None on record._", "", "---", "");
    return out;
  }

  out.push("| # | Question | Missing | Effort | Priority |", "|---|---|---|---|---|");
  briefs.forEach((b, i) => {
    const missing = ANSWER_TYPE_MISSING[b.answer_type] ?? "a direct answer";
    out.push(`| ${i + 1} | ${b.question} | ${missing} | ${b.effort} | ${b.weakness_score} |`);
  });
  out.push("", "---", "");
  return out;
}

function sectionBriefs(briefs: BriefRow[]): string[] {
  const out = ["## 5. What to publish", ""];
  if (briefs.length === 0) {
    out.push("_No briefs on record._", "", "---", "");
    return out;
  }

  out.push(
    "Each brief below is a page section to publish. The drafts are scaffolds — replace every",
    "bracketed placeholder with your own figures. **A placeholder left in place is worse than",
    "publishing nothing**, because it reads as a real answer to a crawler and as carelessness",
    "to a reader.",
    ""
  );

  briefs.forEach((b, i) => {
    out.push(`### ${i + 1}. ${b.target_heading ?? b.question}`, "");
    out.push(`**Target question:** ${b.question}  `);
    out.push(`**Answer type required:** ${b.answer_type}  `);
    out.push(`**Effort:** ${b.effort}`, "");
    out.push(`**Why this one:** ${b.rationale}`, "");

    if (b.evidence && looksLikeProse(b.evidence)) {
      out.push("**What the field currently says:**", "", quoteBlock(trimToBoundary(b.evidence, 400)), "");
    }
    if (b.required_format) out.push(`**Required format:** ${b.required_format}`, "");
    if (b.extractability_notes) out.push(`**To make it quotable:** ${b.extractability_notes}`, "");
    if (b.draft_content) {
      out.push("**Draft:**", "", "```markdown", b.draft_content, "```", "");
    }
  });

  out.push("---", "");
  return out;
}

function sectionHygieneAppendix(findings: FindingRow[]): string[] {
  const out = ["## Appendix — technical hygiene", ""];
  if (findings.length === 0) {
    out.push("_No hygiene findings on record._", "");
    return out;
  }
  out.push(
    "Secondary to the gaps above. These are table-stakes items — necessary, never sufficient.",
    ""
  );
  for (const f of findings) {
    out.push(`- ${f.description}${f.impact_level ? ` _(${f.impact_level} impact)_` : ""}`);
  }
  out.push("", "---", "");
  return out;
}

/**
 * What this analysis is and is not.
 *
 * Not boilerplate — the method and its limits are the difference between a defensible
 * document and a score nobody can argue with or act on.
 */
function footer(e: EvaluationRow, coverage: CoverageRow[], input: ExportInput): string[] {
  const sources = new Set(coverage.filter((c) => c.competitor_label !== "Self").map((c) => c.competitor_label));
  return [
    "## Method",
    "",
    `Sources analysed: ${sources.size}. Questions analysed: ${new Set(coverage.map((c) => c.question)).size}.`,
    "",
    "Each question is classified by the kind of answer it demands — a figure, a timeframe, a",
    "named entity — and every crawled page is then checked for a passage supplying that shape.",
    "A page that discusses a topic without delivering the required answer is recorded as a gap,",
    "and the passage where it stops short is quoted above so you can verify it yourself.",
    "",
    "The analysis is deterministic: the same pages produce the same findings, which is what",
    "makes a re-run next month a real comparison rather than model drift.",
    "",
    "**Limits.** Findings describe the sources competing for these questions" +
      (input.crawlability ? "" : "") +
      ". They are not a" +
      " guarantee of rankings or citations, and this analysis does not observe live AI answers" +
      " unless a capture section appears above.",
    "",
  ];
}

// ---------------------------------------------------------------- helpers


function quoteBlock(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

