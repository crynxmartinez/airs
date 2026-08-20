import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gridToCsv,
  scoreRow,
  classifyHost,
  isProspect,
  type Grid,
  type GridRow,
  type GridCell,
} from "./grid-score.ts";

/**
 * The verdict rules from `QUESTIONS.md`, pinned.
 *
 * `buildGrid` reads the database, so these exercise the scoring through the same shape it
 * produces rather than through a live capture. The classification logic is the part that has
 * to be arguable, and it is the part tested here.
 */

const QUESTIONS = ["best brokers in brisbane", "how much does a broker cost", "is a broker worth it"];

function cell(question: string, retrievals: number, runs = 3): GridCell {
  return {
    question,
    retrievals,
    runs,
    verdict: retrievals === 0 ? "absent" : retrievals >= runs ? "solid" : "unstable",
    bestPosition: retrievals > 0 ? 1 : null,
  };
}

function gridOf(rows: GridRow[], warnings: string[] = []): Grid {
  return {
    questions: QUESTIONS,
    runsPerQuestion: Object.fromEntries(QUESTIONS.map((q) => [q, 3])),
    rows,
    rosterProvided: false,
    selfHost: null,
    capturedFrom: { captureGroupIds: ["g1"], answers: 9 },
    warnings,
  };
}

function row(host: string, counts: number[], onRoster = false): GridRow {
  const cells = QUESTIONS.map((q, i) => cell(q, counts[i]));
  const total = counts.reduce((a, b) => a + b, 0);
  return {
    host,
    cells,
    reach: counts.filter((c) => c > 0).length / QUESTIONS.length,
    consistency: total / (QUESTIONS.length * 3),
    verdict: "unstable",
    margin: 2,
    totalRetrievals: total,
    onRoster,
    kind: "business",
    prospect: true,
  };
}

test("cell verdicts are all-or-some-or-none", () => {
  assert.equal(cell("q", 3).verdict, "solid");
  assert.equal(cell("q", 2).verdict, "unstable");
  assert.equal(cell("q", 1).verdict, "unstable");
  assert.equal(cell("q", 0).verdict, "absent");
});

test("a failed run shrinks the denominator rather than penalising the business", () => {
  // A batch of 3 where one call failed is a batch of 2. Dividing by 3 anyway would report a
  // business as unstable when it was retrieved every time it could have been.
  assert.equal(cell("q", 2, 2).verdict, "solid");
  assert.equal(cell("q", 2, 3).verdict, "unstable");
});

test("csv header says retrieved, never cited", () => {
  const csv = gridToCsv(gridOf([row("acme.com.au", [3, 3, 3])]));
  const header = csv.split("\n")[0];

  // The API returns the retrieval set. Whether a source was quoted in the prose is not
  // recoverable, so the artifact must not claim it was.
  assert.ok(header.includes("retrieved"), header);
  assert.ok(!/\bcited\b/i.test(csv), "csv must not claim citation");
});

test("csv escapes questions containing commas and quotes", () => {
  const tricky: Grid = {
    ...gridOf([]),
    questions: ['how much does a "broker" cost, roughly'],
  };
  const csv = gridToCsv(tricky);
  assert.ok(csv.includes('"how much does a ""broker"" cost, roughly — retrieved"'), csv);
});

test("csv carries warnings so they travel with the numbers", () => {
  const csv = gridToCsv(gridOf([row("acme.com.au", [1, 0, 0])], ["No roster supplied"]));

  // The CSV is what gets emailed. "No roster, so no invisible verdicts" cannot live only in
  // the API response.
  assert.ok(csv.includes("# No roster supplied"), csv);
});

test("csv reports each cell as k of n, not a bare count", () => {
  const csv = gridToCsv(gridOf([row("acme.com.au", [3, 1, 0])]));
  const line = csv.split("\n")[1];
  assert.ok(line.includes("3 of 3"), line);
  assert.ok(line.includes("1 of 3"), line);
  assert.ok(line.includes("0 of 3"), line);
});

test("an empty grid still produces a header", () => {
  const csv = gridToCsv(gridOf([]));
  assert.ok(csv.split("\n")[0].startsWith("business,verdict"));
});

// --- The verdict rules themselves -------------------------------------------------------

function score(counts: number[], onRoster = false, rosterProvided = false) {
  return scoreRow(
    "acme.com.au",
    QUESTIONS.map((q, i) => cell(q, counts[i])),
    onRoster,
    rosterProvided,
    QUESTIONS.length
  );
}

test("strong: owns the field, so not a prospect", () => {
  assert.equal(score([3, 3, 3]).verdict, "strong");
  assert.equal(score([3, 3, 2]).verdict, "strong"); // reach 1.0, consistency 0.89
});

test("target: known on the roll call, not trusted with the money question", () => {
  // This is the pitch. Retrieved on entity, not solid on money.
  assert.equal(score([3, 0, 0]).verdict, "target");
  assert.equal(score([3, 1, 2]).verdict, "target");
  assert.equal(score([1, 0, 3]).verdict, "target");
});

test("target requires the entity question specifically, not just any question", () => {
  // Absent from the roll call means the market does not know them — a different problem, and
  // a different conversation. Question order carries the meaning.
  assert.equal(score([0, 3, 3]).verdict, "unstable");
  assert.equal(score([0, 0, 2]).verdict, "unstable");
});

test("solid on money outranks target even when reach is incomplete", () => {
  // Trusted with the buying question is precisely what a target is not.
  assert.notEqual(score([1, 3, 0]).verdict, "target");
});

test("invisible needs a roster, and is never inferred without one", () => {
  // A business retrieved nowhere has no citation and therefore no row. Without a roster the
  // verdict is not computable, and must not be manufactured.
  assert.equal(score([0, 0, 0], true, true).verdict, "invisible");
  assert.equal(score([0, 0, 0], false, true).verdict, "unstable");
  assert.equal(score([0, 0, 0], true, false).verdict, "unstable");
});

test("margin reports how close a verdict is to flipping", () => {
  // Every `strong` is margin 1, and that is the honest answer rather than a bug. Since
  // `target` is decided by the money cell alone, a business at 3 of 3 on money is exactly one
  // observation from 2 of 3, which is `target`. With three runs the two verdicts really are
  // that close together — the fix is more runs, not a softer number.
  assert.equal(score([3, 3, 3]).verdict, "strong");
  assert.equal(score([3, 3, 3]).margin, 1);

  // A target sitting on zero for money needs two changes to reach solid, so it is the more
  // settled verdict of the two.
  assert.equal(score([3, 0, 0]).verdict, "target");
  assert.ok(score([3, 0, 0]).margin >= 2);
});

test("reach and consistency are reported, not just the label", () => {
  const row = score([3, 1, 0]);
  assert.equal(row.reach, round2(2 / 3));
  assert.equal(row.consistency, round2(4 / 9));
  assert.equal(row.totalRetrievals, 4);
});

const round2 = (n: number) => Math.round(n * 100) / 100;

// --- Host classification ----------------------------------------------------------------

test("directories and government pages are not prospects", () => {
  // Every one of these came back `target` on the first live run — correct retrievals, and not
  // one of them a business anybody can sell an audit to.
  assert.equal(classifyHost("localsearch.com.au"), "directory");
  assert.equal(classifyHost("au.trustpilot.com"), "platform");
  assert.equal(classifyHost("payscale.com"), "reference");
  assert.equal(classifyHost("aph.gov.au"), "government");
  assert.equal(classifyHost("download.asic.gov.au"), "government");

  for (const h of ["localsearch.com.au", "au.trustpilot.com", "payscale.com", "aph.gov.au"]) {
    assert.ok(!isProspect(classifyHost(h)), h);
  }
});

test("an ordinary operator is a prospect", () => {
  assert.equal(classifyHost("claytoninsurancebrokers.com.au"), "business");
  assert.equal(classifyHost("fundamentalinsurancebrokers.com.au"), "business");
  assert.ok(isProspect(classifyHost("alls.com.au")));
});

test("government detection is structural, not a name list", () => {
  // A hardcoded list would work for Australia and silently fail everywhere else.
  assert.equal(classifyHost("irs.gov"), "government");
  assert.equal(classifyHost("hmrc.gov.uk"), "government");
  assert.equal(classifyHost("data.gov.sg"), "government");
  assert.equal(classifyHost("mit.edu"), "reference");
});

test("a roster entry stays a prospect even if the name looks like a directory", () => {
  // Putting a business on the roster is a deliberate assertion, and it beats a hostname guess.
  const row = scoreRow("compare-insurance.com.au", QUESTIONS.map((q) => cell(q, 0)), true, true, 3);
  assert.equal(row.kind, "directory");
  assert.equal(row.prospect, true);
});
