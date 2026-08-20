/**
 * Progress as a diff between two coverage runs.
 *
 * The dashboard shows state and the coverage matrix shows position; both are snapshots.
 * Progress is a different object — a *change* — and the unit that carries it is the
 * verdict transition, not the score.
 *
 * Why not track scores: a composite moving 72 → 76 is unfalsifiable and unactionable,
 * and it reads the same whether you improved, the field decayed, or the algorithm
 * changed underneath you. A transition from `lexical` to `answered` is a fact with a
 * passage on each side of it, and it names what to do.
 *
 * No model, no network. Two runs in, a list of transitions out.
 */

import type { CoverageLevel } from "./coverage.ts";

/** One persisted coverage verdict, as stored by the analysis endpoint. */
export interface CoverageRow {
  competitor_id: string;
  competitor_label: string;
  question: string;
  answer_type: string;
  level: CoverageLevel;
  specificity: number;
  subject_coverage?: number;
  passage: string | null;
  source_url?: string | null;
}

export interface CoverageRun {
  id: string;
  ran_at: string;
  engine_version: string | null;
  rows: CoverageRow[];
}

/**
 * What kind of change this is, from the point of view of someone trying to win.
 *
 * `self_*` and `rival_*` are split deliberately: a rival closing a gap is not a
 * neutral data point, it is an opportunity expiring, and it belongs in a different
 * part of the page than your own wins.
 */
export type TransitionKind =
  | "self_gained"      // none → lexical: you started covering it
  | "self_answered"    // → answered: you committed to a real answer
  | "self_regressed"   // answered → lexical/none: a figure was removed
  | "rival_answered"   // a competitor closed a gap you could have owned
  | "rival_regressed"  // a competitor weakened — an opening
  | "entered"          // first time this pair was measured
  | "left";            // no longer measured

export interface Transition {
  kind: TransitionKind;
  isSelf: boolean;
  competitorId: string;
  competitorLabel: string;
  question: string;
  answerType: string;
  from: CoverageLevel | null;
  to: CoverageLevel | null;
  /** Specificity delta, the magnitude of the move. */
  specificityDelta: number;
  specificityFrom: number;
  specificityTo: number;
  /** The passage on each side — what the page said before, and what it says now. */
  passageBefore: string | null;
  passageAfter: string | null;
  sourceUrl: string | null;
}

const LEVEL_RANK: Record<CoverageLevel, number> = { none: 0, lexical: 1, answered: 2 };
const SELF_IDS = new Set(["self"]);

function isSelfRow(row: CoverageRow): boolean {
  return SELF_IDS.has(row.competitor_id) || row.competitor_id.startsWith("self:");
}

function key(row: CoverageRow): string {
  return `${row.competitor_id}${row.question}`;
}

/**
 * Every verdict that moved between two runs.
 *
 * Pairs are matched on (competitor, question) — the same cell of the coverage matrix
 * at two points in time. A pair present in only one run is `entered` or `left` rather
 * than a transition, because comparing against nothing is not progress: an evaluation
 * that widened its question set would otherwise report a burst of fake wins.
 */
export function diffRuns(before: CoverageRun, after: CoverageRun): Transition[] {
  const beforeRows = new Map(before.rows.map((r) => [key(r), r]));
  const afterRows = new Map(after.rows.map((r) => [key(r), r]));
  const transitions: Transition[] = [];

  for (const [k, now] of afterRows) {
    const then = beforeRows.get(k);
    if (!then) {
      transitions.push(build(now, null, now, "entered"));
      continue;
    }
    const levelMoved = then.level !== now.level;
    const specMoved = Math.round(now.specificity) !== Math.round(then.specificity);
    if (!levelMoved && !specMoved) continue;
    transitions.push(build(now, then, now, classify(then, now)));
  }

  for (const [k, then] of beforeRows) {
    if (!afterRows.has(k)) transitions.push(build(then, then, null, "left"));
  }

  return transitions.sort((a, b) => weight(b) - weight(a));
}

function classify(then: CoverageRow, now: CoverageRow): TransitionKind {
  const self = isSelfRow(now);
  const rose = LEVEL_RANK[now.level] > LEVEL_RANK[then.level];
  const fell = LEVEL_RANK[now.level] < LEVEL_RANK[then.level];

  if (self) {
    if (now.level === "answered" && rose) return "self_answered";
    if (rose) return "self_gained";
    if (fell) return "self_regressed";
    // Level held; specificity moved. Treat a sharpened answer as a gain and a
    // weakened one as a regression, because a figure quietly removed from a page that
    // still discusses the topic is exactly the silent loss this page exists to catch.
    return now.specificity >= then.specificity ? "self_gained" : "self_regressed";
  }

  if (rose) return "rival_answered";
  if (fell) return "rival_regressed";
  return now.specificity >= then.specificity ? "rival_answered" : "rival_regressed";
}

function build(
  identity: CoverageRow,
  then: CoverageRow | null,
  now: CoverageRow | null,
  kind: TransitionKind
): Transition {
  const specFrom = then?.specificity ?? 0;
  const specTo = now?.specificity ?? 0;
  return {
    kind,
    isSelf: isSelfRow(identity),
    competitorId: identity.competitor_id,
    competitorLabel: identity.competitor_label,
    question: identity.question,
    answerType: identity.answer_type,
    from: then?.level ?? null,
    to: now?.level ?? null,
    specificityDelta: norm(specTo - specFrom),
    specificityFrom: norm(specFrom),
    specificityTo: norm(specTo),
    passageBefore: then?.passage ?? null,
    passageAfter: now?.passage ?? null,
    sourceUrl: now?.source_url ?? then?.source_url ?? null,
  };
}

/** Ordering for the ledger: the things you must act on first. */
const KIND_WEIGHT: Record<TransitionKind, number> = {
  self_regressed: 500,   // you lost ground on your own site — fix today
  rival_answered: 400,   // an opportunity is expiring
  self_answered: 300,    // the win worth reporting
  rival_regressed: 200,  // a new opening
  self_gained: 150,
  entered: 50,
  left: 10,
};

function weight(t: Transition): number {
  return KIND_WEIGHT[t.kind] * 1000 + Math.abs(t.specificityDelta);
}

// ---------------------------------------------------------------- earned vs drift

export interface GapMovement {
  question: string;
  answerType: string;
  /** Field best specificity, then and now. */
  fieldBestBefore: number;
  fieldBestAfter: number;
  selfBefore: number;
  selfAfter: number;
  /** Negative means behind the field. Closing the gap moves this toward zero. */
  gapBefore: number;
  gapAfter: number;
  /** How much of the gap change your own movement accounts for. */
  earned: number;
  /** How much came from the field moving rather than you. */
  drift: number;
  verdict: "earned" | "drift" | "losing_while_improving" | "lost" | "flat";
}

/**
 * Decomposes gap change into what you did and what happened to you.
 *
 * The honesty mechanism. Your specificity rising 12 → 34 has three different meanings
 * depending on the field: you closed real ground, you improved and still fell further
 * behind, or rivals decayed while you stood still. A score chart draws the same rising
 * line for all three, which is how a loss gets reported as a win.
 */
export function measureGapMovement(before: CoverageRun, after: CoverageRun): GapMovement[] {
  const questions = new Set([...before.rows, ...after.rows].map((r) => r.question));
  const movements: GapMovement[] = [];

  for (const question of questions) {
    const b = slice(before, question);
    const a = slice(after, question);
    // A question measured in only one run has no comparison; reporting it as movement
    // would turn a widened question set into a burst of fictional progress.
    if (b.total === 0 || a.total === 0) continue;

    const gapBefore = b.self - b.fieldBest;
    const gapAfter = a.self - a.fieldBest;
    const earned = a.self - b.self;
    const drift = -(a.fieldBest - b.fieldBest);

    movements.push({
      question,
      answerType: (a.answerType ?? b.answerType) || "definition",
      fieldBestBefore: norm(b.fieldBest),
      fieldBestAfter: norm(a.fieldBest),
      selfBefore: norm(b.self),
      selfAfter: norm(a.self),
      gapBefore: norm(gapBefore),
      gapAfter: norm(gapAfter),
      earned: norm(earned),
      drift: norm(drift),
      verdict: verdictFor(norm(earned), norm(drift), norm(gapAfter - gapBefore)),
    });
  }

  return movements.sort((x, y) => x.gapAfter - y.gapAfter);
}

function slice(run: CoverageRun, question: string) {
  const rows = run.rows.filter((r) => r.question === question);
  const selfRow = rows.find(isSelfRow);
  const rivals = rows.filter((r) => !isSelfRow(r));
  return {
    total: rows.length,
    self: selfRow?.specificity ?? 0,
    fieldBest: rivals.length > 0 ? Math.max(...rivals.map((r) => r.specificity)) : 0,
    answerType: rows[0]?.answer_type,
  };
}

function verdictFor(earned: number, drift: number, gapChange: number): GapMovement["verdict"] {
  if (earned === 0 && drift === 0) return "flat";

  // Ground lost. The distinction inside this branch is the one the page exists to
  // make: work that moved you forward while the field moved forward faster must not
  // be reported the same way as standing still and being overtaken.
  if (gapChange < 0) return earned > 0 ? "losing_while_improving" : "lost";

  return earned > Math.abs(drift) ? "earned" : "drift";
}

/** Math.round preserves -0, which then prints as "-0" and fails equality against 0. */
function norm(value: number): number {
  const rounded = Math.round(value);
  return rounded === 0 ? 0 : rounded;
}

// ---------------------------------------------------------------- summary

export interface ProgressSummary {
  runBefore: string;
  runAfter: string;
  /** True when the engine changed between runs: a re-baseline, not a result. */
  comparable: boolean;
  gapsClosed: number;
  regressions: number;
  rivalsMoved: number;
  earned: number;
  drift: number;
  transitions: Transition[];
  movements: GapMovement[];
}

/**
 * The headline numbers for the progress page.
 *
 * `comparable` is false when the two runs used different engine versions. Reporting
 * verdict movement across an algorithm change would credit the client for our own
 * code change — the most misleading thing this page could do.
 */
export function summarizeProgress(before: CoverageRun, after: CoverageRun): ProgressSummary {
  const transitions = diffRuns(before, after);
  const movements = measureGapMovement(before, after);
  const comparable =
    Boolean(before.engine_version) &&
    Boolean(after.engine_version) &&
    before.engine_version === after.engine_version;

  return {
    runBefore: before.id,
    runAfter: after.id,
    comparable,
    gapsClosed: transitions.filter((t) => t.kind === "self_answered").length,
    regressions: transitions.filter((t) => t.kind === "self_regressed").length,
    rivalsMoved: transitions.filter((t) => t.kind === "rival_answered").length,
    earned: movements.reduce((sum, m) => sum + Math.max(0, m.earned), 0),
    drift: movements.reduce((sum, m) => sum + Math.max(0, m.drift), 0),
    transitions,
    movements,
  };
}
