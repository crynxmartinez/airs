/**
 * Brief heading construction.
 *
 * The old `extractSubject` was a 20-step, order-dependent `.replace()` chain, and it shipped
 * malformed headings into the deliverable — the one artefact a client is told to publish
 * verbatim. Three of four money briefs on the reference evaluation came out as
 * "How much does how much to learn full stack web development cost?" and
 * "How much does commercial insurance agents make in california cost?".
 *
 * The shape assertions at the bottom are the real regression guard: no double spaces, no
 * duplicated question stem. Those two properties are what the old chain violated, and they
 * hold regardless of how the heading is built.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHeading, subjectPhrase, currencyForRegion } from "./brief-format.ts";

// --- headings -----------------------------------------------------------------

test("a question-shaped sub-intent becomes the heading verbatim", () => {
  // The string came from autocomplete, so it is what people actually type. Rewriting it
  // into house style would lose the query match that makes the heading worth publishing.
  assert.equal(
    buildHeading("how much does commercial insurance cost", "money"),
    "How much does commercial insurance cost?"
  );
});

test("the questions that used to produce malformed headings now read correctly", () => {
  const cases: [string, string][] = [
    ["how much to learn full stack web development", "How much to learn full stack web development?"],
    ["how much should i charge for a full stack website", "How much should i charge for a full stack website?"],
    ["how much do commercial insurance brokers make", "How much do commercial insurance brokers make?"],
    ["what is the cost of business insurance in australia", "What is the cost of business insurance in australia?"],
    ["how much does it cost to insure a cafe", "How much does it cost to insure a cafe?"],
  ];
  for (const [question, expected] of cases) {
    assert.equal(buildHeading(question, "money"), expected, question);
  }
});

test("an existing question mark is not doubled", () => {
  assert.equal(buildHeading("how long does a claim take?", "duration"), "How long does a claim take?");
});

test("whitespace is normalised", () => {
  assert.equal(buildHeading("  how   much   does   it  cost  ", "money"), "How much does it cost?");
});

test("a bare keyword is not published as a heading", () => {
  // "full stack web" is the primary query standing in as a sub-intent. Publishing it as an
  // H2 verbatim would be a keyword, not a question — synthesize from the answer type.
  const heading = buildHeading("full stack web", "definition");
  assert.equal(heading, "What is full stack web?");
});

test("synthesis covers every answer type", () => {
  const types = [
    "money", "duration", "count", "steps",
    "comparison", "entity", "boolean", "definition",
  ] as const;
  for (const type of types) {
    const heading = buildHeading("commercial insurance", type);
    assert.ok(heading.length > 0, type);
    assert.match(heading, /^[A-Z]/, `${type}: not capitalised`);
  }
});

test("empty input does not crash", () => {
  assert.equal(buildHeading("   ", "definition"), "Untitled");
});

// --- the regression guard -----------------------------------------------------

test("no generated heading contains a double space or a duplicated stem", () => {
  const questions = [
    "how much to learn full stack web development",
    "how much should i charge for a full stack website",
    "how much do commercial insurance agents make in california",
    "how much does the average commercial insurance broker make",
    "how much is a million dollar commercial insurance policy",
    "what is the cost of business insurance in australia",
    "how much does it cost to insure a cafe",
    "how long does a claim take",
    "is my business insurance tax deductible",
    "do i need professional indemnity insurance",
    "full stack web",
    "commercial insurance broker",
  ];

  for (const q of questions) {
    const heading = buildHeading(q, "money");

    assert.ok(!/ {2}/.test(heading), `double space in: ${heading}`);
    assert.ok(!/\?\?/.test(heading), `double question mark in: ${heading}`);

    // The exact failure mode of the old chain: the interrogative survived the strip and was
    // wrapped a second time, giving "How much does how much to learn ... cost?".
    const stems = heading.toLowerCase().match(/how much/g) ?? [];
    assert.ok(stems.length <= 1, `duplicated question stem in: ${heading}`);
  }
});

// --- subject phrase -----------------------------------------------------------

test("the subject keeps the words the asker used, not their stems", () => {
  // subjectTerms would return ["commerci", "insur"] — correct for matching, unreadable here.
  assert.equal(subjectPhrase("how much does commercial insurance cost"), "commercial insurance");
});

test("interior function words survive so the phrase reads as English", () => {
  assert.equal(
    subjectPhrase("what is the cost of business insurance in australia"),
    "business insurance in australia"
  );
});

test("a leading article is dropped", () => {
  assert.ok(!subjectPhrase("how much does the annual premium cost").startsWith("the "));
});

test("a question with no subject terms yields an empty phrase, not junk", () => {
  assert.equal(subjectPhrase("how much"), "");
});

// --- currency -----------------------------------------------------------------

test("currency follows the evaluated market", () => {
  assert.equal(currencyForRegion("au-en"), "A$");
  assert.equal(currencyForRegion("ph-en"), "₱");
  assert.equal(currencyForRegion("uk-en"), "£");
});

test("an unknown market asks rather than guesses", () => {
  // Naming the wrong currency in a pricing instruction is worse than leaving a placeholder.
  assert.equal(currencyForRegion("wt-wt"), "[CURRENCY]");
});
