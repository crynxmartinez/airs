/**
 * Demand discovery — what people actually search, from keyless public endpoints.
 *
 * This replaces guessing. The previous `/api/suggest` route derived "queries" from
 * word frequency on the site's own pages, which measures what you already say, not
 * what anyone asks. Autocomplete is real query data: every suggestion is a string
 * users have actually typed, and Google's is locale-aware, which matters when the
 * buyer is in Manila and the global cost content is priced in US dollars.
 *
 * No API key required. An LLM is only needed later, to judge whether a page
 * *answers* one of these questions — not to find the questions.
 */

/** Prefixes that turn a topic seed into the question shape assistants fan out into. */
const QUESTION_PREFIXES = [
  "how much",
  "how much does",
  "how to",
  "how do i",
  "what is",
  "what does",
  "why",
  "when",
  "which",
  "is",
  "do i need",
  "should i",
  "best",
  "cheapest",
];

/** Suffixes that surface comparison and qualifier intent. */
const QUESTION_SUFFIXES = ["cost", "price", "vs", "for small business", "near me", "reviews", "worth it"];

const QUESTION_STARTERS =
  /^(how|what|why|when|where|which|who|can|could|do|does|did|is|are|was|should|would|will|may|must)\b/i;

export interface Suggestion {
  question: string;
  source: "autocomplete_google" | "autocomplete_ddg";
  seed: string;
  isQuestion: boolean;
}

export interface DemandOptions {
  /** ISO country code for Google's `gl` parameter, e.g. "ph". */
  country?: string;
  /** Language for `hl`, e.g. "en". */
  language?: string;
  /** Delay between upstream calls, to stay polite. */
  delayMs?: number;
}

/**
 * Both endpoints return `[seed, [suggestion, ...], ...]`. DuckDuckGo can also
 * return `[{phrase}, ...]` depending on the `type` parameter, so handle both.
 */
export function parseSuggestions(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    if (Array.isArray(raw[1])) {
      return (raw[1] as unknown[]).filter((s): s is string => typeof s === "string");
    }
    return raw
      .map((entry) =>
        entry && typeof entry === "object" && "phrase" in entry
          ? (entry as { phrase?: unknown }).phrase
          : entry
      )
      .filter((s): s is string => typeof s === "string");
  }
  return [];
}

export function isQuestionLike(text: string): boolean {
  return text.includes("?") || QUESTION_STARTERS.test(text.trim());
}

/** Vendor- and place-specific long tail: real queries, but not about the topic. */
const LONG_TAIL_MARKERS = [
  /\bcompany in\b/i,
  /\bagenc(y|ies) in\b/i,
  /\bservices? in\b/i,
  /\breviews?\b/i,
  /\bsalary\b/i,
  /\bjobs?\b/i,
  /\bcourse|tutorial|certification|bootcamp\b/i,
];

/**
 * Vendor-shopping markers. A searcher typing "… development company pricing" wants a
 * supplier shortlist, not an answer, so the query cannot evidence a content gap.
 * Question-shaped queries are exempt — "how much does a development company charge"
 * is a genuine question that happens to contain the word.
 */
const VENDOR_SHOPPING = /\b(compan(y|ies)|agenc(y|ies)|firms?|vendors?|freelancers? (in|near))\b/i;

/**
 * Rejects brand and location long tail.
 *
 * Autocomplete surfaced "custom web application development company in bhubaneswar"
 * and "kuchoriya techsoft ... reviews" — genuine searches, but a weakness analysis
 * cannot act on a query naming another vendor or a city you do not serve. Anything
 * question-shaped is exempt, since those are what assistants fan out into.
 */
export function isLongTailNoise(question: string): boolean {
  if (LONG_TAIL_MARKERS.some((p) => p.test(question))) return true;
  // Question-shaped queries are what assistants fan out into, so they survive the
  // keyword-tail rules below however long they are.
  if (isQuestionLike(question)) return false;
  // A long keyword string that is not a question is almost always brand or geo tail.
  if (question.split(/\s+/).length > 5) return true;
  return VENDOR_SHOPPING.test(question);
}

/** Builds the seed variants to send upstream. Autocomplete only completes forward,
 *  so prefix variants are how question-shaped queries get surfaced at all.
 *
 *  When the topic includes a location (e.g. "custom home builder sydney"), the
 *  question-prefixed seeds often return nothing because the long-tail is too
 *  specific. We also seed with a location-stripped version ("custom home builder")
 *  to surface the question-shaped queries that do have volume. */
export function buildSeeds(topic: string): string[] {
  const base = topic.trim().toLowerCase();
  if (!base) return [];

  const seeds = new Set<string>([base]);
  for (const prefix of QUESTION_PREFIXES) seeds.add(`${prefix} ${base}`);
  for (const suffix of QUESTION_SUFFIXES) seeds.add(`${base} ${suffix}`);

  // Also seed with a location-stripped version for broader autocomplete coverage
  const stripped = stripLocation(base);
  if (stripped && stripped !== base) {
    seeds.add(stripped);
    for (const prefix of QUESTION_PREFIXES) seeds.add(`${prefix} ${stripped}`);
    for (const suffix of QUESTION_SUFFIXES) seeds.add(`${stripped} ${suffix}`);
  }

  return Array.from(seeds);
}

/** Common location words to strip from topics for broader seed generation. */
const LOCATION_PATTERN = /\b(sydney|melbourne|brisbane|perth|adelaide|auckland|wellington|london|manchester|birmingham|glasgow|dublin|toronto|vancouver|montreal|ottawa|calgary|edmonton|new york|los angeles|chicago|houston|phoenix|philadelphia|san antonio|san diego|dallas|san jose|austin|jacksonville|fort worth|columbus|charlotte|san francisco|indianapolis|seattle|denver|boston|el paso|nashville|detroit|oklahoma city|portland|las vegas|memphis|louisville|baltimore|milwaukee|albuquerque|tucson|fresno|sacramento|kansas city|mesa|atlanta|omaha|colorado springs|raleigh|miami|long beach|virginia beach|oakland|minneapolis|tulsa|arlington|tampa|new orleans|wichita|cleveland|bakersfield|aurora|anaheim|honolulu|santa ana|riverside|corpus christi|lexington|stockton|st louis|saint louis|pittsburgh|saint paul|paul|anchorage|cincinnati|henderson|greensboro|plano|newark|toledo|lincoln|orlando|chula vista|jersey city|irvine|fort wayne|frisco|chandler|reno|north las vegas|winston salem|gilbert|glendale|reno|norfolk|madison|boise|spokane|belfast|cardiff|edinburgh|aberdeen|newcastle|sheffield|leeds|bristol|nottingham|leicester|coventry|hull|plymouth|brighton|reading|oxford|cambridge|manila|cebu|davao|quezon|mumbai|delhi|bangalore|chennai|hyderabad|kolkata|pune|ahmedabad|jaipur|surat|singapore|hong kong|tokyo|osaka|seoul|busan|bangkok|kuala lumpur|jakarta|manila|melbourne|geelong|ballarat|bendigo|gold coast|sunshine coast|wollongong|newcastle|central coast|townsville|cairns|toowoomba|darwin|hobart|launceston)\b/gi;

function stripLocation(topic: string): string {
  const stripped = topic.replace(LOCATION_PATTERN, "").replace(/\s+/g, " ").trim();
  // Only use the stripped version if it's still meaningful (at least 2 words)
  if (stripped.split(/\s+/).filter(Boolean).length >= 2) {
    return stripped;
  }
  return "";
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json,text/javascript,*/*",
      },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    // Some endpoints answer with a JS content-type; parse the text ourselves.
    return JSON.parse(await res.text());
  } catch {
    return null;
  }
}

async function googleSuggest(seed: string, opts: DemandOptions): Promise<string[]> {
  const params = new URLSearchParams({
    client: "firefox",
    hl: opts.language ?? "en",
    q: seed,
  });
  if (opts.country) params.set("gl", opts.country);
  return parseSuggestions(await fetchJson(`https://suggestqueries.google.com/complete/search?${params}`));
}

async function ddgSuggest(seed: string): Promise<string[]> {
  const params = new URLSearchParams({ q: seed, type: "list" });
  return parseSuggestions(await fetchJson(`https://duckduckgo.com/ac/?${params}`));
}

/**
 * Expands a topic into the real queries people type around it.
 *
 * Returns deduplicated suggestions with their source and seed, so a caller can tell
 * a locale-specific Google result from a generic DuckDuckGo one.
 */
export async function discoverDemand(topic: string, opts: DemandOptions = {}): Promise<Suggestion[]> {
  const seeds = buildSeeds(topic);
  const delayMs = opts.delayMs ?? 250;
  const byQuestion = new Map<string, Suggestion>();

  // Also compute the location-stripped topic for broader relevance matching
  const strippedTopic = stripLocation(topic.trim().toLowerCase());

  const add = (question: string, source: Suggestion["source"], seed: string) => {
    const clean = question.replace(/\s+/g, " ").trim().toLowerCase();
    // Drop echoes of the seed itself and anything too short to be a real query.
    if (clean.length < 8) return;
    // Autocomplete drifts: seeding "custom web app" returned "custom wallpaper cost"
    // and "what is it worth app" — a shared modifier is not shared topic.
    // Check relevance against both the full topic and the stripped topic.
    if (!isTopicRelevant(clean, topic) && !(strippedTopic && isTopicRelevant(clean, strippedTopic))) return;
    if (isLongTailNoise(clean)) return;
    if (byQuestion.has(clean)) return;
    byQuestion.set(clean, { question: clean, source, seed, isQuestion: isQuestionLike(clean) });
  };

  for (const seed of seeds) {
    for (const s of await googleSuggest(seed, opts)) add(s, "autocomplete_google", seed);
    await new Promise((r) => setTimeout(r, delayMs));
    for (const s of await ddgSuggest(seed)) add(s, "autocomplete_ddg", seed);
    await new Promise((r) => setTimeout(r, delayMs));
  }

  // Question-shaped queries first — those are what an assistant fans out into.
  return Array.from(byQuestion.values()).sort((a, b) => {
    if (a.isQuestion !== b.isQuestion) return a.isQuestion ? -1 : 1;
    return a.question.localeCompare(b.question);
  });
}

/**
 * Headings that are site furniture rather than topic coverage.
 *
 * Found by running the pipeline: harvesting every question-shaped heading pulled in
 * cookie notices ("do not track"), licence FAQs ("can i redistribute the content?"),
 * feedback widgets ("did you find what you were looking for today?") and each
 * competitor's own product FAQ ("how can i update an existing roadmap?"). All ten
 * questions in the first real run were boilerplate of this kind.
 */
const BOILERPLATE_QUESTION = [
  /\b(cookie|privacy|gdpr|ccpa|do not track|opt.?out|consent|third.part(y|ies))\b/i,
  /\b(terms|licence|license|copyright|trademark|redistribut|reproduc|attribution)\b/i,
  /\b(did you find|was this (helpful|useful)|rate this|feedback|report (an )?error|contact (us|sales)|newsletter|subscribe)\b/i,
  /\b(sign ?(in|up)|log ?in|my account|password|unsubscribe|refund|cancel my)\b/i,
  /\b(this (site|website|page|platform|app)|our (site|website|platform))\b/i,
];

/** Words naming the competitor's own product rather than the shared topic. */
const PRODUCT_SELF_REFERENCE = /\b(roadmap|our (course|program|bootcamp|tool|dashboard)|the (editor|playground|sandbox))\b/i;

/** Does this question relate to the topic, or did a shared word drag it in? */
export function isTopicRelevant(question: string, topic: string): boolean {
  const topicTokens = topic
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 2);
  if (topicTokens.length === 0) return true;

  // Compare whole words, not substrings. Substring matching passed "best online
  // custom apparel" for the topic "custom web app", because "apparel" contains "app".
  const qTokens = new Set(
    question
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean)
  );

  // Prefix matching only helps for longer stems ("develop" → "development"); allowing
  // it on a 3-letter token is what re-admits "apparel".
  const matches = (topicToken: string) =>
    qTokens.has(topicToken) ||
    (topicToken.length >= 5 &&
      Array.from(qTokens).some((t) => t.startsWith(topicToken) || topicToken.startsWith(t.slice(0, 5))));

  // The head noun is the last one or two words: "custom web app" is about apps, so
  // "how much does custom wallpaper cost" shares only the modifier and is off-topic.
  if (topicTokens.slice(-2).some(matches)) return true;

  // Otherwise demand more than a single incidental overlap.
  return topicTokens.filter(matches).length >= 2;
}

/**
 * Harvests sub-intents from what the field already chose to answer. Competitor
 * headings are free (the crawl stores them) and are a direct statement of which
 * questions the cited pages consider worth covering — once furniture is filtered out.
 */
export function subIntentsFromHeadings(
  headings: { level: number; text: string }[],
  topic?: string
): string[] {
  return headings
    .filter((h) => h.level >= 2 && h.level <= 3)
    .map((h) => h.text.replace(/\s+/g, " ").trim())
    .filter((t) => t.length >= 12 && t.length <= 120)
    .filter((t) => isQuestionLike(t) || /\b(cost|price|pricing|how|vs|versus|benefits|steps|guide)\b/i.test(t))
    .filter((t) => !BOILERPLATE_QUESTION.some((p) => p.test(t)))
    .filter((t) => !PRODUCT_SELF_REFERENCE.test(t))
    .filter((t) => (topic ? isTopicRelevant(t, topic) : true));
}

// ---------------------------------------------------------------- commercial intent

/**
 * Who is asking, in commercial terms.
 *
 * Topic relevance is not enough. Every question below is genuinely about commercial
 * insurance, and only two of them come from someone who might buy it:
 *
 *   how much is a million dollar commercial insurance policy   → buying
 *   do i need commercial insurance for a van                   → evaluating
 *   how much do commercial insurance brokers make              → career
 *   how to become a commercial insurance broker                → learning
 *
 * Without this split, a services business is briefed to publish competitor salary data —
 * which is what happened: eight of ten briefs on the reference evaluation targeted people
 * researching a career, not people buying a policy.
 */
export type CommercialIntent = "buying" | "evaluating" | "learning" | "career" | "general";

/** Earnings, not prices. The verb decides: "make/earn/charge" is career, "cost/price" is not. */
const CAREER_SIGNALS: RegExp[] = [
  // "commission" is deliberately absent. Its intent is industry-dependent: for an insurance
  // broker it is how the broker gets paid (career), for a real estate agency it is what the
  // seller pays (buying). Listing it here classified "how much commission does an agent
  // charge" — a seller's question — as a career query. The verb disambiguates, and the
  // make/earn patterns below already catch "how much commission do agents make".
  /\b(salary|salaries|wage|wages|income)\b/i,
  /\bhow much (do|does|can|should)\b[^?]*\b(make|earn|charge|get paid|be paid)\b/i,
  /\bhow (do|does)\b[^?]*\b(get paid|make money)\b/i,
  // "what does a broker make" is the same question as "how much does a broker make", and was
  // reaching the brief set because only the "how much" phrasing was covered.
  /\bwhat (do|does)\b[^?]*\b(make|earn|charge|get paid)\b/i,
  // Autocomplete drops the article: "how to become commercial insurance broker" never
  // matched a /\bbecome an?\b/ pattern.
  /\bhow (to|do i|can i) become\b/i,
  /\bbecome an? \w+/i,
  // "how to get into commercial insurance" — entering the industry, not buying from it.
  /\bget(ting)? into\b/i,
  /\b(job|jobs|hiring|career|careers|resume|internship|apprenticeship)\b/i,
  /\bwhat (do|does)\b[^?]*\bdo all day\b/i,
];

/** Someone acquiring the skill rather than buying the service. */
const LEARNING_SIGNALS: RegExp[] = [
  /\b(learn|learning|tutorial|tutorials|roadmap|curriculum|syllabus)\b/i,
  /\bfrom scratch\b/i,
  /\b(course|courses|training|bootcamp|certification|certificate|exam|degree)\b/i,
  /\bfor (beginners|dummies|students)\b/i,
  /\b(study|studying|practice|exercises)\b/i,
  /\bhow to (build|make|create|write|code|deploy|set up)\b/i,
];

/** Someone with a wallet open. */
const BUYING_SIGNALS: RegExp[] = [
  /\bhow much (does|is|do|would|will)\b[^?]*\b(cost|charge|run|be)\b/i,
  // A bare "how much is a million dollar policy" names no cost verb but is plainly a price
  // question. Safe here only because career is matched first — "how much is the average
  // salary" never reaches this line.
  /\bhow much (is|are|would|will)\b/i,
  /\b(cost|costs|price|prices|pricing|fee|fees|rate|rates|premium|premiums|quote|quotes)\b/i,
  /\b(hire|hiring a|buy|purchase|order|book)\b/i,
  /\b(near me|in my area|local)\b/i,
  /\b(agency|agencies|provider|providers|company|companies|firm|firms|specialist)\b/i,
  /\b(cheap|cheapest|affordable|budget)\b/i,
];

/** Someone choosing between options. */
const EVALUATING_SIGNALS: RegExp[] = [
  /\bvs\.?\b|\bversus\b/i,
  /\bdifference between\b/i,
  /\bcompared? to\b/i,
  /\b(do|does) (i|we|you) (need|require)\b/i,
  /\bis it worth\b|\bworth it\b/i,
  /\bshould (i|we)\b/i,
  /\bwhich (is|one|type|kind|policy|plan|provider)\b/i,
  /\b(best|top) \w+ for\b/i,
  /\bpros and cons\b/i,
];

/**
 * Classify a question by commercial intent.
 *
 * Order is the whole design. Career is checked first because its phrasing overlaps buying
 * ("how much do brokers make" vs "how much does a policy cost" — both open with "how much"),
 * and learning before buying because "how to build X" often mentions cost in passing.
 * Anything unmatched is `general` — usually a definitional question, which is legitimate
 * top-of-funnel for a buyer and is not dropped.
 */
export function classifyCommercialIntent(question: string): CommercialIntent {
  if (CAREER_SIGNALS.some((r) => r.test(question))) return "career";
  if (LEARNING_SIGNALS.some((r) => r.test(question))) return "learning";
  if (BUYING_SIGNALS.some((r) => r.test(question))) return "buying";
  if (EVALUATING_SIGNALS.some((r) => r.test(question))) return "evaluating";
  return "general";
}

/**
 * Which intents earn a brief, per the evaluation's declared search intent.
 *
 * `general` is always accepted — "what is commercial insurance" is a real buyer question,
 * just an early one. An education publisher legitimately wants the learning cluster, which
 * is why this is a table rather than a blanket rule.
 */
const ACCEPTED_INTENTS: Record<string, CommercialIntent[]> = {
  transactional: ["buying", "evaluating", "general"],
  commercial: ["buying", "evaluating", "general"],
  navigational: ["buying", "evaluating", "general"],
  informational: ["buying", "evaluating", "general", "learning"],
};

/**
 * Does this question belong in the brief set for an evaluation of this intent?
 *
 * An unrecognised or absent search intent accepts everything. Silently narrowing the
 * question set on a guess would be worse than the problem being fixed.
 */
export function acceptsIntent(intent: CommercialIntent, searchIntent?: string | null): boolean {
  const accepted = ACCEPTED_INTENTS[(searchIntent ?? "").toLowerCase()];
  return accepted ? accepted.includes(intent) : true;
}
