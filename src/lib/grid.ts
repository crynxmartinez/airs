/**
 * The prospecting grid: business × question × retrieval count.
 *
 * The rules this implements are written down in `QUESTIONS.md`, deliberately outside the code,
 * because the four verdicts *are* the product and a rule that lives only in a function is one
 * nobody can argue with. If you change a threshold here, change it there first.
 *
 * Two things this file is careful about, both of which can make it quietly lie:
 *
 *   1. **"Retrieved", never "cited".** The API returns the retrieval set. Whether a source was
 *      quoted in the prose is not recoverable, so no function here claims it was.
 *   2. **Invisible needs a roster.** A business that was never retrieved has no citation and
 *      therefore no row. Invisibility is the absence of an observation and cannot be computed
 *      from captures alone — see `rosterProvided`.
 */

import { query } from "@/lib/db";
import { hostOf } from "@/lib/url";
import {
  scoreRow,
  type Grid,
  type GridCell,
  type GridRow,
} from "@/lib/grid-score";

export * from "@/lib/grid-score";

interface AnswerRow {
  id: string;
  query: string;
  capture_group_id: string | null;
}

interface CitationRow {
  ai_answer_id: string;
  url: string;
  position: number | null;
  is_self: number;
}

export interface BuildGridOptions {
  /**
   * Businesses that *should* appear in this market, from a source outside the captures —
   * a directory, a maps scrape, your prospect sheet. Without it, `invisible` is not computable.
   *
   * Note what supplying this asserts: that each of these businesses serves this market. A
   * business listed here that does not will read as a catastrophic visibility failure when it
   * is really a bad roster entry.
   */
  roster?: string[];
  /** The client's own site, excluded from the competitive field. */
  selfUrl?: string;
  /** Restrict to specific questions; defaults to every question captured in the batch. */
  questions?: string[];
}

/**
 * Build the grid for a set of capture batches.
 *
 * Scoped by `capture_group_id` rather than by query text and timestamp: a batch is an explicit
 * set of rows, so "retrieved in 2 of 3" counts what was actually asked rather than whatever
 * happened to run nearby. Passing group ids that span different question sets is legitimate —
 * that is how a three-city run is assembled.
 */
export async function buildGrid(
  projectId: string,
  captureGroupIds: string[],
  options: BuildGridOptions = {}
): Promise<Grid> {
  const warnings: string[] = [];
  const selfHost = options.selfUrl ? hostOf(options.selfUrl) || null : null;

  if (captureGroupIds.length === 0) {
    return emptyGrid(selfHost, [
      "No capture groups supplied. Run captureRepeated() first — a grid built from ad-hoc " +
        "captures cannot know how many runs a question got.",
    ]);
  }

  const placeholders = captureGroupIds.map(() => "?").join(", ");
  const answers = await query<AnswerRow>(
    `SELECT id, query, capture_group_id FROM ai_answers
     WHERE project_id = ? AND capture_group_id IN (${placeholders})
     ORDER BY captured_at`,
    [projectId, ...captureGroupIds]
  );

  if (answers.length === 0) {
    return emptyGrid(selfHost, [
      `No answers found for capture groups: ${captureGroupIds.join(", ")}.`,
    ]);
  }

  const citations = await query<CitationRow>(
    `SELECT c.ai_answer_id, c.url, c.position, c.is_self
     FROM ai_citations c
     JOIN ai_answers a ON a.id = c.ai_answer_id
     WHERE a.project_id = ? AND a.capture_group_id IN (${placeholders})`,
    [projectId, ...captureGroupIds]
  );

  // Runs per question is counted, not assumed. A batch of 3 where one call failed is a batch
  // of 2, and dividing by 3 would report a business as unstable when it was retrieved every
  // time it could have been.
  const answersByQuestion = new Map<string, AnswerRow[]>();
  for (const a of answers) {
    const list = answersByQuestion.get(a.query) ?? [];
    list.push(a);
    answersByQuestion.set(a.query, list);
  }

  const questions = options.questions?.length
    ? options.questions.filter((q) => answersByQuestion.has(q))
    : Array.from(answersByQuestion.keys());

  if (options.questions?.length) {
    for (const q of options.questions) {
      if (!answersByQuestion.has(q)) warnings.push(`Requested question has no captures: "${q}"`);
    }
  }

  const runsPerQuestion: Record<string, number> = {};
  for (const q of questions) runsPerQuestion[q] = answersByQuestion.get(q)!.length;

  const singleRun = questions.filter((q) => runsPerQuestion[q] < 2);
  if (singleRun.length > 0) {
    warnings.push(
      `${singleRun.length} question(s) have fewer than 2 runs, so "solid" there means "retrieved once" ` +
        `and cannot be distinguished from luck: ${singleRun.map((q) => `"${q}"`).join(", ")}`
    );
  }

  // host -> question -> { retrievals, bestPosition }. Retrievals are counted per *answer*, not
  // per citation: a page cited three times inside one answer is still one retrieval in one run.
  const answerToQuestion = new Map(answers.map((a) => [a.id, a.query]));
  const seenInAnswer = new Set<string>();
  const tally = new Map<string, Map<string, { retrievals: number; bestPosition: number | null }>>();

  for (const c of citations) {
    if (c.is_self === 1) continue;
    const host = hostOf(c.url);
    if (!host || host === selfHost) continue;

    const question = answerToQuestion.get(c.ai_answer_id);
    if (!question || !runsPerQuestion[question]) continue;

    const dedupeKey = `${c.ai_answer_id}|${host}`;
    const firstInThisAnswer = !seenInAnswer.has(dedupeKey);
    seenInAnswer.add(dedupeKey);

    const byQuestion = tally.get(host) ?? new Map();
    tally.set(host, byQuestion);
    const cell = byQuestion.get(question) ?? { retrievals: 0, bestPosition: null };
    if (firstInThisAnswer) cell.retrievals += 1;
    if (c.position !== null && (cell.bestPosition === null || c.position < cell.bestPosition)) {
      cell.bestPosition = c.position;
    }
    byQuestion.set(question, cell);
  }

  const rosterHosts = new Map<string, string>();
  for (const entry of options.roster ?? []) {
    const host = hostOf(entry);
    if (host) rosterHosts.set(host, entry);
    else warnings.push(`Roster entry is not a usable host and was skipped: "${entry}"`);
  }
  const rosterProvided = rosterHosts.size > 0;

  // Roster businesses that were never retrieved have no citation and so no tally entry. They
  // are added here explicitly — this is the only way `invisible` can exist.
  const allHosts = new Set<string>([...tally.keys(), ...rosterHosts.keys()]);

  const rows: GridRow[] = [];
  for (const host of allHosts) {
    const byQuestion = tally.get(host) ?? new Map();
    const cells: GridCell[] = questions.map((q) => {
      const runs = runsPerQuestion[q];
      const hit = byQuestion.get(q);
      const retrievals = hit?.retrievals ?? 0;
      return {
        question: q,
        retrievals,
        runs,
        verdict: retrievals === 0 ? "absent" : retrievals >= runs ? "solid" : "unstable",
        bestPosition: hit?.bestPosition ?? null,
      };
    });

    rows.push(
      scoreRow(host, cells, rosterHosts.has(host), rosterProvided, questions.length)
    );
  }

  // Most retrieved first — the order you would read the sheet in.
  rows.sort((a, b) => b.totalRetrievals - a.totalRetrievals || a.host.localeCompare(b.host));

  if (!rosterProvided) {
    warnings.push(
      "No roster supplied, so no `invisible` verdict was computed. This is not the same as " +
        "finding none: a business that is never retrieved has no citation and therefore no row."
    );
  }

  // `strong` is structurally margin 1 — it is decided by the money cell, so 3-of-3 is always
  // one observation from 2-of-3, which is `target`. Counting those alongside genuine boundary
  // cases would fire the warning on nearly every run and teach the reader to ignore it.
  const strongCount = rows.filter((r) => r.verdict === "strong").length;
  // Classification is hostname-only, because a citation carries no title or description. It
  // catches government suffixes and the global platforms reliably and misses directories whose
  // names give nothing away — `justbrisbane.com.au` and `aubusinesses.com` both read as
  // ordinary businesses. Saying so is the difference between a list that needs one quick pass
  // and a list that is quietly wrong.
  const notProspects = rows.filter((r) => !r.prospect).length;
  if (notProspects > 0) {
    warnings.push(
      `${notProspects} of ${rows.length} rows are directories, platforms, government or ` +
        `reference sites — real retrievals, not leads. Filter on the \`prospect\` column. ` +
        `The check is hostname-only, so scan the remainder for directories it could not name.`
    );
  }

  const coinFlips = rows.filter((r) => r.margin <= 1 && r.verdict !== "strong").length;
  if (coinFlips > 0) {
    warnings.push(
      `${coinFlips} of ${rows.length} verdicts would flip if a single retrieval changed. ` +
        `Thresholds are uncalibrated — treat these as unclassified.`
    );
  }
  if (strongCount > 0 && Math.min(...Object.values(runsPerQuestion)) < 5) {
    warnings.push(
      `${strongCount} "strong" verdict(s) rest on the money question being retrieved in every ` +
        `run. At this run count that is one observation from "target" — a real distinction, but ` +
        `a thin one. More runs is the only thing that thickens it.`
    );
  }

  return {
    questions,
    runsPerQuestion,
    rows,
    rosterProvided,
    selfHost,
    capturedFrom: { captureGroupIds, answers: answers.length },
    warnings,
  };
}

function emptyGrid(selfHost: string | null, warnings: string[]): Grid {
  return {
    questions: [],
    runsPerQuestion: {},
    rows: [],
    rosterProvided: false,
    selfHost,
    capturedFrom: { captureGroupIds: [], answers: 0 },
    warnings,
  };
}
