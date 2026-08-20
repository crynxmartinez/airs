/**
 * Commercial intent classification.
 *
 * Every question in the first block is real — pulled from `sub_intents` on the reference
 * evaluation, an Australian commercial insurance broker. Eight of ten briefs it produced
 * targeted people researching a career in insurance rather than people buying a policy,
 * and two were for the wrong continent.
 *
 * The hard cases are the ones that open identically: "how much do brokers make" and
 * "how much does a policy cost" differ only in the verb.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCommercialIntent, acceptsIntent } from "./demand.ts";
import { geoConflict } from "./search.ts";

// --- the questions that caused the problem ------------------------------------

test("earnings questions classify as career, not buying", () => {
  const career = [
    "how much do commercial insurance agents make in california",
    "how much do commercial insurance brokers make",
    "how much does the average commercial insurance broker make",
    "how much do top commercial insurance brokers make",
    "how much can a commercial insurance broker make",
    "how much should i charge for a full stack website",
    "how do commercial insurance brokers get paid",
    "how do commercial insurance brokers make money",
    "how much does a commercial insurance broker earn",
    "commercial insurance broker salary",
    // Wanting to *become* one is a career question, not a learning one — the motivation is
    // the job. Both are dropped for a transactional evaluation, so the distinction is
    // presentational, but the label should still be the honest one.
    "how to become a commercial insurance broker with no experience",
  ];
  for (const q of career) {
    assert.equal(classifyCommercialIntent(q), "career", q);
  }
});

test("skill-acquisition questions classify as learning", () => {
  const learning = [
    "how to learn full stack web development from scratch",
    "how much time does it take to learn full stack web development",
    "full stack web development course",
    "full stack web development roadmap",
    "how to build a full stack web application",
  ];
  for (const q of learning) {
    assert.equal(classifyCommercialIntent(q), "learning", q);
  }
});

test("purchase questions classify as buying", () => {
  const buying = [
    "how much is a million dollar commercial insurance policy",
    "how much does commercial insurance cost",
    "commercial insurance broker near me",
    "cheapest commercial insurance for small business",
    "commercial insurance quote",
    "hire a full stack developer",
  ];
  for (const q of buying) {
    assert.equal(classifyCommercialIntent(q), "buying", q);
  }
});

test("choice questions classify as evaluating", () => {
  const evaluating = [
    "do i need commercial insurance for a van",
    "public liability vs professional indemnity",
    "is commercial insurance worth it",
    "difference between commercial and business insurance",
    "which policy is best for a cafe",
  ];
  for (const q of evaluating) {
    assert.equal(classifyCommercialIntent(q), "evaluating", q);
  }
});

test("definitional questions are general, not dropped", () => {
  // Top-of-funnel for a buyer. Dropping these would cut real demand.
  assert.equal(classifyCommercialIntent("what is commercial insurance"), "general");
  assert.equal(classifyCommercialIntent("what does a commercial policy include"), "general");
});

// --- the collision the ordering exists to resolve -----------------------------

test("'how much do X make' and 'how much does X cost' are separated", () => {
  assert.equal(classifyCommercialIntent("how much do insurance brokers make"), "career");
  assert.equal(classifyCommercialIntent("how much does insurance cost"), "buying");
});

test("a learning question mentioning cost is still learning", () => {
  // "how to build" wins over the incidental "cost" — the asker is not buying.
  assert.equal(
    classifyCommercialIntent("how to build a web app and how much it costs"),
    "learning"
  );
});

// --- acceptance gating --------------------------------------------------------

test("a transactional evaluation drops career and learning", () => {
  assert.equal(acceptsIntent("buying", "transactional"), true);
  assert.equal(acceptsIntent("evaluating", "transactional"), true);
  assert.equal(acceptsIntent("general", "transactional"), true);
  assert.equal(acceptsIntent("career", "transactional"), false);
  assert.equal(acceptsIntent("learning", "transactional"), false);
});

test("an informational evaluation keeps the learning cluster", () => {
  // An education publisher legitimately wants these — hence a table, not a blanket rule.
  assert.equal(acceptsIntent("learning", "informational"), true);
  assert.equal(acceptsIntent("career", "informational"), false);
});

test("an unknown search intent accepts everything", () => {
  // Narrowing the question set on a guess would be worse than the problem being fixed.
  for (const intent of ["buying", "evaluating", "learning", "career", "general"] as const) {
    assert.equal(acceptsIntent(intent, null), true, intent);
    assert.equal(acceptsIntent(intent, "something-else"), true, intent);
  }
});

// --- geo conflict -------------------------------------------------------------

test("a question naming another market is flagged", () => {
  assert.equal(
    geoConflict("how much do commercial insurance agents make in california", "Australia"),
    "california"
  );
  assert.ok(geoConflict("how much do commercial insurance brokers make in ontario", "Australia"));
});

test("a question naming the target market is not flagged", () => {
  assert.equal(geoConflict("commercial insurance brokers in australia", "Australia"), null);
});

test("a question naming no place is not flagged", () => {
  assert.equal(geoConflict("how much does commercial insurance cost", "Australia"), null);
});

test("with no target market nothing conflicts", () => {
  // An evaluation without a location is global; every market is in scope.
  assert.equal(geoConflict("insurance brokers in california", null), null);
  assert.equal(geoConflict("insurance brokers in california", ""), null);
});
