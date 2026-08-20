import { test } from "node:test";
import assert from "node:assert/strict";
import { diffRuns, measureGapMovement, summarizeProgress, type CoverageRow, type CoverageRun } from "./progress.ts";

const row = (
  competitor_id: string,
  question: string,
  level: "none" | "lexical" | "answered",
  specificity: number,
  passage: string | null = "…"
): CoverageRow => ({
  competitor_id,
  competitor_label: competitor_id,
  question,
  answer_type: "money",
  level,
  specificity,
  passage,
  source_url: `/${competitor_id}`,
});

const run = (id: string, rows: CoverageRow[], engine_version = "v1"): CoverageRun => ({
  id,
  ran_at: "2026-07-01",
  engine_version,
  rows,
});

const Q = "how much does it cost";

// --- transitions --------------------------------------------------------------

test("a committed answer on your own site is the headline win", () => {
  const before = run("r1", [row("self", Q, "lexical", 12, "contact us for a quote")]);
  const after = run("r2", [row("self", Q, "answered", 58, "starts at $1,850")]);

  const [t] = diffRuns(before, after);
  assert.equal(t.kind, "self_answered");
  assert.equal(t.from, "lexical");
  assert.equal(t.to, "answered");
  assert.equal(t.specificityDelta, 46);
  assert.equal(t.passageBefore, "contact us for a quote");
  assert.equal(t.passageAfter, "starts at $1,850");
});

test("a figure removed from your own page is a regression, even with the level intact", () => {
  const before = run("r1", [row("self", Q, "answered", 58)]);
  const after = run("r2", [row("self", Q, "lexical", 20)]);

  const [t] = diffRuns(before, after);
  assert.equal(t.kind, "self_regressed");
  assert.equal(t.specificityDelta, -38);
});

test("a rival closing a gap is surfaced as its own kind, not as neutral movement", () => {
  const before = run("r1", [row("rival.test", Q, "lexical", 10)]);
  const after = run("r2", [row("rival.test", Q, "answered", 70)]);

  const [t] = diffRuns(before, after);
  assert.equal(t.kind, "rival_answered");
  assert.equal(t.isSelf, false);
});

test("regressions and expiring opportunities outrank wins in the ledger", () => {
  const before = run("r1", [
    row("self", "q-win", "lexical", 10),
    row("self", "q-loss", "answered", 80),
    row("rival.test", "q-rival", "lexical", 10),
  ]);
  const after = run("r2", [
    row("self", "q-win", "answered", 60),
    row("self", "q-loss", "lexical", 15),
    row("rival.test", "q-rival", "answered", 75),
  ]);

  const kinds = diffRuns(before, after).map((t) => t.kind);
  assert.deepEqual(kinds, ["self_regressed", "rival_answered", "self_answered"]);
});

test("an unchanged verdict produces no transition", () => {
  const before = run("r1", [row("self", Q, "lexical", 12)]);
  const after = run("r2", [row("self", Q, "lexical", 12)]);
  assert.equal(diffRuns(before, after).length, 0);
});

test("a newly measured pair is 'entered', not a win", () => {
  const before = run("r1", []);
  const after = run("r2", [row("self", Q, "answered", 70)]);

  const [t] = diffRuns(before, after);
  assert.equal(t.kind, "entered", "widening the question set must not read as progress");
});

test("a pair no longer measured is 'left'", () => {
  const [t] = diffRuns(run("r1", [row("self", Q, "answered", 70)]), run("r2", []));
  assert.equal(t.kind, "left");
});

// --- earned vs drift ----------------------------------------------------------

test("credits you when you closed ground and the field stood still", () => {
  const before = run("r1", [row("self", Q, "lexical", 12), row("rival.test", Q, "answered", 66)]);
  const after = run("r2", [row("self", Q, "answered", 58), row("rival.test", Q, "answered", 66)]);

  const [m] = measureGapMovement(before, after);
  assert.equal(m.earned, 46);
  assert.equal(m.drift, 0);
  assert.equal(m.verdict, "earned");
  assert.equal(m.gapBefore, -54);
  assert.equal(m.gapAfter, -8);
});

test("says so when you improved and still fell further behind", () => {
  const before = run("r1", [row("self", Q, "lexical", 12), row("rival.test", Q, "answered", 40)]);
  const after = run("r2", [row("self", Q, "lexical", 34), row("rival.test", Q, "answered", 90)]);

  const [m] = measureGapMovement(before, after);
  assert.equal(m.earned, 22);
  assert.equal(m.verdict, "losing_while_improving", "a rising score in a faster field is not a win");
  assert.ok(m.gapAfter < m.gapBefore);
});

test("calls it drift when rivals decayed and you did nothing", () => {
  const before = run("r1", [row("self", Q, "lexical", 20), row("rival.test", Q, "answered", 80)]);
  const after = run("r2", [row("self", Q, "lexical", 20), row("rival.test", Q, "lexical", 30)]);

  const [m] = measureGapMovement(before, after);
  assert.equal(m.earned, 0);
  assert.equal(m.verdict, "drift");
});

test("a question measured in only one run is excluded from movement", () => {
  const before = run("r1", [row("self", "old-q", "lexical", 10)]);
  const after = run("r2", [row("self", "new-q", "answered", 80)]);
  assert.equal(measureGapMovement(before, after).length, 0);
});

// --- summary ------------------------------------------------------------------

test("an engine change marks the comparison as not comparable", () => {
  const before = run("r1", [row("self", Q, "lexical", 12)], "2026.07-passage");
  const after = run("r2", [row("self", Q, "answered", 58)], "2026.08-doc-scoped");

  const summary = summarizeProgress(before, after);
  assert.equal(summary.comparable, false, "verdicts that moved because we changed the engine are not client progress");
  assert.equal(summary.gapsClosed, 1, "the transition is still reported, just flagged");
});

test("counts the headline numbers a progress page leads with", () => {
  const before = run("r1", [
    row("self", "q1", "lexical", 10),
    row("self", "q2", "answered", 80),
    row("rival.test", "q3", "lexical", 10),
    row("rival.test", "q1", "answered", 50),
  ]);
  const after = run("r2", [
    row("self", "q1", "answered", 60),
    row("self", "q2", "lexical", 15),
    row("rival.test", "q3", "answered", 70),
    row("rival.test", "q1", "answered", 50),
  ]);

  const s = summarizeProgress(before, after);
  assert.equal(s.gapsClosed, 1);
  assert.equal(s.regressions, 1);
  assert.equal(s.rivalsMoved, 1);
  assert.equal(s.comparable, true);
});
