/**
 * Multi-page (document-scoped) coverage.
 *
 * Every other coverage test feeds a single page's passages. Production does not: the
 * analysis route crawls several pages per competitor, and the first version
 * concatenated them into one passage list. That leaked subject scope between pages —
 * a price on an unrelated page satisfied the question, and the evidence quoted came
 * from a page that was never being judged. Independent validation traced most false
 * "answered" verdicts to exactly that union.
 *
 * These cases are deliberately multi-page, because a single-page suite cannot see the
 * bug at all.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { assessDocuments, assessPassages, type Passage, type CoverageDocument } from "./coverage.ts";
import { predictCitations } from "./citation.ts";

const CARPET_NO_PRICE: Passage[] = [
  { heading: "Carpet Cleaning Services | Acme Clean", text: "" },
  {
    heading: "Our carpet cleaning process",
    text: "We use hot water extraction for deep carpet cleaning. Our technicians pre-treat stains, agitate the fibres and extract with truck-mounted equipment. Every carpet cleaning job is inspected on completion.",
  },
  {
    heading: "Why choose us for carpet cleaning",
    text: "We have cleaned carpets across the metro area for years. Contact us for a carpet cleaning quote tailored to your home.",
  },
];

const CARPET_WITH_PRICE: Passage[] = [
  { heading: "Carpet Cleaning Services | Acme Clean", text: "" },
  {
    heading: "Carpet cleaning pricing",
    text: "Carpet cleaning starts at $180 for up to three rooms, or $65 per room for single-room jobs.",
  },
];

const OFFICE_WITH_PRICE: Passage[] = [
  { heading: "Office Cleaning Contracts | Acme Clean", text: "" },
  {
    heading: "Office cleaning pricing",
    text: "Standard office cleaning contracts start at $450 per month for premises under 200 square metres. Nightly service is $28 per visit.",
  },
];

const doc = (url: string, passages: Passage[]): CoverageDocument => ({ url, title: url, passages });
const COST_Q = "how much does carpet cleaning cost";

test("a price on an unrelated page does not answer this question", () => {
  const result = assessDocuments(COST_Q, [
    doc("/carpet", CARPET_NO_PRICE),
    doc("/office", OFFICE_WITH_PRICE),
  ]);
  assert.equal(result.level, "lexical", "office pricing must not answer a carpet question");
});

test("gap evidence comes from the on-topic page, not the one that happens to carry a figure", () => {
  const result = assessDocuments(COST_Q, [
    doc("/carpet", CARPET_NO_PRICE),
    doc("/office", OFFICE_WITH_PRICE),
  ]);
  assert.equal(result.sourceUrl, "/carpet");
  assert.ok(
    !/\$450/.test(result.passage ?? ""),
    `gap evidence quoted the office price: ${result.passage}`
  );
});

test("a real answer on one page still answers for the site", () => {
  const result = assessDocuments(COST_Q, [
    doc("/carpet", CARPET_WITH_PRICE),
    doc("/office", OFFICE_WITH_PRICE),
  ]);
  assert.equal(result.level, "answered");
  assert.equal(result.sourceUrl, "/carpet", "must name the page that actually answered");
  assert.match(result.passage ?? "", /\$180/);
});

test("page order does not change the verdict", () => {
  const forward = assessDocuments(COST_Q, [doc("/carpet", CARPET_WITH_PRICE), doc("/office", OFFICE_WITH_PRICE)]);
  const reverse = assessDocuments(COST_Q, [doc("/office", OFFICE_WITH_PRICE), doc("/carpet", CARPET_WITH_PRICE)]);
  assert.equal(forward.level, reverse.level);
  assert.equal(forward.sourceUrl, reverse.sourceUrl);
});

test("the distinguishing subject term is required, not merely one of them", () => {
  // "cleaning" is shared; "carpet" is what makes the question specific. Judging the
  // office page alone must not answer, or the union bug returns by another route.
  const officeOnly = assessPassages(COST_Q, OFFICE_WITH_PRICE);
  assert.notEqual(officeOnly.level, "answered");
});

test("an empty document set is absent, not answered", () => {
  assert.equal(assessDocuments(COST_Q, []).level, "none");
});

test("predictCitations ranks the site that truly answers above the one that does not", () => {
  const predictions = predictCitations(COST_Q, [
    {
      id: "acme",
      label: "acme.test",
      url: "https://acme.test",
      documents: [doc("/carpet", CARPET_NO_PRICE), doc("/office", OFFICE_WITH_PRICE)],
    },
    {
      id: "best",
      label: "best.test",
      url: "https://best.test",
      documents: [doc("/carpet", CARPET_WITH_PRICE)],
    },
  ]);

  assert.equal(predictions[0].label, "best.test");
  assert.equal(predictions[0].assessment.level, "answered");
  assert.equal(predictions[0].assessment.sourceUrl, "/carpet");
  assert.equal(predictions[1].assessment.level, "lexical");
});

test("predictCitations still accepts a flat passage list", () => {
  const predictions = predictCitations(COST_Q, [
    { id: "a", label: "a.test", url: "https://a.test", passages: CARPET_WITH_PRICE },
  ]);
  assert.equal(predictions[0].assessment.level, "answered");
});
