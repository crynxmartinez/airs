import { test } from "node:test";
import assert from "node:assert/strict";
import {
  predictCitations,
  scoreExtractability,
  scoreFreshness,
  scoreWeakness,
  rankWeaknesses,
  type CandidatePage,
} from "./citation.ts";
import { assessPassages } from "./coverage.ts";

const QUESTION = "how much does a custom web app cost";

function page(id: string, title: string, sections: [string, string][], extra: Partial<CandidatePage> = {}): CandidatePage {
  return {
    id,
    label: id,
    url: `https://${id}.example`,
    passages: [{ heading: title, text: "" }, ...sections.map(([heading, text]) => ({ heading, text }))],
    ...extra,
  };
}

const SPECIFIC = page("specific", "Custom Web App Pricing", [
  ["Pricing", "A custom web app costs ₱150,000 to ₱400,000 and ships in 8 weeks with 3 integrations included."],
]);
const VAGUE = page("vague", "Custom Web App Pricing", [
  ["Pricing", "The cost of a custom web app depends on scope. Every project is different so pricing varies."],
]);
const IRRELEVANT = page("irrelevant", "Our Design Philosophy", [
  ["Craft", "We care about typography, colour theory and brand identity above all else."],
]);

// --- Citation prediction ------------------------------------------------------

test("ranks the page with a concrete figure above one that hedges", () => {
  const [first, second] = predictCitations(QUESTION, [VAGUE, SPECIFIC]);
  assert.equal(first.id, "specific");
  assert.equal(second.id, "vague");
  assert.ok(first.score > second.score * 1.5, `${first.score} vs ${second.score}`);
});

test("ranks an off-topic page last and says why", () => {
  const predictions = predictCitations(QUESTION, [IRRELEVANT, SPECIFIC, VAGUE]);
  const last = predictions[predictions.length - 1];
  assert.equal(last.id, "irrelevant");
  assert.match(last.reason, /does not address/);
});

test("blocking AI crawlers zeroes the score regardless of quality", () => {
  const blocked = { ...SPECIFIC, id: "blocked", label: "blocked", aiCrawlable: false };
  const predictions = predictCitations(QUESTION, [blocked, VAGUE]);
  const blockedResult = predictions.find((p) => p.id === "blocked")!;
  assert.equal(blockedResult.score, 0);
  assert.match(blockedResult.reason, /blocks AI crawlers/);
});

test("explains a page that answers but too generically to quote", () => {
  const thin = page("thin", "Web App Cost", [["Cost", "A custom web app costs $1 or more."]]);
  const p = predictCitations(QUESTION, [thin])[0];
  assert.equal(p.assessment.level, "answered");
  assert.ok(p.factors.specificity < 0.4);
});

test("exposes each factor so a score can be audited", () => {
  const p = predictCitations(QUESTION, [SPECIFIC])[0];
  for (const key of ["queryMatch", "answerPresence", "specificity", "extractability", "freshness"] as const) {
    assert.ok(p.factors[key] >= 0 && p.factors[key] <= 1, `${key} out of range: ${p.factors[key]}`);
  }
});

// --- Extractability -----------------------------------------------------------

test("penalises a passage opening with a dangling reference", () => {
  const standalone = assessPassages(QUESTION, [
    { heading: "Pricing", text: "A custom web app costs ₱150,000 to ₱400,000 depending on integrations required." },
  ]);
  const dangling = assessPassages(QUESTION, [
    { heading: "Pricing", text: "This approach costs ₱150,000 to ₱400,000 depending on integrations required." },
  ]);
  assert.ok(scoreExtractability(standalone) > scoreExtractability(dangling));
});

test("an absent answer is not extractable at all", () => {
  const none = assessPassages(QUESTION, [{ heading: "Craft", text: "We love typography and colour." }]);
  assert.equal(scoreExtractability(none), 0);
});

// --- Freshness ----------------------------------------------------------------

test("recent content beats stale content on a volatile question", () => {
  const now = Date.parse("2026-08-01");
  const fresh = scoreFreshness("2026-06-01", "money", now);
  const stale = scoreFreshness("2021-01-01", "money", now);
  assert.ok(fresh > stale * 2, `fresh ${fresh} vs stale ${stale}`);
});

test("an undeclared date hurts a volatile question more than a stable one", () => {
  assert.ok(scoreFreshness(null, "definition") > scoreFreshness(null, "money"));
});

test("an unparseable date is treated as undeclared, not as epoch", () => {
  assert.equal(scoreFreshness("last Tuesday", "money"), scoreFreshness(null, "money"));
});

// --- Weakness scoring ---------------------------------------------------------

test("a question nobody answers scores higher than one the field answers well", () => {
  const unanswered = scoreWeakness({
    question: QUESTION,
    inAutocomplete: true,
    competitorHeadings: 3,
    predictions: predictCitations(QUESTION, [VAGUE, IRRELEVANT]),
  });
  const answered = scoreWeakness({
    question: QUESTION,
    inAutocomplete: true,
    competitorHeadings: 3,
    predictions: predictCitations(QUESTION, [SPECIFIC, SPECIFIC]),
  });
  assert.ok(unanswered.forcesHedge, "no cited source answers");
  assert.ok(unanswered.score > answered.score, `${unanswered.score} vs ${answered.score}`);
  assert.match(unanswered.rationale, /none (states a figure|of the)/);
});

test("a gap you already fill is not a task", () => {
  const self = assessPassages(QUESTION, [
    { heading: "Pricing", text: "Our custom web apps start at ₱180,000 with a 6 week build." },
  ]);
  const w = scoreWeakness({
    question: QUESTION,
    inAutocomplete: true,
    predictions: predictCitations(QUESTION, [VAGUE]),
    self,
  });
  assert.equal(w.alreadyCovered, true);
  assert.equal(w.winnability, 0.1);
  assert.match(w.rationale, /already answer/);
});

test("demand raises the score — an unasked question is worth less", () => {
  const base = { question: QUESTION, predictions: predictCitations(QUESTION, [VAGUE]) };
  const asked = scoreWeakness({ ...base, inAutocomplete: true, competitorHeadings: 4 });
  const unasked = scoreWeakness({ ...base, inAutocomplete: false, competitorHeadings: 0 });
  assert.ok(asked.score > unasked.score, `${asked.score} vs ${unasked.score}`);
});

test("a first-party answer type outranks one needing outside research", () => {
  const moneyGap = scoreWeakness({
    question: "how much does a custom web app cost",
    inAutocomplete: true,
    predictions: predictCitations("how much does a custom web app cost", [VAGUE]),
  });
  const comparisonQ = "difference between react and vue for enterprise teams";
  const comparisonGap = scoreWeakness({
    question: comparisonQ,
    inAutocomplete: true,
    predictions: predictCitations(comparisonQ, [IRRELEVANT]),
  });
  assert.equal(moneyGap.effort, "low");
  assert.equal(comparisonGap.effort, "high");
  assert.ok(moneyGap.winnability > comparisonGap.winnability);
});

test("ranking drops covered gaps and orders the rest by score", () => {
  const covered = assessPassages(QUESTION, [
    { heading: "Pricing", text: "Our custom web apps start at ₱180,000." },
  ]);
  const ranked = rankWeaknesses([
    { question: QUESTION, inAutocomplete: true, predictions: predictCitations(QUESTION, [VAGUE]), self: covered },
    { question: "how long does a build take", inAutocomplete: true, predictions: predictCitations("how long does a build take", [VAGUE]) },
  ]);
  assert.equal(ranked.length, 1, "the covered question is dropped");
  assert.match(ranked[0].question, /how long/);
});

test("no predictions yields zero severity rather than a divide-by-zero", () => {
  const w = scoreWeakness({ question: QUESTION, predictions: [] });
  assert.equal(w.severity, 0);
  assert.equal(w.score, 0);
  assert.match(w.rationale, /no predicted citations/);
});
