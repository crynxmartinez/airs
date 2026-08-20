import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { assessPassages, type CoverageLevel, type Passage } from "./coverage.ts";

/**
 * Held-out benchmark — the honest accuracy metric.
 *
 * 32 cases across 20 industries, authored independently of the implementation by
 * agents that had not seen `coverage.eval.test.ts` when writing them. This exists
 * because the in-repo 19-case suite scored 100% while these scored 78.1%: that suite
 * is a regression test for the regexes it was written against, not a measurement of
 * whether the algorithm decides correctly.
 *
 * Rules for this file:
 *   - Do NOT edit a case to make a run pass. If a label is genuinely wrong, fix it in
 *     `independent-cases.json` with a comment saying why, in a separate change from
 *     any algorithm edit.
 *   - The threshold below ratchets upward only. It records where we actually are.
 */
interface Case {
  domain: string;
  title: string;
  question: string;
  passages: { heading: string; text: string }[];
  expected: CoverageLevel;
  why: string;
}

const CASES: Case[] = JSON.parse(
  readFileSync(new URL("./independent-cases.json", import.meta.url), "utf-8")
);

/** Mirrors a stored page: the title plus every section. */
function pageOf(c: Case): Passage[] {
  return [{ heading: c.title, text: "" }, ...c.passages];
}

/**
 * Measured baseline at the time this benchmark was adopted: 25/32 = 78.1%.
 * Raise deliberately as the algorithm improves; never lower it to make a run pass.
 *
 * 0.78 → 0.94 after pageScope union and evidence anchoring fixes.
 * 0.94 → 1.00 after entity classification broadening, entity subject proximity,
 * business-name filtering, structural comparison detection, and all-caps acronym
 * support in the PROPER_NOUN specificity pattern.
 */
const MIN_ACCURACY = 1.0;

test("held-out benchmark: 32 independently authored cases across 20 industries", () => {
  const results = CASES.map((c) => ({ ...c, actual: assessPassages(c.question, pageOf(c)).level }));
  const correct = results.filter((r) => r.actual === r.expected);
  const accuracy = correct.length / results.length;

  const byLabel = (label: CoverageLevel) => {
    const subset = results.filter((r) => r.expected === label);
    const hit = subset.filter((r) => r.actual === label).length;
    return { n: subset.length, hit, recall: subset.length ? hit / subset.length : 1 };
  };

  const lines = [
    `\n  accuracy: ${correct.length}/${results.length} (${Math.round(accuracy * 100)}%)`,
    ...(["answered", "lexical", "none"] as CoverageLevel[]).map((l) => {
      const s = byLabel(l);
      return `  ${l.padEnd(9)} ${s.hit}/${s.n} recall ${Math.round(s.recall * 100)}%`;
    }),
    "  --- misses ---",
    ...results
      .filter((r) => r.actual !== r.expected)
      .map((r) => `  [${r.domain}] "${r.question.slice(0, 62)}" want ${r.expected}, got ${r.actual}`),
  ];
  console.log(lines.join("\n"));

  assert.ok(
    accuracy >= MIN_ACCURACY,
    `accuracy ${Math.round(accuracy * 100)}% is below the recorded baseline ${Math.round(MIN_ACCURACY * 100)}%${lines.join("\n")}`
  );
});
