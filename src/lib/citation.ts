/**
 * Citation prediction and weakness scoring.
 *
 * Two models, in order. Which pages an assistant would cite is a *retrieval*
 * outcome, so it can be predicted deterministically; where that cited set fails is
 * then a gap analysis over the prediction. Getting the order wrong matters — score
 * weakness against the wrong pages and every finding is about the wrong competitors.
 */

import {
  assessDocuments,
  assessPassages,
  classifyQuestion,
  type AnswerType,
  type CoverageAssessment,
  type CoverageDocument,
  type Passage,
  // Relative rather than the "@/" alias: Node resolves this directly, so the module
  // stays testable with `node --test` without a path-mapping loader.
} from "./coverage.ts";

// ---------------------------------------------------------------- citation

export interface CandidatePage {
  /** Stable identifier — usually the competitor id. */
  id: string;
  label: string;
  url: string;
  /**
   * Flat passage list — a single document. Prefer `documents` for a multi-page site:
   * concatenating pages here leaks subject scope between them and produces false
   * "answered" verdicts. Kept for single-page callers and tests.
   */
  passages?: Passage[];
  /** The site's crawled pages, assessed one at a time. Takes precedence over `passages`. */
  documents?: CoverageDocument[];
  /** False when the site blocks AI crawlers; a hard gate rather than a weight. */
  aiCrawlable?: boolean;
  /** Most recent published/modified date the page declares. */
  lastModified?: string | null;
}

export interface CitationFactors {
  queryMatch: number;
  answerPresence: number;
  specificity: number;
  extractability: number;
  freshness: number;
}

export interface CitationPrediction {
  id: string;
  label: string;
  url: string;
  /** 0–100 likelihood this page is the one quoted. */
  score: number;
  factors: CitationFactors;
  assessment: CoverageAssessment;
  /** Why it would or would not be cited, in one line. */
  reason: string;
}

/**
 * Factor weights.
 *
 * Specificity is weighted heavily on purpose: a model cites what it cannot generate
 * itself, so a passage dense with figures and named entities is irreplaceable while
 * generic prose is exactly what the model produces for free. These are hand-set and
 * are the first thing to calibrate once real citation labels exist.
 */
const WEIGHTS: CitationFactors = {
  queryMatch: 0.3,
  answerPresence: 0.25,
  specificity: 0.2,
  extractability: 0.15,
  freshness: 0.1,
};

/** Topics whose answers rot; freshness matters more where the facts move. */
const VOLATILE_ANSWER_TYPES: AnswerType[] = ["money", "duration", "comparison"];

/**
 * Can the passage stand alone once lifted out of the page?
 *
 * A retriever quotes a fragment. One that opens with an unresolved reference — "this
 * approach", "as mentioned above" — reads as broken out of context and is a poorer
 * citation than a self-contained sentence sitting under its own heading.
 */
export function scoreExtractability(assessment: CoverageAssessment): number {
  const passage = assessment.passage;
  if (!passage) return 0;

  let score = 0.4;
  if (assessment.heading) score += 0.3;

  const opening = passage.trim().slice(0, 60).toLowerCase();
  const danglingReference = /^(this|that|these|those|it|they|he|she|such|as (mentioned|noted|described|above|discussed))\b/.test(
    opening
  );
  if (!danglingReference) score += 0.2;

  // A quotable answer is a sentence or two, not a wall or a fragment.
  const words = passage.split(/\s+/).filter(Boolean).length;
  if (words >= 15 && words <= 120) score += 0.1;

  return Math.min(1, score);
}

/** Recency, scaled by whether this kind of answer decays. */
export function scoreFreshness(lastModified: string | null | undefined, answerType: AnswerType, now = Date.now()): number {
  const volatile = VOLATILE_ANSWER_TYPES.includes(answerType);
  // An undeclared date is a real weakness for volatile answers and near-irrelevant
  // for stable ones, so the neutral value differs by type.
  if (!lastModified) return volatile ? 0.3 : 0.6;

  const parsed = Date.parse(lastModified);
  if (isNaN(parsed)) return volatile ? 0.3 : 0.6;

  const months = (now - parsed) / (1000 * 60 * 60 * 24 * 30.44);
  const halfLife = volatile ? 12 : 36;
  return Math.max(0, Math.min(1, Math.pow(0.5, Math.max(0, months) / halfLife)));
}

/**
 * Assess one candidate, document by document when its pages were supplied separately.
 *
 * A site's pages must not be concatenated: scope would leak between them and a price
 * on an unrelated page would answer this question. See `assessDocuments`.
 */
function assessCandidate(question: string, candidate: CandidatePage): CoverageAssessment {
  if (candidate.documents && candidate.documents.length > 0) {
    return assessDocuments(question, candidate.documents);
  }
  return assessPassages(question, candidate.passages ?? []);
}

/**
 * Predicts which pages an assistant would cite for a question, best first.
 *
 * Query match is normalised across the candidate set rather than absolute, because
 * BM25 scores are only meaningful relative to the pool being ranked.
 */
export function predictCitations(question: string, candidates: CandidatePage[]): CitationPrediction[] {
  const answerType = classifyQuestion(question);
  const assessed = candidates.map((c) => ({ candidate: c, assessment: assessCandidate(question, c) }));
  const maxMatch = Math.max(1, ...assessed.map((a) => a.assessment.score));

  const predictions = assessed.map(({ candidate, assessment }) => {
    const factors: CitationFactors = {
      queryMatch: Math.min(1, assessment.score / maxMatch),
      answerPresence: assessment.level === "answered" ? 1 : assessment.level === "lexical" ? 0.25 : 0,
      specificity: assessment.specificity / 100,
      extractability: scoreExtractability(assessment),
      freshness: scoreFreshness(candidate.lastModified, answerType),
    };

    const weighted =
      factors.queryMatch * WEIGHTS.queryMatch +
      factors.answerPresence * WEIGHTS.answerPresence +
      factors.specificity * WEIGHTS.specificity +
      factors.extractability * WEIGHTS.extractability +
      factors.freshness * WEIGHTS.freshness;

    // Blocking AI crawlers removes the page from consideration entirely — no amount
    // of quality compensates for being absent from the index.
    const gate = candidate.aiCrawlable === false ? 0 : 1;

    return {
      id: candidate.id,
      label: candidate.label,
      url: candidate.url,
      score: Math.round(weighted * gate * 100),
      factors,
      assessment,
      reason: explain(candidate, assessment, factors),
    };
  });

  return predictions.sort((a, b) => b.score - a.score);
}

function explain(candidate: CandidatePage, assessment: CoverageAssessment, factors: CitationFactors): string {
  if (candidate.aiCrawlable === false) return "blocks AI crawlers — cannot be cited at all";
  if (assessment.level === "none") return "does not address the question";
  if (assessment.level === "lexical") return `discusses the topic but supplies no ${assessment.answerType} answer`;
  if (factors.specificity < 0.25) return "answers, but too generically to be worth quoting";
  if (factors.extractability < 0.6) return "answers, but the passage does not stand alone well";
  return "answers concretely in a self-contained passage";
}

// ---------------------------------------------------------------- weakness

export interface WeaknessInput {
  question: string;
  /** Demand evidence: was this question actually observed being asked. */
  inAutocomplete?: boolean;
  /** How many competitors chose to write a heading about it. */
  competitorHeadings?: number;
  /** The predicted cited set for this question. */
  predictions: CitationPrediction[];
  /** Your own asset's assessment, when it has been crawled. */
  self?: CoverageAssessment | null;
}

export type Effort = "low" | "medium" | "high";

export interface WeaknessScore {
  question: string;
  answerType: AnswerType;
  /** How badly the cited set fails: 0 = well answered, 1 = nobody answers. */
  severity: number;
  demand: number;
  winnability: number;
  durability: number;
  effort: Effort;
  /** Composite ranking score, 0–100. */
  score: number;
  /** True when no predicted citation answers — an assistant is forced to equivocate. */
  forcesHedge: boolean;
  /** Whether you already answer this, so it should not become a task. */
  alreadyCovered: boolean;
  evidence: string | null;
  /** False when no cited source approaches the answer dimension, so there is
   *  nothing honest to quote — the gap is absence, not equivocation. */
  evidenceIsReal: boolean;
  rationale: string;
}

const EFFORT_BY_TYPE: Record<AnswerType, Effort> = {
  money: "low",        // you own your own numbers
  duration: "low",     // you know your own timelines
  boolean: "low",
  definition: "low",
  entity: "low",
  count: "medium",
  steps: "medium",     // needs a real documented process
  comparison: "high",  // needs research into alternatives
};

/**
 * Answer types you can supply from your own operations versus ones needing outside
 * data. This is what separates a gap worth attacking from one you cannot fill: a
 * pricing gap is yours to close, an industry-survey gap is not.
 */
const FIRST_PARTY_TYPES: AnswerType[] = ["money", "duration", "steps", "boolean", "entity"];

const EFFORT_DIVISOR: Record<Effort, number> = { low: 1, medium: 1.4, high: 2 };

/**
 * Scores how worth attacking a gap is.
 *
 *   weakness = severity × demand × winnability × durability / effort
 *
 * Prevalence alone says how much of the field fails; it does not say whether you can
 * do anything about it. Winnability is what makes the ranking actionable rather than
 * merely true.
 */
export function scoreWeakness(input: WeaknessInput): WeaknessScore {
  const { question, predictions, self } = input;
  const answerType = classifyQuestion(question);
  const total = predictions.length;

  const answered = predictions.filter((p) => p.assessment.level === "answered");
  const lexical = predictions.filter((p) => p.assessment.level === "lexical");

  // Even an answered field is weak if its answers are thin, so severity blends
  // "how many answer" with "how specific the best answer is".
  const answerRate = total > 0 ? answered.length / total : 0;
  const bestSpecificity = answered.length > 0 ? Math.max(...answered.map((p) => p.factors.specificity)) : 0;
  const severity = total === 0 ? 0 : Math.min(1, (1 - answerRate) * 0.75 + (1 - bestSpecificity) * 0.25);

  const demand = Math.min(
    1,
    (input.inAutocomplete ? 0.6 : 0.2) + Math.min(0.4, (input.competitorHeadings ?? 0) * 0.1)
  );

  const alreadyCovered = self?.level === "answered";
  const canSupply = FIRST_PARTY_TYPES.includes(answerType);
  const winnability = alreadyCovered ? 0.1 : canSupply ? 1 : 0.5;

  // A fact you own does not expire the way a survey statistic does.
  const durability = canSupply ? 1 : 0.6;

  const effort = EFFORT_BY_TYPE[answerType];
  const score = Math.round(
    (severity * demand * winnability * durability * 100) / EFFORT_DIVISOR[effort]
  );

  const forcesHedge = total > 0 && answered.length === 0;
  // Prefer a passage that genuinely approaches the answer dimension. Falling back to
  // the best subject match produced misleading quotes — a framework glossary offered
  // as proof of a pricing gap.
  const realEvidence = lexical.find((p) => p.assessment.gapEvidence)?.assessment.gapEvidence ?? null;
  const evidence = realEvidence ?? lexical[0]?.assessment.passage ?? null;

  return {
    question,
    answerType,
    severity: Math.round(severity * 100) / 100,
    demand: Math.round(demand * 100) / 100,
    winnability,
    durability,
    effort,
    score,
    forcesHedge,
    alreadyCovered,
    evidence,
    evidenceIsReal: Boolean(realEvidence),
    rationale: rationaliseWeakness({ total, answered: answered.length, lexical: lexical.length, answerType, alreadyCovered, forcesHedge }),
  };
}

function rationaliseWeakness(o: {
  total: number;
  answered: number;
  lexical: number;
  answerType: AnswerType;
  alreadyCovered: boolean;
  forcesHedge: boolean;
}): string {
  const missing: Record<AnswerType, string> = {
    money: "states a figure",
    duration: "states a timeframe",
    count: "gives a number",
    steps: "lays out an ordered process",
    comparison: "directly contrasts the options",
    entity: "names anyone specific",
    boolean: "answers directly",
    definition: "defines it plainly",
  };

  if (o.total === 0) return "no predicted citations to assess";
  if (o.alreadyCovered) return "you already answer this — not a task";
  if (o.forcesHedge) {
    return o.lexical > 0
      ? `${o.lexical} of ${o.total} cited sources raise this but none ${missing[o.answerType]}`
      : `none of the ${o.total} cited sources address this at all`;
  }
  return `${o.answered} of ${o.total} cited sources answer; the rest do not`;
}

/** Ranks gaps most worth attacking first, dropping ones you already cover. */
export function rankWeaknesses(inputs: WeaknessInput[]): WeaknessScore[] {
  return inputs
    .map(scoreWeakness)
    .filter((w) => !w.alreadyCovered)
    .sort((a, b) => b.score - a.score);
}
