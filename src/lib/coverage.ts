/**
 * Deterministic coverage analysis — an answer-type-aware retrieval engine.
 *
 * An AI answer is retrieve(query) → synthesize(passages). Synthesis needs a model;
 * retrieval does not. AIRS only cares about the retrieval half, because "which
 * sources get cited" is a retrieval outcome.
 *
 * This lets the hedge signal be *computed* rather than observed. If the best
 * passages for "how much does a custom web app cost" contain no currency figure,
 * any synthesizer is forced to hedge — so the gap is provable from the evidence,
 * and it names the missing fact instead of just reporting a vague answer.
 *
 * No API key, no model, no network. Same input always yields the same result.
 */

/**
 * Stamped on every coverage run.
 *
 * Bump this whenever a change can shift verdicts on unchanged content — new answer
 * patterns, a different scope rule, altered thresholds. Progress reporting compares
 * two runs, and a verdict that moved because the engine changed is not the client
 * improving. Runs with differing versions are a re-baseline, not a result.
 *
 * History:
 *   2026.08-doc-scoped  assessment scoped to one document; subject-match strength
 *                       required rather than any single term; unified morphology.
 *   2026.07-passage     initial passage-level engine (site-unioned scope).
 */
export const COVERAGE_ENGINE_VERSION = "2026.08-doc-scoped";

// ---------------------------------------------------------------- answer types

export type AnswerType =
  | "money"
  | "duration"
  | "count"
  | "steps"
  | "comparison"
  | "entity"
  | "boolean"
  | "definition";

/** Ordered most- to least-specific: "how much does X cost vs Y" is a money question. */
const QUESTION_SIGNATURES: { type: AnswerType; patterns: RegExp[] }[] = [
  {
    type: "money",
    // "how much" is excluded when it introduces a non-money quantity ("how much time"),
    // and bare "rate" is excluded because conversion/bounce/interest rates are not money.
    patterns: [
      /\bhow much\b(?!\s+(?:time|longer|space|storage|data|weight|traffic))/i,
      /\bcost(s|ing)?\b/i,
      /\bprice|pricing\b/i,
      /\brates?\b(?!\s*(?:of|for)?\s*(?:conversion|bounce|interest|success|failure|churn|click))/i,
      /\bfees?\b/i,
      /\bbudget\b/i,
      /\bcheap|expensive|affordab/i,
      /\bdo i have to pay\b/i,
    ],
  },
  {
    type: "duration",
    patterns: [/\bhow long\b/i, /\btimelines?\b/i, /\bhow many (days|weeks|months|years|hours)\b/i, /\bturnaround\b/i, /\bdeadline\b/i],
  },
  { type: "count", patterns: [/\bhow many\b/i] },
  {
    type: "comparison",
    patterns: [/\bvs\.?\b/i, /\bversus\b/i, /\bdifference between\b/i, /\bcompared? to\b/i, /\bor\b.*\bwhich (is )?better\b/i, /\bbetter than\b/i],
  },
  { type: "steps", patterns: [/\bhow (to|do i|do you)\b/i, /\bsteps?\b/i, /\bprocess\b/i, /\bguide\b/i, /\bcheckl?ist\b/i] },
  { type: "entity", patterns: [/\bwho\b/i, /\bwhere\b/i, /\bwhich (company|agency|developer|provider|tool|platform|brand|software|system|service|product)\b/i, /\bwhich\b[^?]{0,40}\b(do you|can you|do they)\b/i, /\bnear me\b/i, /\bbest\b/i] },
  { type: "boolean", patterns: [/^(is|are|can|could|should|do|does|did|will|would|must)\b/i, /\bdo i need\b/i, /\bworth it\b/i] },
  { type: "definition", patterns: [/\bwhat (is|are|does)\b/i, /\bdefine\b/i, /\bmeaning of\b/i, /\bexplain\b/i] },
];

/** What kind of answer this question demands. Defaults to `definition`. */
export function classifyQuestion(question: string): AnswerType {
  for (const { type, patterns } of QUESTION_SIGNATURES) {
    if (patterns.some((p) => p.test(question))) return type;
  }
  return "definition";
}

/**
 * Evidence that a passage actually supplies the required answer shape.
 *
 * These are intentionally strict. A page discussing pricing philosophy without ever
 * naming a figure fails `money` — which is exactly the depth gap worth finding.
 */
const ANSWER_EVIDENCE: Record<AnswerType, RegExp[]> = {
  // Every money pattern is anchored to a currency. Unanchored numeric ranges matched
  // year spans (2015-2024) and phone numbers (555-1234), and a bare \d+k matched "4K
  // video". `php` requires 3+ digits so the language version "PHP 8.2" is not pesos.
  money: [
    /[₱$€£¥]\s?\d/,
    /\b\d[\d,.]*\s?(php|usd|eur|gbp|pesos?|dollars?|euros?|pounds?)\b/i,
    /\b(php|usd|eur|gbp)\s?\d{3,}/i,
    /\b(starts?|starting|begins?|priced)\s+(at|from)\s*[₱$€£¥]\s?\d/i,
    /[₱$€£¥]\s?\d[\d,.]*\s?(per|\/|a)\s?(hour|day|month|year|project|page|user|seat|session|visit)\b/i,
    /[₱$€£¥]\s?\d[\d,.]*\s?(?:[-–—]|to)\s?[₱$€£¥]?\s?\d/i,
    /[₱$€£¥]\s?\d+\s?k\b/i,
    /\bbulk[- ]bill(ed|ing)?\b/i,
    /\b(no charge|free of charge|at no cost|fully covered|no out[- ]of[- ]pocket)\b/i,
  ],
  // Requires a delivery-shaped duration. Word numbers are accepted because "two to
  // three weeks" is as common as "2-3 weeks" and was previously invisible.
  duration: [
    /\b\d+\s?[-–—]?\s?\d*\s?(seconds?|mins?|minutes?|hours?|days?|weeks?|months?|years?)\b/i,
    /\b\d+\s?(to|–|—|-)\s?\d+\s?(seconds?|mins?|minutes?|hours?|days?|weeks?|months?|years?)\b/i,
    /\b(one|two|three|four|five|six|seven|eight|nine|ten|twelve|fourteen)\s?(?:to|or|–|—|-)?\s?(?:one|two|three|four|five|six|seven|eight|nine|ten|twelve|fourteen)?\s?(minutes?|hours?|days?|weeks?|months?)\b/i,
    /\b(same|next|following)[- ]day\b/i,
    /\bwithin\s+\d+\s?(hours?|days?|weeks?|months?)\b/i,
  ],
  // A quantity *of something*, not any digit. A bare \d+ meant a copyright year
  // answered "how many officers do you employ" — the class carried no information.
  count: [
    /\b\d+\s+[a-z]+(?:s|es|ers|ors)\b/i,
    /\b(we (?:have|employ|run|operate|maintain)|team of|staff of|over|more than|up to|fewer than)\s+\d+/i,
    /\b\d+\s?(seats?|guests?|people|persons?|members?|staff|officers?|technicians?|developers?|vehicles?|locations?|branches?)\b/i,
  ],
  // Two distinct sequence markers, or explicit step numbering. A 400-character span
  // between an incidental "first" and an unrelated "then" was reading as a process.
  steps: [
    /\bstep\s?\d/i,
    /\b\d[.)]\s+[A-Z]/,
    /\bfirst(ly)?\b[\s\S]{0,160}\b(then|next|after that|second(ly)?|finally|lastly)\b/i,
    /\bstart by\b[\s\S]{0,200}\b(then|next|after that|finally)\b/i,
    /(?:\b(?:then|next|after that)\b[\s\S]{0,200}){2}/i,
  ],
  // Dropped /while .{0,80}(is|are|costs)/ — ordinary concessive prose. Added the
  // evaluative forms real pages use, including "better than", which was already a
  // question signature but missing from the evidence lexicon.
  comparison: [
    /\bvs\.?\b/i,
    /\bversus\b/i,
    /\bwhereas\b/i,
    /\bcompared? (to|with)\b/i,
    /\bin contrast\b/i,
    /\bon the other hand\b/i,
    /\bunlike\b/i,
    /\b(better|worse|cheaper|faster|safer|healthier|more economical|more expensive|more convenient) than\b/i,
    /\bthe (more|less|most|least) \w+ (choice|option)\b/i,
    /\btrade[- ]?off\b/i,
    /\b(suits?|is best for|works best for|works well for|is ideal for|is for)\b[\s\S]{0,120}\b(suits?|is best for|works best for|works well for|is ideal for|is for)\b/i,
  ],
  // Capitalised phrases that are not sentence-initial. Matching any capitalised word
  // meant "Sometimes a project stalls. Nobody enjoys that." named a provider. Requires
  // at least 2 capitalised words — a single word like "Manual" (from "Manual J") is a
  // technical term, not a named entity. Real answers are "Datto SIRIS", "Veeam Backup",
  // "Marisol Vega".
  entity: [
    /(?:[a-z,]\s+)\b[A-Z][a-zA-Z]{2,}\s+[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]+){0,2}\b/,
    /(?:[a-z,]\s+)\b[A-Z][a-zA-Z]{2,}\s+[A-Z]{2,}\b/,
  ],
  // A polarity answer, not a call to action. "You can reach our team" previously
  // answered every boolean question. Dash- and colon-tolerant so "Yes — we bulk bill"
  // counts; requiring a literal comma made punctuation decide the verdict.
  boolean: [
    /\b(yes|no)\b(?=\s*[,.—–:;!-]|\s+(?:we|you|it|there|and|but))/i,
    /\byou (do not|don't|do) need\b/i,
    /\bit (is|isn't|is not) (necessary|required|possible|mandatory|covered|included)\b/i,
    /\b(we|it) (do|does|don't|doesn't|do not|does not) (offer|cover|include|require|support|charge)\b/i,
    /\b(is|are) (covered|included|required|mandatory|exempt|eligible)\b/i,
    /\b(there is|there's) no (need|requirement|charge)\b/i,
  ],
  definition: [/\b(is|are)\s+(a|an|the)\b/i, /\brefers to\b/i, /\bmeans\b/i, /\bis defined as\b/i, /\bis used to\b/i],
};

/** Does this passage supply the shape of answer the question demands? */
export function satisfiesAnswerType(passage: string, type: AnswerType): boolean {
  return ANSWER_EVIDENCE[type].some((p) => p.test(passage));
}

/**
 * Vocabulary that signals a passage is *about* the answer type, whether or not it
 * delivers one.
 *
 * Needed for evidence selection. Retrieval ranks on the question's subject, so for
 * "how much is app development" the winning passage on a tutorial site was a
 * glossary of framework names — it matched "app development" perfectly and said
 * nothing about money. Quoting that as proof of a pricing gap is useless. These
 * patterns find where the field actually approaches the topic and stops short.
 */
const GAP_VOCABULARY: Record<AnswerType, RegExp> = {
  money: /\b(costs?|costing|pricing|prices?|budgets?|invest(ment)?s?|fees?|rates?|afford(able)?|expensive|cheap|quotes?|charges?|payments?)\b/i,
  duration: /\b(times?|timelines?|durations?|how long|delivers?|delivery|turnarounds?|schedules?|deadlines?|takes?|lead time|weeks?|months?|days?)\b/i,
  count: /\b(numbers?|how many|counts?|amounts?|quantit(y|ies)|capacity)\b/i,
  steps: /\b(steps?|process(es)?|how to|guides?|start(ing)?|begin(ning)?|first|approach(es)?|methods?|workflows?|stages?)\b/i,
  comparison: /\b(vs|versus|compare[ds]?|comparison|differences?|better|best|alternatives?|either|choos(e|ing)|choices?|options?|which)\b/i,
  entity: /\b(who|teams?|providers?|compan(y|ies)|agenc(y|ies)|experts?|specialists?|partners?|hire|staff)\b/i,
  boolean: /\b(should|need(ed)?|worth|recommend(ed)?|whether|decide|decision|right for|consider(ations?)?|suitable|depends)\b/i,
  definition: /\b(is|are|means?|definitions?|refers?|overview|what|explains?)\b/i,
};

/**
 * Picks the passage that best evidences a gap: one relevant to the question that
 * discusses the answer dimension without delivering it.
 *
 * Returns null when nothing approaches that dimension, which is a meaningful result
 * rather than a failure. On tutorial sites that never mention money, the money-gap
 * "evidence" was a glossary of framework names — quoting it as proof of a pricing gap
 * is worse than quoting nothing, because it looks like evidence and is not.
 *
 * Two constraints, both learned from wrong output. Candidates come from the
 * retrieval-ranked shortlist rather than every passage on the site, because scanning
 * everything surfaced unrelated marketing copy that happened to mention "cost". And
 * hits are scored per hundred words rather than raw, because a raw count always
 * favours the longest passage — which is how a promo blurb beat the short section
 * that actually discussed pricing.
 */
function selectGapEvidence(candidates: string[], type: AnswerType, subjects: string[]): string | null {
  // For `definition` and `entity` the dimension *is* the subject, and their
  // vocabulary ("is", "are", "what", "who") matches almost any prose — so a
  // vocabulary hit carries no information. Such a question is either answered or not;
  // there is no meaningful "approaches it and stops short".
  if (type === "definition" || type === "entity") return null;

  const vocabulary = new RegExp(GAP_VOCABULARY[type].source, "gi");

  // Evidence must be about the subject *and* the dimension. Requiring only the
  // dimension surfaced a cookie-consent vendor table ("Airwallex — Payment
  // processing") as proof that the field discusses app-development pricing.
  const onSubject = (text: string) => {
    if (subjects.length === 0) return true;
    const tokens = new Set(tokenize(text));
    return subjects.some(
      (sub) =>
        tokens.has(sub) ||
        (sub.length >= MIN_PREFIX_MATCH &&
          Array.from(tokens).some((t) => t.length >= MIN_PREFIX_MATCH && t.startsWith(sub.slice(0, MIN_PREFIX_MATCH))))
    );
  };

  const approaching = candidates
    .filter(onSubject)
    .map((text) => {
      const words = text.split(/\s+/).filter(Boolean).length;
      const hits = (text.match(vocabulary) ?? []).length;
      return { text, words, density: words > 0 ? (hits / words) * 100 : 0, hits };
    })
    // Sustained discussion, not one incidental word. A single "cost" inside a
    // 200-word author bio was winning on density alone and being reported as proof
    // that the field discusses pricing.
    .filter((c) => c.words >= 12 && c.hits >= 2 && c.density >= 1)
    .sort((a, b) => b.density - a.density);

  return approaching[0]?.text ?? null;
}

/**
 * Context that looks like the right answer type but answers a different question.
 *
 * Found by inspecting real output: an FAQ section containing developer salaries
 * satisfied "how much does a custom web app cost", and a course syllabus saying
 * "9 hours to complete" satisfied "how long does it take to build a web app". Both
 * are the correct *shape* attached to the wrong *subject*.
 */
const DISTRACTOR_CONTEXT: Partial<Record<AnswerType, RegExp>> = {
  // Narrowed. The earlier set contained "income", "per annum" and "to complete", so it
  // threw away real answers: "$2,400 per month, or $26,000 per annum" was rejected as a
  // salary, and "6 weeks to complete" as a course length.
  money: /\b(salar(y|ies)|wages?|pay scale|take[- ]home|annual income|stipend|scholarship|tuition fee)\b/i,
  duration: /\b(module|lesson|syllabus|curriculum|semester|course length|watch time|reading time|years? of experience|since \d{4}|established|founded)\b/i,
  count: /\b(copyright|all rights reserved)\b/i,
};

/** Words that describe how a question is asked rather than what it is about. */
const ANSWER_SHAPE_WORDS = new Set(
  [
    "cost","costs","price","prices","pricing","much","many","long","take","takes","rate","rates","fee","fees",
    "difference","versus","vs","better","best","need","worth","step","steps","process","guide","who","where","define",
  ].map(stem)
);

/**
 * Locates answer evidence that is actually *about* the question's subject.
 *
 * A pattern match alone is not enough — the figure has to sit near a subject term
 * from the question. This is what separates "a custom web app costs ₱150,000" from
 * "the average developer salary is $75,000" on a page that mentions both.
 */
/**
 * A slice that starts and ends on a word boundary.
 *
 * The evidence window is a fixed character span either side of the match, and a raw slice
 * cuts through words at both ends. These snippets are quoted verbatim in the client-facing
 * export, where "…agents have less levera" and "n metro Australia, up to 3.5%" read as a
 * broken tool rather than a deliberate excerpt.
 */
function wordWindow(text: string, from: number, to: number): string {
  let start = Math.max(0, from);
  let end = Math.min(text.length, to);
  while (start > 0 && /\S/.test(text[start - 1])) start -= 1;
  while (end < text.length && /\S/.test(text[end])) end += 1;
  return text.slice(start, end).trim();
}

/**
 * How many of the question's subject terms must be in scope for an answer to count.
 *
 * Accepting any single term was too loose. Asked "how much does *carpet* cleaning
 * cost", an office-cleaning price satisfied the check on the word "cleaning" alone —
 * the one term that distinguishes the question was the one term ignored. Short
 * subjects must all be present, since with two terms either one alone is ambiguous.
 * Longer subjects keep some slack: prose rarely repeats every qualifier in one
 * window, and demanding all of them rejects real answers.
 */
function requiredSubjects(count: number): number {
  if (count <= 2) return count;
  return Math.ceil((count * 2) / 3);
}

export function findAnswerEvidence(
  passage: string,
  type: AnswerType,
  subjects: string[],
  /** Headings and title that establish what this passage is about. */
  scope = ""
): { found: boolean; snippet: string | null } {
  const patterns = ANSWER_EVIDENCE[type];
  const distractor = DISTRACTOR_CONTEXT[type];
  // Definition answers are inherently about the whole passage, so a proximity
  // requirement would reject correct answers. Entity answers need the named
  // thing to sit near the question's subject — "Manual J" in a load-calculation
  // passage is not a furnace brand, even though both are capitalised.
  const requiresSubject = subjects.length > 0 && type !== "definition";

  // A section headed "Collections" on a page titled "Wedding Photography" is about
  // wedding photography even where the body says only "our collections begin at…".
  // Requiring the subject in the body window alone rejected exactly those answers,
  // so headings count as establishing scope. The distractor check below is what
  // actually prevents a salary figure from answering a project-cost question.
  const scopeTokens = new Set(tokenize(scope));

  let firstMatch: string | null = null;

  for (const pattern of patterns) {
    const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = global.exec(passage)) !== null) {
      if (m[0].length === 0) break;
      const window = wordWindow(passage, m.index - 140, m.index + m[0].length + 140);
      if (firstMatch === null) firstMatch = window.trim();

      if (distractor && distractor.test(window)) continue;
      if (!requiresSubject) return { found: true, snippet: window.trim() };

      const inScope = new Set([...tokenize(window), ...scopeTokens]);
      const present = subjects.filter((s) => conceptPresent(s, inScope)).length;
      if (present >= requiredSubjects(subjects.length)) return { found: true, snippet: window.trim() };
    }
  }

  return { found: false, snippet: firstMatch };
}

/** The question's subject terms — what it is about, minus how it is being asked. */
export function subjectTerms(question: string): string[] {
  return tokenize(question).filter((t) => !ANSWER_SHAPE_WORDS.has(t));
}

// ---------------------------------------------------------------- retrieval

const STOP_WORDS = new Set([
  "a","an","the","and","or","but","if","then","than","that","this","these","those","is","are","was","were","be","been",
  "being","do","does","did","doing","have","has","had","of","in","on","at","to","for","with","by","from","as","about",
  "into","over","after","it","its","i","you","your","we","our","they","their","he","she","my","me","us","them","what",
  "which","who","whom","how","when","where","why","can","could","should","would","will","may","might","must","much","many",
]);

/**
 * Domain synonyms. A lexical retriever's main weakness is that "cost" and
 * "investment" are unrelated strings; expanding the query closes the most damaging
 * gaps without reaching for embeddings.
 */
const SYNONYMS: Record<string, string[]> = {
  cost: ["price", "pricing", "rate", "fee", "investment", "budget", "charge"],
  price: ["cost", "pricing", "rate", "fee"],
  cheap: ["affordable", "budget", "low", "inexpensive"],
  hire: ["engage", "outsource", "contract", "employ", "find"],
  developer: ["dev", "programmer", "engineer", "freelancer", "agency"],
  app: ["application", "webapp", "software", "system", "platform"],
  website: ["site", "web", "webpage"],
  build: ["create", "develop", "make", "produce"],
  small: ["smb", "startup", "local"],
  timeline: ["duration", "schedule", "turnaround"],

  // Cross-industry vocabulary. The entries above are web-development flavoured, which cost
  // recall everywhere else: an agency page reading "Harbour Realty … we charge a flat 1.95%"
  // scored 0.4 term coverage against "how much commission does a real estate agent charge"
  // and was rejected at exactly the gate, because the copy says "realty" and never says
  // "real estate agent". Businesses rarely name themselves the way searchers describe them.
  agent: ["broker", "agency", "realtor", "representative", "consultant", "adviser", "advisor"],
  broker: ["agent", "agency", "brokerage", "adviser", "advisor"],
  realty: ["estate", "property", "real"],
  real: ["realty", "estate", "property"],
  estate: ["realty", "property"],
  property: ["realty", "estate", "home", "house"],
  commission: ["fee", "rate", "charge", "cut"],
  service: ["services", "solution", "solutions", "work"],
  company: ["firm", "business", "provider", "practice", "agency"],
  repair: ["fix", "service", "maintenance", "servicing"],
  installation: ["install", "fitting", "fit-out", "setup"],
  appointment: ["booking", "consultation", "session", "visit"],
};

/**
 * Light suffix stemmer.
 *
 * Without this, "costs" and "cost" are unrelated strings — which caused a page
 * plainly stating a price to be scored as not discussing cost at all. Linguistic
 * precision matters less than applying the same transform to query and document.
 */
export function stem(token: string): string {
  if (token.length <= 3) return token;
  if (token.endsWith("ies") && token.length > 4) return token.slice(0, -3) + "y";
  if (token.endsWith("sses")) return token.slice(0, -2);
  if (token.endsWith("ss")) return token;
  if (token.endsWith("s") && !token.endsWith("us") && !token.endsWith("is")) return token.slice(0, -1);
  if (token.endsWith("ing") && token.length > 5) return stripFinalE(token.slice(0, -3));
  if (token.endsWith("ed") && token.length > 4) return stripFinalE(token.slice(0, -2));
  return stripFinalE(token);
}

/**
 * Drops a trailing "e" so inflected and base forms converge.
 *
 * Without it "pricing" stemmed to "pric" while "price" stayed "price" — a one-way
 * blind spot that reported "topic not covered at all" for a page headed "Prices"
 * whose body listed them.
 */
function stripFinalE(token: string): string {
  return token.length > 4 && token.endsWith("e") ? token.slice(0, -1) : token;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9₱$€£\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t))
    .map(stem);
}

/** Synonyms keyed and valued in stemmed form, so lookup matches tokenized input. */
const STEMMED_SYNONYMS: Map<string, string[]> = new Map(
  Object.entries(SYNONYMS).map(([key, values]) => [stem(key), values.map(stem)])
);

/** Query tokens plus their domain synonyms, so paraphrase does not read as absence. */
export function expandQueryTokens(question: string): string[] {
  const base = tokenize(question);
  const expanded = new Set(base);
  for (const token of base) {
    for (const syn of STEMMED_SYNONYMS.get(token) ?? []) expanded.add(syn);
  }
  return Array.from(expanded);
}

/**
 * Splits a page's text into overlapping windows. Retrieval is passage-level, so a
 * page is scored by its best passage rather than its average — matching how a
 * retriever actually pulls a quotable chunk.
 */
export function chunkText(text: string, windowWords = 60, overlap = 20): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  if (words.length <= windowWords) return [words.join(" ")];

  const chunks: string[] = [];
  const step = Math.max(1, windowWords - overlap);
  for (let i = 0; i < words.length; i += step) {
    chunks.push(words.slice(i, i + windowWords).join(" "));
    if (i + windowWords >= words.length) break;
  }
  return chunks;
}

export interface ScoredPassage {
  text: string;
  score: number;
}

/**
 * BM25 over a page's passages. Standard parameters (k1 1.5, b 0.75) — the point is
 * a defensible relevance ranking, not a tuned search engine.
 */
export function rankPassages(question: string, passages: string[]): ScoredPassage[] {
  if (passages.length === 0) return [];

  const queryTokens = expandQueryTokens(question);
  const docs = passages.map(tokenize);
  const avgLen = docs.reduce((sum, d) => sum + d.length, 0) / docs.length || 1;

  const df = new Map<string, number>();
  for (const token of new Set(queryTokens)) {
    df.set(token, docs.filter((d) => d.includes(token)).length);
  }

  const k1 = 1.5;
  const b = 0.75;
  const N = docs.length;

  return passages
    .map((text, i) => {
      const doc = docs[i];
      let score = 0;
      for (const token of queryTokens) {
        const n = df.get(token) ?? 0;
        if (n === 0) continue;
        const tf = doc.filter((t) => t === token).length;
        if (tf === 0) continue;
        const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
        score += idf * ((tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * doc.length) / avgLen)));
      }
      return { text, score };
    })
    .sort((a, b2) => b2.score - a.score);
}

// ---------------------------------------------------------------- specificity

/**
 * Concrete-fact patterns. Each match is something a language model cannot invent
 * and must therefore attribute.
 */
const CONCRETE_PATTERNS: RegExp[] = [
  /[₱$€£¥]\s?\d[\d,.]*/g,                                    // currency amounts
  /\b\d[\d,.]*\s?(php|usd|eur|gbp|pesos?|dollars?)\b/gi,      // spelled currency
  /\b\d+(\.\d+)?\s?%/g,                                      // percentages
  /\b\d+(\.\d+)?\s?(hours?|days?|weeks?|months?|years?)\b/gi, // durations
  /\b(19|20)\d{2}\b/g,                                       // years
  /\b\d+(\.\d+)?\s?(kb|mb|gb|tb|ms|s|km|kg|px)\b/gi,         // units
  /\b\d[\d,.]*\s?[-–—]\s?\d[\d,.]*\b/g,                      // numeric ranges
  /\b\d+\s?(x|×)\s?\d+\b/gi,                                 // dimensions/multipliers
];

/** Capitalised multi-word phrases and all-caps acronyms — named tools, companies, standards. */
const PROPER_NOUN = /\b[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,}){0,2}\b|\b[A-Z]{3,}\b/g;

/** Language that signals the *absence* of a commitment. Hedging is anti-citable. */
const HEDGE_PATTERNS = [
  /\b(varies|vary|varying)\b/i,
  /\bdepend(s|ing)? (on|upon)\b/i,
  /\b(typically|generally|usually|often|sometimes|roughly|approximately)\b/i,
  /\b(may|might|could) (be|vary|differ|range)\b/i,
  /\bevery (project|business|client|case) is (different|unique)\b/i,
  /\bit dependss?\b/i,
  /\bcontact us for (a )?(quote|pricing|details)\b/i,
];

export interface SpecificityScore {
  /** Concrete facts per 100 words. */
  density: number;
  concreteCount: number;
  hedgeCount: number;
  /** 0–100. High means quotable; low means the model can write it itself. */
  score: number;
}

/**
 * Scores how quotable a passage is.
 *
 * This is the best available proxy for an LLM's citation preference, and it needs
 * no model to compute: assistants cite what they cannot generate. Generic prose is
 * exactly what they produce for free, so it earns no citation; a passage dense with
 * figures, dates and named entities is irreplaceable. Hedging is penalised because
 * it is a statement that no fact is being committed to.
 */
export function scoreSpecificity(passage: string): SpecificityScore {
  const words = passage.split(/\s+/).filter(Boolean).length;
  if (words === 0) return { density: 0, concreteCount: 0, hedgeCount: 0, score: 0 };

  let concreteCount = 0;
  for (const pattern of CONCRETE_PATTERNS) {
    concreteCount += (passage.match(pattern) ?? []).length;
  }

  // Lowercase sentence-initial words before looking for proper nouns. Without this,
  // "Costs vary…" and "Typically…" register as named entities and a passage made
  // entirely of hedging scores as specific.
  const deCapitalised = passage.replace(/(^|[.!?]\s+)([A-Z])/g, (_m, pre, ch) => pre + ch.toLowerCase());
  // Proper nouns are weaker evidence than figures, so they count at a third.
  concreteCount += (deCapitalised.match(PROPER_NOUN) ?? []).length / 3;

  const hedgeCount = HEDGE_PATTERNS.filter((p) => p.test(passage)).length;

  const density = (concreteCount / words) * 100;
  // ~6 concrete facts per 100 words reads as a genuinely specific passage. Damp very
  // short passages, where one stray match would otherwise saturate the score.
  const lengthFactor = Math.min(1, words / 25);
  const raw = Math.min(100, (density / 6) * 100) * lengthFactor;
  // Hedging scales the score down rather than subtracting from it, so prose that is
  // nothing but equivocation lands at zero however dense it looks.
  const hedgeFactor = Math.max(0, 1 - hedgeCount * 0.35);

  return {
    density: Math.round(density * 10) / 10,
    concreteCount: Math.round(concreteCount * 10) / 10,
    hedgeCount,
    score: Math.max(0, Math.round(raw * hedgeFactor)),
  };
}

// ---------------------------------------------------------------- coverage

export type CoverageLevel = "none" | "lexical" | "answered";

export interface CoverageAssessment {
  level: CoverageLevel;
  answerType: AnswerType;
  /** Best-matching passage, for evidence in the finding. */
  passage: string | null;
  /** The heading the passage sits under, when sections were supplied. */
  heading: string | null;
  score: number;
  /** Fraction of the query's IDF mass actually present on the page. */
  termCoverage: number;
  /** Fraction of the question's *subject* terms present — is this page about the ask? */
  subjectCoverage: number;
  /** Quotability of the best passage. */
  specificity: number;
  /**
   * A passage that discusses the answer dimension without delivering it. Null when
   * the field never approaches the dimension at all — quoting an unrelated passage
   * as gap evidence is worse than quoting nothing, because it reads as proof.
   */
  gapEvidence: string | null;
  /** True when the passage matched the topic but supplied no answer of the required shape. */
  isDepthGap: boolean;
  /** URL of the document the verdict came from, when assessed across several. */
  sourceUrl?: string | null;
  /** Title of that document — the citation candidate. */
  sourceTitle?: string | null;
}

/** Shortest prefix length allowed to count as a morphological match. */
const MIN_PREFIX_MATCH = 6;

/**
 * Shortest stem allowed to match a longer inflection of itself.
 *
 * Separate from MIN_PREFIX_MATCH because the two rules answer different questions.
 * A *shared* prefix needs to be long before it means anything — "photography" and
 * "photographer" are the same concept, "content" and "contest" are not. But a stem
 * that is *wholly contained* at the front of a longer word is far safer, and the
 * stemmer routinely produces short ones: "europe" reduces to "europ", five characters,
 * which could not reach a six-character prefix and so failed to match "european". A
 * page charging "£4.20 per kilogram" to Europe read as a depth gap because of it.
 */
const MIN_STEM_MATCH = 5;

/**
 * Do two tokens denote the same concept, allowing for morphology the light stemmer
 * leaves behind? Either they share a long enough prefix, or the shorter is a complete
 * prefix of the longer.
 */
function morphMatch(term: string, token: string): boolean {
  if (term === token) return true;

  const [shorter, longer] = term.length <= token.length ? [term, token] : [token, term];
  if (shorter.length >= MIN_STEM_MATCH && longer.startsWith(shorter)) return true;

  return (
    term.length >= MIN_PREFIX_MATCH &&
    token.length >= MIN_PREFIX_MATCH &&
    token.startsWith(term.slice(0, MIN_PREFIX_MATCH))
  );
}

/**
 * Fraction of the question's concepts the page actually discusses.
 *
 * A raw BM25 floor is useless as a gate — with a few pages of text, any query
 * scrapes together enough common-word overlap to clear it, so "topic absent" never
 * fires. IDF weighting was tried and removed: across only a handful of passages the
 * statistic is degenerate, and a single absent term outweighed four present ones,
 * which rejected pages that plainly answered the question.
 *
 * A concept counts as present three ways, each covering a real failure mode:
 *   exact     — the stemmed term appears
 *   synonym   — a section headed "Pricing" discusses cost without the word "cost"
 *   prefix    — "photographer" and "photography" share a stem no light stemmer unifies
 */
export function termCoverage(question: string, passages: string[]): number {
  return conceptCoverage(Array.from(new Set(tokenize(question))), passages);
}

/**
 * Share of the question's *subject* terms the page discusses.
 *
 * Distinct from `termCoverage`, which counts every concept including the answer
 * dimension. Asked "how much does carpet cleaning cost", a carpet page (carpet,
 * cleaning) and an office-pricing page (cleaning, cost) tie on term coverage at 2 of
 * 3 — so BM25 broke the tie and the off-topic page with a dollar figure won, which is
 * how a carpet gap came to be illustrated by an office price. Subject coverage
 * separates them 2/2 against 1/2: it asks only whether the page is about the thing
 * that was asked about.
 */
export function subjectCoverage(question: string, passages: string[]): number {
  return conceptCoverage(subjectTerms(question), passages);
}

/**
 * Is a concept present in a set of tokens — exactly, by synonym, or by morphology?
 *
 * Shared so every part of the engine agrees on what "present" means. It did not used to:
 * term coverage expanded synonyms while the answer-evidence subject check did not, so a
 * page could clear the topicality gate and then fail subject proximity on the same word.
 * A real-estate page reading "Harbour Realty … we charge a flat 1.95%" was judged to be
 * about the question and then judged not to answer it, for want of the literal token
 * "estate".
 */
export function conceptPresent(term: string, tokens: Set<string>): boolean {
  if (tokens.has(term)) return true;
  if ((STEMMED_SYNONYMS.get(term) ?? []).some((syn) => tokens.has(syn))) return true;
  for (const token of tokens) if (morphMatch(term, token)) return true;
  return false;
}

function conceptCoverage(coreTerms: string[], passages: string[]): number {
  if (coreTerms.length === 0) return 1;

  const present = new Set(passages.flatMap(tokenize));
  const matched = coreTerms.filter((term) => conceptPresent(term, present)).length;
  return matched / coreTerms.length;
}

/** Below this share of the question's concepts, the page isn't about the question. */
const MIN_TERM_COVERAGE = 0.4;

export interface Passage {
  heading?: string;
  text: string;
}

/**
 * Assesses whether a page answers a sub-intent.
 *
 * Three outcomes, and the middle one is the valuable one:
 *   none     — the page doesn't discuss the topic         → coverage gap (Tier 1)
 *   lexical  — discusses it but supplies no real answer   → depth gap  (Tier 2)
 *   answered — supplies the required answer shape
 */
export function assessPassages(question: string, passages: Passage[]): CoverageAssessment {
  const answerType = classifyQuestion(question);

  // Headings and titles are retrieval *context*, so they join the scored text — but
  // they are not answers. A page titled "Term Life vs Whole Life" matches the
  // comparison pattern while its body only says "it depends"; checking answer
  // evidence against body copy alone keeps a promise in the title from counting as
  // a delivered answer.
  const kept = passages.filter((p) => (p.heading || p.text || "").trim());
  const texts = kept.map((p) => (p.heading ? `${p.heading}. ${p.text}` : p.text));
  const bodies = kept.map((p) => p.text ?? "");

  const base: CoverageAssessment = {
    level: "none",
    answerType,
    passage: null,
    heading: null,
    score: 0,
    termCoverage: 0,
    subjectCoverage: 0,
    specificity: 0,
    gapEvidence: null,
    isDepthGap: false,
  };

  if (texts.length === 0) return base;

  const coverage = termCoverage(question, texts);
  const subjectCov = subjectCoverage(question, texts);
  const ranked = rankPassages(question, texts);
  const best = ranked[0];

  if (coverage <= MIN_TERM_COVERAGE || !best || best.score <= 0) {
    return {
      ...base,
      score: best?.score ?? 0,
      termCoverage: Math.round(coverage * 100) / 100,
      subjectCoverage: Math.round(subjectCov * 100) / 100,
    };
  }

  const indexOf = (text: string) => texts.indexOf(text);
  const subjects = subjectTerms(question);
  // Every heading on the page, including its title — what the page declares itself
  // to be about, used as subject scope for the answer check.
  const pageScope = kept.map((p) => p.heading ?? "").join(" ");
  // The page title (first heading with empty body) contains the business name.
  // Entity matches that are part of the business name are not answers — "Comfort Zone"
  // in "Furnace Installation | Comfort Zone Heating" is the business, not a furnace brand.
  const titlePassage = kept.find((p) => p.heading && !(p.text ?? "").trim());
  const titleTokens = new Set(tokenize(titlePassage?.heading ?? ""));

  // Check the top few passages — the answer often sits beside the best lexical match.
  let satisfying: { text: string; score: number } | undefined;
  let evidence: string | null = null;
  for (const candidate of ranked.slice(0, 5)) {
    const i = indexOf(candidate.text);
    if (i < 0) continue;
    const heading = kept[i]?.heading ?? "";
    const body = bodies[i] ?? "";
    // For entity questions, the heading itself can be the answer — "Marisol Vega,
    // Owner and Lead Instructor" names the entity. Other answer types deliberately
    // exclude headings (a title saying "vs" is a promise, not a comparison). Entity
    // is the exception because a named person or product in a heading is the answer.
    // But a page title with no body (e.g. "Furnace Installation | Comfort Zone") is
    // the business name, not an entity answer — skip passages with empty body.
    const sourceText = answerType === "entity" && body.trim() ? `${heading}. ${body}` : body;
    if (!sourceText.trim()) continue;
    // Use the passage's own heading as scope, not the whole page's headings. The
    // page title "Furnace Installation" made any entity match on the page pass
    // subject proximity — "Comfort Zone" in a warranty passage is not a furnace brand.
    const scope = answerType === "entity" ? heading : `${heading} ${pageScope}`;
    const hit = findAnswerEvidence(sourceText, answerType, subjects, scope);
    if (hit.found) {
      // For entity answers, reject matches where the proper noun is the business name
      // from the page title. "Comfort Zone" appears in the title and in the warranty
      // passage, but it is the company, not the entity the question asks for. "Datto"
      // does not appear in the backup page title, so it is a real product name.
      if (answerType === "entity" && hit.snippet && titleTokens.size > 0) {
        // Only multi-word proper nouns can be business names. "Kitchen" from a
        // heading is a common word capitalised by position, not a business name.
        const properNouns = hit.snippet.match(/\b[A-Z][a-zA-Z]{2,}\s+[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]+){0,2}\b/g) ?? [];
        const isBusinessName = properNouns.some((pn) => {
          const pnTokens = tokenize(pn);
          return pnTokens.length > 0 && pnTokens.every((t) => titleTokens.has(t));
        });
        if (isBusinessName) continue;
      }
      satisfying = candidate;
      evidence = hit.snippet;
      break;
    }
  }

  // Structural comparison: no single passage contains contrastive connectors, but
  // the page has distinct sections whose headings each name one side of the
  // comparison. "Essential" and "Complete" sections on a support-plans page are a
  // comparison even without "whereas" — the structure is the contrast.
  if (!satisfying && answerType === "comparison") {
    const sectionHits = new Map<string, number>();
    for (const candidate of ranked.slice(0, 8)) {
      const i = indexOf(candidate.text);
      if (i < 0) continue;
      const heading = kept[i]?.heading ?? "";
      const body = bodies[i] ?? "";
      if (!body.trim() || !heading.trim()) continue;
      const headingTokens = new Set(tokenize(heading));
      // The heading must match a subject term — "Essential" matches subject "essential"
      for (const s of subjects) {
        if (s.length < MIN_PREFIX_MATCH) continue;
        if (headingTokens.has(s) || Array.from(headingTokens).some((t) => t.startsWith(s.slice(0, MIN_PREFIX_MATCH)))) {
          sectionHits.set(heading, candidate.score);
          break;
        }
      }
    }
    // Need 2+ distinct sections matching different subjects to call it a structural comparison
    if (sectionHits.size >= 2) {
      const topSection = Array.from(sectionHits.entries()).sort((a, b) => b[1] - a[1])[0];
      const topIdx = kept.findIndex((p) => p.heading === topSection[0]);
      satisfying = ranked.find((r) => r.text === texts[topIdx]);
      evidence = bodies[topIdx]?.slice(0, 280) ?? null;
    }
  }

  const chosen = satisfying ?? best;
  const chosenIndex = indexOf(chosen.text);
  const body = chosenIndex >= 0 ? bodies[chosenIndex] || chosen.text : chosen.text;

  // For a gap, quote where the field approaches the answer type and stops short —
  // not merely the best subject match, which can be an unrelated glossary. Restricted
  // to the retrieval shortlist so the quote is about the question.
  const shortlist = ranked
    .slice(0, 8)
    .map((r) => bodies[indexOf(r.text)])
    .filter((t): t is string => Boolean(t && t.trim()));
  const gapEvidence = satisfying ? null : selectGapEvidence(shortlist, answerType, subjects);

  return {
    level: satisfying ? "answered" : "lexical",
    answerType,
    passage: evidence ?? gapEvidence ?? body,
    gapEvidence,
    heading: chosenIndex >= 0 ? kept[chosenIndex]?.heading ?? null : null,
    score: Math.round(best.score * 100) / 100,
    termCoverage: Math.round(coverage * 100) / 100,
    subjectCoverage: Math.round(subjectCov * 100) / 100,
    specificity: scoreSpecificity(body).score,
    isDepthGap: !satisfying,
  };
}

/** Convenience wrapper for raw page text, chunked into overlapping windows. */
export function assessCoverage(question: string, pageText: string): CoverageAssessment {
  return assessPassages(
    question,
    chunkText(pageText).map((text) => ({ text }))
  );
}

/** One crawled page. The document is the unit a citation names and the unit scope must respect. */
export interface CoverageDocument {
  url?: string | null;
  title?: string | null;
  passages: Passage[];
}

/** Ordering used to pick a site's verdict from its pages. */
const LEVEL_RANK: Record<CoverageLevel, number> = { none: 0, lexical: 1, answered: 2 };

/**
 * Assesses a site made of several crawled pages, one page at a time.
 *
 * Why this exists rather than concatenating the pages: `assessPassages` establishes
 * subject scope from the headings it is given, and `findAnswerEvidence` accepts that
 * scope with no distance limit. Hand it a whole site and any heading anywhere makes
 * subject proximity free everywhere — an office-cleaning price then "answers" a
 * carpet-cleaning question, and the quoted evidence comes from a different page than
 * the question. That union was the root cause named when independent validation put
 * held-out accuracy at 78%.
 *
 * A site answers a question when *some single page* answers it, which is also what a
 * citation means: an assistant quotes one document, not a domain. So the verdict is
 * the best page's verdict, and the page that produced it is reported — the answer to
 * "which page is the citation candidate".
 */
export function assessDocuments(question: string, documents: CoverageDocument[]): CoverageAssessment {
  if (documents.length === 0) return assessPassages(question, []);

  let best: CoverageAssessment | null = null;

  for (const doc of documents) {
    const assessment = assessPassages(question, doc.passages);
    const tagged: CoverageAssessment = {
      ...assessment,
      sourceUrl: doc.url ?? null,
      sourceTitle: doc.title ?? null,
    };
    if (!best || isStronger(tagged, best)) best = tagged;
  }

  return best!;
}

/**
 * A stronger verdict, in the order that matters for citation.
 *
 * Level dominates: one page that answers beats ten that merely discuss.
 *
 * Within a level the tie-break flips, because the two levels are read for different
 * reasons. For `answered`, specificity decides — models cite what they cannot
 * generate, so the more quotable page is the better citation candidate. For `lexical`
 * and `none` the assessment is gap evidence, and there topicality must win: ranking a
 * near-miss by specificity picked an unrelated page that happened to carry a figure,
 * so a carpet-cleaning gap was illustrated by an office-cleaning price.
 */
function isStronger(a: CoverageAssessment, b: CoverageAssessment): boolean {
  if (LEVEL_RANK[a.level] !== LEVEL_RANK[b.level]) return LEVEL_RANK[a.level] > LEVEL_RANK[b.level];
  if (a.level === "answered") {
    if (a.specificity !== b.specificity) return a.specificity > b.specificity;
    return a.score > b.score;
  }
  if (a.subjectCoverage !== b.subjectCoverage) return a.subjectCoverage > b.subjectCoverage;
  if (a.termCoverage !== b.termCoverage) return a.termCoverage > b.termCoverage;
  return a.score > b.score;
}

export interface FieldCoverage {
  question: string;
  answerType: AnswerType;
  total: number;
  answered: number;
  lexicalOnly: number;
  absent: number;
  /** Fraction of the field that fails to answer — feeds the existing prevalence gate. */
  gapRate: number;
  /** Why a synthesizer would hedge on this question, in plain words. */
  hedgeReason: string | null;
}

const MISSING_FACT: Record<AnswerType, string> = {
  money: "no source states an actual figure",
  duration: "no source states an actual timeframe",
  count: "no source gives a number",
  steps: "no source lays out an ordered process",
  comparison: "no source directly contrasts the options",
  entity: "no source names a specific provider",
  boolean: "no source gives a direct answer",
  definition: "no source defines the term plainly",
};

/**
 * Aggregates per-page assessments into a field-level verdict, and derives the hedge:
 * if the field discusses a question but nobody supplies the required answer shape,
 * that is precisely the condition that forces an assistant to equivocate.
 */
export function summarizeFieldCoverage(question: string, assessments: CoverageAssessment[]): FieldCoverage {
  const total = assessments.length;
  const answered = assessments.filter((a) => a.level === "answered").length;
  const lexicalOnly = assessments.filter((a) => a.level === "lexical").length;
  const absent = assessments.filter((a) => a.level === "none").length;
  const answerType = classifyQuestion(question);

  let hedgeReason: string | null = null;
  if (total > 0 && answered === 0) {
    hedgeReason =
      lexicalOnly > 0
        ? `${lexicalOnly} of ${total} sources discuss this but ${MISSING_FACT[answerType]}`
        : `none of the ${total} sources address this at all`;
  }

  return {
    question,
    answerType,
    total,
    answered,
    lexicalOnly,
    absent,
    gapRate: total > 0 ? (total - answered) / total : 0,
    hedgeReason,
  };
}
