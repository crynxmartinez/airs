import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSuggestions,
  isQuestionLike,
  buildSeeds,
  subIntentsFromHeadings,
  isTopicRelevant,
  isLongTailNoise,
} from "./demand.ts";

// --- Response parsing ---------------------------------------------------------

test("parses the Google/DDG array shape", () => {
  const raw = ["custom web app cost", ["how much does a custom web app cost", "custom web app cost 2026"], [], {}];
  assert.deepEqual(parseSuggestions(raw), [
    "how much does a custom web app cost",
    "custom web app cost 2026",
  ]);
});

test("parses the DuckDuckGo phrase-object shape", () => {
  assert.deepEqual(parseSuggestions([{ phrase: "web app cost" }, { phrase: "web app pricing" }]), [
    "web app cost",
    "web app pricing",
  ]);
});

test("returns empty for junk rather than throwing", () => {
  assert.deepEqual(parseSuggestions(null), []);
  assert.deepEqual(parseSuggestions({ error: "blocked" }), []);
  assert.deepEqual(parseSuggestions([]), []);
});

test("drops non-string entries inside the suggestion array", () => {
  assert.deepEqual(parseSuggestions(["seed", ["ok", 42, null, "fine"]]), ["ok", "fine"]);
});

// --- Question detection ------------------------------------------------------

test("recognises question-shaped queries", () => {
  for (const q of [
    "how much does a web app cost",
    "what is done for you development",
    "should i hire a freelancer",
    "do i need a custom web app",
    "is it worth building a web app?",
  ]) {
    assert.equal(isQuestionLike(q), true, q);
  }
});

test("does not treat plain keyword strings as questions", () => {
  for (const q of ["web app cost philippines", "gohighlevel developer", "full stack web"]) {
    assert.equal(isQuestionLike(q), false, q);
  }
});

// --- Seed expansion ----------------------------------------------------------

test("expands a topic into question-shaped seeds", () => {
  const seeds = buildSeeds("custom web app");
  assert.ok(seeds.includes("custom web app"), "keeps the bare topic");
  assert.ok(seeds.includes("how much does custom web app"), "adds cost prefix");
  assert.ok(seeds.includes("custom web app vs"), "adds comparison suffix");
  assert.ok(seeds.includes("custom web app near me"), "adds local suffix");
  assert.equal(new Set(seeds).size, seeds.length, "no duplicate seeds");
});

test("an empty topic expands to nothing", () => {
  assert.deepEqual(buildSeeds("   "), []);
});

// --- Heading harvesting ------------------------------------------------------

test("harvests substantive H2/H3 headings as sub-intents", () => {
  const headings = [
    { level: 1, text: "What Is a Full-Stack Developer?" },
    { level: 2, text: "How much does it cost to hire one" },
    { level: 2, text: "Overview" },
    { level: 3, text: "Freelancer vs agency pricing" },
    { level: 4, text: "How deep does this nesting go" },
  ];
  const out = subIntentsFromHeadings(headings);
  assert.ok(out.includes("How much does it cost to hire one"), "keeps the cost question");
  assert.ok(out.includes("Freelancer vs agency pricing"), "keeps the comparison");
  assert.ok(!out.includes("Overview"), "drops short filler headings");
  assert.ok(!out.some((t) => t.startsWith("How deep")), "ignores H1 and H4");
});

test("skips headings that are neither questions nor commercially shaped", () => {
  const out = subIntentsFromHeadings([{ level: 2, text: "Our team of dedicated professionals" }]);
  assert.deepEqual(out, []);
});

// --- Noise filters (each rejection was observed in a real run) ----------------

test("rejects a shared modifier as topic relevance", () => {
  // Seeding "custom web app" surfaced these; "custom" alone is not the topic.
  assert.equal(isTopicRelevant("how much does custom wallpaper cost", "custom web app"), false);
  assert.equal(isTopicRelevant("best online custom apparel", "custom web app"), false);
  assert.equal(isTopicRelevant("how much does a custom web app cost", "custom web app"), true);
  assert.equal(isTopicRelevant("custom web application development", "custom web app"), true);
});

test("rejects vendor and location long tail but keeps questions", () => {
  assert.equal(isLongTailNoise("custom web application development company in bhubaneswar"), true);
  assert.equal(isLongTailNoise("kuchoriya techsoft ai custom software web app development reviews"), true);
  assert.equal(isLongTailNoise("full stack developer salary philippines"), true);
  assert.equal(isLongTailNoise("how much does custom web app development cost in the philippines"), false);
  assert.equal(isLongTailNoise("custom web app cost"), false);
});

test("drops site furniture harvested from competitor headings", () => {
  const headings = [
    { level: 2, text: "Did you find what you were looking for today?" },
    { level: 2, text: "Can I redistribute the content?" },
    { level: 2, text: "Do Not Track signals and your privacy" },
    { level: 2, text: "How can I update an existing roadmap?" },
    { level: 2, text: "How much does full stack development cost" },
  ];
  const out = subIntentsFromHeadings(headings, "full stack development");
  assert.deepEqual(out, ["How much does full stack development cost"]);
});

test("heading harvesting still works without a topic filter", () => {
  const out = subIntentsFromHeadings([{ level: 2, text: "How much does a booking system cost" }]);
  assert.equal(out.length, 1);
});

test("rejects vendor-shopping keyword queries, keeps the question form", () => {
  // Both slipped an earlier filter: 6 words and no "company in" to match on.
  assert.equal(isLongTailNoise("custom mobile app development company pricing"), true);
  assert.equal(isLongTailNoise("custom web application development company trivandrum"), true);
  assert.equal(isLongTailNoise("how much does a development company charge"), false);
  assert.equal(isLongTailNoise("web app development cost"), false);
});
