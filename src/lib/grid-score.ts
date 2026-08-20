/**
 * The verdict rules for the prospecting grid — pure, so they can be argued with.
 *
 * Written down in `QUESTIONS.md` and implemented here. The split from `grid.ts` follows the
 * same line as `brief-format.ts` vs `briefs.ts`: the database work lives on one side and the
 * judgement on the other, because the judgement is the part that is the product and the part
 * that has to be testable without a database.
 *
 * Two things this file is careful about, both of which can make it quietly lie:
 *
 *   1. **"Retrieved", never "cited".** The API returns the retrieval set. Whether a source was
 *      quoted in the prose is not recoverable, so nothing here claims it was.
 *   2. **Invisible needs a roster.** A business that was never retrieved has no citation and
 *      therefore no row. Invisibility is the absence of an observation and cannot be computed
 *      from captures alone — see `rosterProvided`.
 */

/** How a business fared on one question. */
export type CellVerdict = "solid" | "unstable" | "absent";

/** How a business fared overall. The thing you act on. */
export type BusinessVerdict = "strong" | "target" | "unstable" | "invisible";

export interface GridCell {
  question: string;
  /** Runs in which this host appeared in the retrieval set. */
  retrievals: number;
  /** Runs actually completed for this question. The denominator, and not always what was asked for. */
  runs: number;
  verdict: CellVerdict;
  /** Best (lowest) position across runs, or null if never retrieved. */
  bestPosition: number | null;
}

export interface GridRow {
  host: string;
  cells: GridCell[];
  reach: number;
  consistency: number;
  verdict: BusinessVerdict;
  /**
   * How many single retrievals would have to change to flip the verdict.
   *
   * A verdict with `margin: 1` is a coin flip wearing a label. Reported rather than hidden
   * because the thresholds are a starting value and have not been calibrated against outcomes.
   */
  margin: number;
  totalRetrievals: number;
  onRoster: boolean;
  /** What kind of site this is. Directories and government pages are real retrievals, not leads. */
  kind: HostKind;
  /** Whether this row belongs on a prospect list at all. */
  prospect: boolean;
}

export interface Grid {
  questions: string[];
  runsPerQuestion: Record<string, number>;
  rows: GridRow[];
  /**
   * False when no roster was supplied — which means no `invisible` verdict was *computed*,
   * not that none were found. A report must never turn the first into the second.
   */
  rosterProvided: boolean;
  selfHost: string | null;
  capturedFrom: { captureGroupIds: string[]; answers: number };
  warnings: string[];
}

/** Both thresholds. Starting values — see the calibration note in `QUESTIONS.md`. */
const REACH_BAR = 2 / 3;
const CONSISTENCY_BAR = 2 / 3;

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


/** Apply the `QUESTIONS.md` rules to one business. */
export function scoreRow(
  host: string,
  cells: GridCell[],
  onRoster: boolean,
  rosterProvided: boolean,
  questionCount: number
): GridRow {
  const totalRetrievals = cells.reduce((n, c) => n + c.retrievals, 0);
  const totalRuns = cells.reduce((n, c) => n + c.runs, 0);
  const questionsHit = cells.filter((c) => c.retrievals > 0).length;

  const reach = questionCount > 0 ? questionsHit / questionCount : 0;
  const consistency = totalRuns > 0 ? totalRetrievals / totalRuns : 0;

  const verdict = classify(cells, reach, consistency, totalRetrievals, onRoster, rosterProvided);

  const kind = classifyHost(host);

  return {
    host,
    cells,
    reach: round2(reach),
    consistency: round2(consistency),
    verdict,
    margin: marginToFlip(cells, questionCount, verdict, onRoster, rosterProvided),
    totalRetrievals,
    onRoster,
    kind,
    // A roster entry is a prospect by assertion: someone put it on the list deliberately, and
    // that judgement beats a hostname heuristic.
    prospect: onRoster || isProspect(kind),
  };
}

function classify(
  cells: GridCell[],
  reach: number,
  consistency: number,
  totalRetrievals: number,
  onRoster: boolean,
  rosterProvided: boolean
): BusinessVerdict {
  if (totalRetrievals === 0) {
    // Only reachable for a roster business. Without a roster there is no row at all, which is
    // exactly why `invisible` cannot be inferred from captures.
    return onRoster && rosterProvided ? "invisible" : "unstable";
  }

  // Question order carries meaning: cell 0 is the roll call ("who should I use"), cell 1 is
  // the money question. Both rules below are positional, not arithmetic.
  const entity = cells[0];
  const money = cells[1];
  const onRollCall = (entity?.retrievals ?? 0) > 0;

  // Absent from the roll call is its own problem, and a different conversation: the market
  // does not know them, so there is no gap to point at yet.
  if (!onRollCall) return "unstable";

  // Target is checked *before* strong, and the order is the rule.
  //
  // Both clauses below were originally written the other way round, and two cases exposed it.
  // A business retrieved on all three questions but only 1 of 3 on the money question scores
  // reach 1.0 and consistency 6/9 — clearing both bars — and was labelled strong. But
  // flickering on the buying question is exactly the sellable gap, and aggregate scores were
  // averaging it away. The money question is not one third of the evidence; it is the point.
  if (money && money.verdict !== "solid") return "target";

  if (reach >= REACH_BAR && consistency >= CONSISTENCY_BAR) return "strong";

  return "unstable";
}

/**
 * How many retrievals would have to change for the verdict to flip.
 *
 * Brute force over ±1 in each cell. Cheap at this size, and it beats deriving an
 * inequality that would need re-deriving every time a threshold moves.
 */
function marginToFlip(
  cells: GridCell[],
  questionCount: number,
  verdict: BusinessVerdict,
  onRoster: boolean,
  rosterProvided: boolean
): number {
  for (let delta = 1; delta <= 2; delta++) {
    for (let i = 0; i < cells.length; i++) {
      for (const direction of [-1, 1]) {
        const shifted = cells.map((c, j) =>
          i === j
            ? { ...c, retrievals: clamp(c.retrievals + direction * delta, 0, c.runs) }
            : c
        );
        if (shifted[i].retrievals === cells[i].retrievals) continue;

        const total = shifted.reduce((n, c) => n + c.retrievals, 0);
        const runs = shifted.reduce((n, c) => n + c.runs, 0);
        const hit = shifted.filter((c) => c.retrievals > 0).length;
        const rescored = classify(
          shifted.map((c) => ({
            ...c,
            verdict: c.retrievals === 0 ? "absent" : c.retrievals >= c.runs ? "solid" : "unstable",
          })),
          questionCount > 0 ? hit / questionCount : 0,
          runs > 0 ? total / runs : 0,
          total,
          onRoster,
          rosterProvided
        );
        if (rescored !== verdict) return delta;
      }
    }
  }
  return 3;
}


const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The grid as CSV — the prospecting artifact.
 *
 * Goes straight into the sheet you are already keeping by hand. Header says "retrieved"
 * because that is what was measured.
 */
export function gridToCsv(grid: Grid): string {
  const esc = (v: string | number | null) => {
    const s = v === null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const header = [
    "business",
    "verdict",
    "reach",
    "consistency",
    "total_retrievals",
    "margin_to_flip",
    "on_roster",
    "kind",
    "prospect",
    ...grid.questions.flatMap((q) => [`${q} — retrieved`, `${q} — verdict`, `${q} — best position`]),
  ];

  const lines = [header.map(esc).join(",")];
  for (const row of grid.rows) {
    lines.push(
      [
        row.host,
        row.verdict,
        row.reach,
        row.consistency,
        row.totalRetrievals,
        row.margin,
        row.onRoster ? "yes" : "no",
        row.kind,
        row.prospect ? "yes" : "no",
        ...row.cells.flatMap((c) => [`${c.retrievals} of ${c.runs}`, c.verdict, c.bestPosition]),
      ]
        .map(esc)
        .join(",")
    );
  }

  // Warnings ride along in the file rather than only in the API response. The CSV is what gets
  // emailed, and "no roster, so no invisible verdicts" has to travel with the numbers.
  if (grid.warnings.length > 0) {
    lines.push("");
    for (const w of grid.warnings) lines.push(esc(`# ${w}`));
  }

  return lines.join("\n");
}

/**
 * What kind of thing a host is.
 *
 * The first live grid returned 56 rows and graded four directories as prime prospects —
 * `localsearch.com.au`, `justbrisbane.com.au`, `au.trustpilot.com`, `aubusinesses.com` all came
 * out `target`, alongside `payscale.com`, `aph.gov.au` and `download.asic.gov.au`. Every one is
 * a correct retrieval and none is a business you can sell to. Without this the prospect list
 * needs hand-filtering before it is worth reading, which is the job the grid exists to do.
 */
export type HostKind = "business" | "platform" | "government" | "reference" | "directory";

/**
 * Global platforms. Short and stable on purpose: these recur in every niche, which is what
 * earns them a hardcoded list. Anything industry-specific does not belong here — it would make
 * the grid work for insurance and quietly mis-grade real estate.
 */
const PLATFORM_HOSTS = [
  "trustpilot", "yelp", "tripadvisor", "facebook", "linkedin", "instagram", "twitter", "x.com",
  "reddit", "quora", "youtube", "pinterest", "tiktok", "glassdoor", "indeed", "productreview",
  "yellowpages", "bbb.org", "angi", "houzz", "thumbtack", "checkatrade", "yell.com",
];

/** Reference and data sites — real sources, never prospects. */
const REFERENCE_HOSTS = [
  "wikipedia", "wikihow", "britannica", "payscale", "salary.com", "glassdoor", "statista",
  "investopedia", "forbes", "news.com", "abc.net", "bbc.", "theguardian", "smh.com",
];

/**
 * Word fragments that suggest a directory rather than an operator.
 *
 * Heuristic and deliberately advisory — a real business can be called "Local Insurance" or
 * "Compare Brokers". A host matching one of these is *flagged*, never dropped, so a human
 * decides. Dropping silently is how a genuine prospect disappears from a list nobody re-checks.
 */
const DIRECTORY_FRAGMENTS = [
  "directory", "directories", "yellowpages", "localsearch", "findlocal", "businesslist",
  "compare", "comparison", "reviews", "ratings", "listings", "marketplace", "aggregator",
  // Superlative-roundup names. A business almost never calls itself "three best rated" or
  // "top 10 X" — a site that ranks other businesses does. Added after the first live run,
  // where `threebestrated.com.au` and `aubusinesses.com` came out as prime targets.
  "bestrated", "threebest", "toprated", "top10", "topten", "businesses",
];

/**
 * Classify a host from the hostname alone.
 *
 * Hostname-only because that is all a citation gives you — `classifyCompetitor` in `search.ts`
 * needs a title and description and cannot run here. Structural signals first (TLDs are
 * reliable), name fragments last (they are guesses).
 */
export function classifyHost(host: string): HostKind {
  const h = host.toLowerCase();

  // Structural, and the most reliable signal available: a government or academic suffix is
  // never a prospect regardless of what the name looks like.
  if (/(^|\.)gov(\.[a-z]{2,3})?$/.test(h) || h.includes(".gov.") || /(^|\.)mil$/.test(h)) {
    return "government";
  }
  if (/(^|\.)edu(\.[a-z]{2,3})?$/.test(h) || h.includes(".edu.")) return "reference";

  if (PLATFORM_HOSTS.some((p) => h.includes(p))) return "platform";
  if (REFERENCE_HOSTS.some((r) => h.includes(r))) return "reference";
  if (DIRECTORY_FRAGMENTS.some((d) => h.includes(d))) return "directory";

  return "business";
}

/** Whether a host is something you could actually sell an audit to. */
export function isProspect(kind: HostKind): boolean {
  return kind === "business";
}
