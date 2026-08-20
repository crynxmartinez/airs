import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyQuestion,
  stem,
  scoreSpecificity,
  assessPassages,
  termCoverage,
  satisfiesAnswerType,
  chunkText,
  rankPassages,
  expandQueryTokens,
  assessCoverage,
  summarizeFieldCoverage,
  findAnswerEvidence,
  subjectTerms,
} from "./coverage.ts";

/** Builds a CoverageAssessment fixture without restating every field. */
function a(
  level: "none" | "lexical" | "answered",
  answerType: Parameters<typeof satisfiesAnswerType>[1],
  passage: string | null
) {
  return {
    level,
    answerType,
    passage,
    heading: null,
    score: passage ? 5 : 0,
    termCoverage: passage ? 0.8 : 0,
    subjectCoverage: passage ? 0.8 : 0,
    specificity: 0,
    gapEvidence: level === "lexical" ? passage : null,
    isDepthGap: level === "lexical",
  } as const;
}

// --- Question classification -------------------------------------------------

test("classifies questions by the answer shape they demand", () => {
  const cases: [string, string][] = [
    ["how much does a custom web app cost", "money"],
    ["web developer rates philippines", "money"],
    ["how long does it take to build a web app", "duration"],
    ["how many pages should a small business site have", "count"],
    ["how to build a booking system", "steps"],
    ["freelancer vs agency for web development", "comparison"],
    ["who can create a web app", "entity"],
    ["do i need a custom web app", "boolean"],
    ["what is full stack development", "definition"],
  ];
  for (const [q, expected] of cases) {
    assert.equal(classifyQuestion(q), expected, q);
  }
});

test("a cost question containing 'vs' is still a money question", () => {
  assert.equal(classifyQuestion("how much does a freelancer cost vs an agency"), "money");
});

// --- Answer-type evidence ----------------------------------------------------

test("recognises a real price as a money answer", () => {
  for (const t of [
    "Most small business sites fall in the ₱30,000–₱60,000 range.",
    "Plans start at $49 per month.",
    "Expect 150,000 PHP for a custom booking system.",
    "Our rate is ₱800 per hour.",
  ]) {
    assert.equal(satisfiesAnswerType(t, "money"), true, t);
  }
});

test("pricing talk with no figure fails the money check — this is the depth gap", () => {
  for (const t of [
    "Our pricing is competitive and tailored to your budget and requirements.",
    "Costs vary widely depending on scope, complexity and location.",
    "We offer affordable packages designed for small businesses.",
  ]) {
    assert.equal(satisfiesAnswerType(t, "money"), false, t);
  }
});

test("recognises durations and rejects vague timing language", () => {
  assert.equal(satisfiesAnswerType("Typical delivery is 4-6 weeks.", "duration"), true);
  assert.equal(satisfiesAnswerType("We deliver as quickly as possible.", "duration"), false);
});

test("recognises an ordered process", () => {
  assert.equal(satisfiesAnswerType("Step 1: scope the project. Step 2: design.", "steps"), true);
  assert.equal(satisfiesAnswerType("We follow a proven methodology.", "steps"), false);
});

test("recognises a direct assertion for boolean questions", () => {
  assert.equal(satisfiesAnswerType("Yes, you should build a web app if...", "boolean"), true);
  assert.equal(satisfiesAnswerType("There are many considerations to weigh.", "boolean"), false);
});

// --- Retrieval ---------------------------------------------------------------

test("stems consistently so inflections match", () => {
  assert.equal(stem("costs"), stem("cost"));
  assert.equal(stem("pricing"), stem("pricing"));
  assert.equal(stem("developers"), stem("developer"));
  assert.equal(stem("companies"), "company");
  assert.equal(stem("business"), "business", "does not mangle -ss");
});

test("expands query tokens with domain synonyms so paraphrase isn't read as absence", () => {
  const tokens = expandQueryTokens("how much does it cost");
  assert.ok(tokens.includes(stem("cost")));
  assert.ok(tokens.includes(stem("investment")), "cost expands to investment");
  assert.ok(!tokens.includes("how"), "stop words dropped");
});

test("a cost question retrieves a passage that says 'investment' instead", () => {
  const ranked = rankPassages("how much does it cost", [
    "Our team loves clean typography and thoughtful colour palettes.",
    "The typical investment for a project like this is ₱180,000.",
  ]);
  assert.match(ranked[0].text, /investment/);
});

test("chunks long text into overlapping windows", () => {
  const words = Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ");
  const chunks = chunkText(words, 60, 20);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.split(/\s+/).length <= 60));
});

test("short text yields a single chunk and empty text yields none", () => {
  assert.equal(chunkText("just a few words here").length, 1);
  assert.deepEqual(chunkText("   "), []);
});

test("ranks the passage that actually discusses the query highest", () => {
  const passages = [
    "Our team is passionate about design and user experience.",
    "A custom web app typically costs between ₱150,000 and ₱400,000 depending on features.",
    "We are based in Manila and serve clients nationwide.",
  ];
  const ranked = rankPassages("how much does a custom web app cost", passages);
  assert.match(ranked[0].text, /₱150,000/);
});

// --- Coverage assessment -----------------------------------------------------

test("answered: page discusses the topic and states a figure", () => {
  const page =
    "Pricing for small business web apps. A custom web app costs between ₱150,000 and ₱400,000 " +
    "depending on the number of features and integrations you need for your business.";
  const result = assessCoverage("how much does a custom web app cost", page);
  assert.equal(result.level, "answered");
  assert.equal(result.isDepthGap, false);
});

test("lexical: page discusses cost but never names a number — depth gap", () => {
  const page =
    "What does a custom web app cost? The cost of a custom web app depends on many factors " +
    "including scope and complexity. Every project is different so pricing varies for each client.";
  const result = assessCoverage("how much does a custom web app cost", page);
  assert.equal(result.level, "lexical");
  assert.equal(result.isDepthGap, true);
  assert.ok(result.passage, "keeps the passage as evidence");
});

test("none: page doesn't discuss the topic at all — coverage gap", () => {
  const page = "We are a team of designers who love typography, colour theory and brand identity work.";
  const result = assessCoverage("how much does a custom web app cost", page);
  assert.equal(result.level, "none");
});

test("empty page text is a coverage gap, not a crash", () => {
  assert.equal(assessCoverage("how much does it cost", "").level, "none");
});

// --- Field summary and the derived hedge -------------------------------------

test("derives the hedge when the field discusses a question but answers nobody", () => {
  const summary = summarizeFieldCoverage("how much does a custom web app cost", [
    a("lexical","money","cost depends"),
    a("lexical","money","pricing varies"),
    a("none","money",null),
  ]);
  assert.equal(summary.answered, 0);
  assert.equal(summary.gapRate, 1);
  assert.match(summary.hedgeReason!, /2 of 3 sources discuss this but no source states an actual figure/);
});

test("no hedge when at least one source answers properly", () => {
  const summary = summarizeFieldCoverage("how much does a custom web app cost", [
    a("answered","money","₱150,000"),
    a("lexical","money","varies"),
  ]);
  assert.equal(summary.hedgeReason, null);
  assert.equal(summary.gapRate, 0.5);
});

test("reports total absence distinctly from a depth gap", () => {
  const summary = summarizeFieldCoverage("how long does it take", [
    a("none","duration",null),
    a("none","duration",null),
  ]);
  assert.match(summary.hedgeReason!, /none of the 2 sources address this at all/);
});

// --- Specificity: the citation-likelihood proxy -------------------------------

test("scores a fact-dense passage far above generic prose", () => {
  const specific = scoreSpecificity(
    "A custom booking system runs ₱180,000 to ₱250,000 and ships in 6-8 weeks. " +
      "We integrate Stripe and Google Calendar, and 3 revisions are included."
  );
  const generic = scoreSpecificity(
    "Our pricing is competitive and depends on your unique requirements. " +
      "Every project is different, so costs vary based on many factors we discuss with you."
  );
  assert.ok(specific.score > 60, `specific scored ${specific.score}`);
  assert.ok(generic.score < 25, `generic scored ${generic.score}`);
  assert.ok(specific.score > generic.score * 2);
});

test("penalises hedging — a statement that no fact is committed to", () => {
  const hedged = scoreSpecificity("Costs vary and depend on scope. Typically it may range widely.");
  assert.ok(hedged.hedgeCount >= 2, `found ${hedged.hedgeCount} hedges`);
  assert.equal(hedged.score, 0);
});

test("counts currency, durations, percentages and years as concrete", () => {
  const s = scoreSpecificity("₱50,000 in 2026, a 30% deposit, delivered in 4 weeks.");
  assert.ok(s.concreteCount >= 4, `counted ${s.concreteCount}`);
});

test("empty passage scores zero rather than dividing by zero", () => {
  assert.equal(scoreSpecificity("").score, 0);
});

// --- IDF-weighted relevance gate ---------------------------------------------

test("term coverage demands the query's distinctive words, not its common ones", () => {
  const passages = [
    "Full stack web app development covers front-end and back-end work.",
    "A web app needs a database, an API and a user interface.",
  ];
  // "web"/"app" are everywhere here; "long"/"take" carry the distinguishing mass.
  const duration = termCoverage("how long does it take to build a web app", passages);
  const topic = termCoverage("what is a web app", passages);
  assert.ok(topic > duration, `topic ${topic} should exceed duration ${duration}`);
});

test("a page on an unrelated subject scores near-zero term coverage", () => {
  const coverage = termCoverage("how much does a custom web app cost", [
    "We photograph weddings across the region and specialise in candid portraits.",
  ]);
  assert.ok(coverage < 0.45, `coverage was ${coverage}`);
});

// --- Heading-anchored passages -----------------------------------------------

test("uses the heading as retrieval context for its section", () => {
  const result = assessPassages("how much does a booking system cost", [
    { heading: "About our studio", text: "We are a small team based in Manila." },
    { heading: "Pricing", text: "A booking system starts at ₱180,000 including two integrations." },
  ]);
  assert.equal(result.level, "answered");
  assert.equal(result.heading, "Pricing", "attributes the answer to its heading");
  assert.ok(result.specificity > 0);
});

test("reports term coverage so a gate decision is inspectable", () => {
  const result = assessPassages("how much does a booking system cost", [
    { heading: "Our values", text: "Craft, honesty and long-term partnership guide everything we do." },
  ]);
  assert.equal(result.level, "none");
  assert.ok(result.termCoverage < 0.45);
});

// --- Answer–subject proximity and distractor rejection ------------------------

test("rejects a salary figure as the answer to a project-cost question", () => {
  // Found in real output: an FAQ section containing developer salaries satisfied
  // "how much does a custom web app cost".
  const body =
    "Can I learn Full Stack Development in 3 months? Yes, with focus. " +
    "The average full stack developer salary is $75,000 per year in the US.";
  const hit = findAnswerEvidence(body, "money", subjectTerms("how much does a custom web app cost"), "FAQ");
  assert.equal(hit.found, false, "salary must not answer a project-cost question");
});

test("rejects a course module length as the answer to a build-time question", () => {
  const body = "Module 3 takes 9 hours to complete and covers Web APIs and authentication.";
  const hit = findAnswerEvidence(body, "duration", subjectTerms("how long does it take to build a web app"), "Web APIs");
  assert.equal(hit.found, false, "syllabus timing must not answer a build-duration question");
});

test("accepts a real project price for a cost question", () => {
  const body = "A custom web app costs between ₱150,000 and ₱400,000 depending on integrations.";
  const hit = findAnswerEvidence(body, "money", subjectTerms("how much does a custom web app cost"), "Pricing");
  assert.equal(hit.found, true);
  assert.match(hit.snippet ?? "", /₱150,000/);
});

test("a heading establishes the subject when the body uses a pronoun", () => {
  // "Our collections begin at $2,400" never says "wedding photographer", but the
  // page title does — so the section is plainly about it.
  const hit = findAnswerEvidence(
    "Our collections begin at $2,400 for six hours of coverage.",
    "money",
    subjectTerms("how much does a wedding photographer cost"),
    "Collections Wedding Photography Collections | Rosewood Studio"
  );
  assert.equal(hit.found, true);
});

test("returns the near-miss snippet as evidence when nothing qualifies", () => {
  const hit = findAnswerEvidence(
    "The average developer salary is $75,000 per year.",
    "money",
    subjectTerms("how much does a custom web app cost"),
    ""
  );
  assert.equal(hit.found, false);
  assert.ok(hit.snippet, "keeps the rejected match for diagnosis");
});

test("subject terms drop the question's shape words", () => {
  const subjects = subjectTerms("how much does a custom web app cost");
  assert.ok(subjects.includes(stem("custom")));
  assert.ok(subjects.includes(stem("app")));
  assert.ok(!subjects.includes(stem("cost")), "cost describes the answer shape, not the subject");
});

// --- Gap evidence selection ---------------------------------------------------

test("quotes where the field approaches the answer type, not an unrelated match", () => {
  // Observed: for "how much is app development" the top subject match on tutorial
  // sites was a framework glossary, which proves nothing about a pricing gap.
  const result = assessPassages("how much is app development", [
    { heading: "App Development", text: "" },
    { heading: "Glossary", text: "App development is full of unique terms. AngularJS: an open-source framework. React: a library for building interfaces by Facebook engineers." },
    { heading: "What it costs", text: "The cost of app development depends on scope, and pricing varies by team. We do not publish rates because every budget differs." },
  ]);
  assert.equal(result.level, "lexical");
  assert.match(result.passage ?? "", /cost of app development|pricing varies/);
  assert.doesNotMatch(result.passage ?? "", /AngularJS/);
});

test("falls back to the best match when nothing approaches the answer type", () => {
  const result = assessPassages("how much is app development", [
    { heading: "App Development", text: "App development uses JavaScript and databases to build interfaces for users." },
  ]);
  assert.equal(result.level, "lexical");
  assert.ok(result.passage, "still returns evidence");
});

test("gap evidence is scored by density, so a long promo blurb cannot win", () => {
  // Observed: a 40-word Coursera marketing passage outranked the section that
  // actually discussed pricing, because raw hit count favours length.
  const long =
    "Join 145M+ learners and 7,000+ organizations transforming their futures with career " +
    "credentials. Learners report positive outcomes and our programs are designed for " +
    "flexible study at any budget across many subject areas and industries worldwide today.";
  const short = "What it costs: pricing for a build depends on scope, and our rates are not published.";

  const result = assessPassages("how much does app development cost", [
    { heading: "App Development", text: "" },
    { heading: "Why learners choose us", text: long },
    { heading: "Cost", text: short },
  ]);
  assert.equal(result.level, "lexical");
  assert.match(result.passage ?? "", /pricing for a build|rates are not published/);
  assert.doesNotMatch(result.passage ?? "", /145M/);
});

test("reports no gap evidence when the field never approaches the answer dimension", () => {
  // Tutorial sites discussing app development but never money: there is nothing
  // honest to quote as proof of a pricing gap.
  const result = assessPassages("how much is app development", [
    { heading: "App Development", text: "" },
    { heading: "Glossary", text: "AngularJS: an open-source framework. React: a library maintained by Meta engineers for interfaces." },
  ]);
  assert.equal(result.level, "lexical");
  assert.equal(result.gapEvidence, null, "no passage discusses cost, so no evidence");
  assert.ok(result.passage, "best match still available for diagnosis");
});

test("sets gap evidence when the field does approach the dimension", () => {
  const result = assessPassages("how much is app development", [
    { heading: "App Development", text: "" },
    { heading: "Pricing", text: "App development pricing depends on your requirements and we prepare a quote per client." },
  ]);
  assert.equal(result.level, "lexical");
  assert.match(result.gapEvidence ?? "", /pricing depends|quote per client/);
});
