/**
 * Brief formatting — the pure half of brief generation.
 *
 * Split from `briefs.ts` so it can be unit-tested. `briefs.ts` reaches the database, which
 * makes it unloadable under `node --test`; this module has no side effects and no `@/`
 * imports, so the heading logic — the part that ships text a client publishes verbatim —
 * is directly testable.
 *
 * Relative imports rather than the "@/" alias for the same reason: Node resolves them
 * without a path-mapping loader.
 */

import { subjectTerms, tokenize, type AnswerType } from "./coverage.ts";
import { isQuestionLike } from "./demand.ts";

interface BriefSpec {
  requiredFormat: string;
  extractabilityNotes: string;
  /** Fill-in scaffold. Receives the resolved heading, subject phrase, and currency symbol. */
  draftTemplate: (ctx: DraftContext) => string;
}

interface DraftContext {
  heading: string;
  subject: string;
  currency: string;
}

export const BRIEF_SPECS: Record<AnswerType, BriefSpec> = {
  money: {
    requiredFormat:
      "Currency figure with symbol or spelled-out amount. Ranges accepted. Per-unit pricing (per hour, per project, per month) preferred.",
    extractabilityNotes:
      "The price must appear in the body text, not just in a table or image. Place it under the heading in a self-contained sentence. Avoid 'contact us for pricing' - that is a hedge, not an answer.",
    draftTemplate: ({ heading, subject, currency }) =>
      [
        `## ${heading}`,
        "",
        `Our ${subject} starts at ${currency}[YOUR PRICE] for the standard package. Most engagements range from ${currency}[LOW] to ${currency}[HIGH], depending on scope.`,
        "",
        "### Pricing tiers",
        "",
        `- **Starter** - ${currency}[PRICE] - [what is included]`,
        `- **Professional** - ${currency}[PRICE] - [what is included]`,
        `- **Enterprise** - ${currency}[PRICE] - [what is included]`,
        "",
        "*Replace the bracketed figures with your actual pricing.*",
      ].join("\n"),
  },
  duration: {
    requiredFormat:
      "Concrete timeframe with unit: '2-3 weeks', 'within 5 business days', '60-90 minutes'. Word-number ranges accepted.",
    extractabilityNotes:
      "State the timeframe in the first sentence under the heading. If phases exist, list them with durations. Avoid 'it depends' without a range - that is a hedge.",
    draftTemplate: ({ heading, subject }) =>
      [
        `## ${heading}`,
        "",
        `A typical ${subject} takes [X] to [Y] weeks from start to finish.`,
        "",
        "### Timeline breakdown",
        "",
        "1. **Discovery and planning** - [X] days",
        "2. **[Phase 2]** - [X] days",
        "3. **Delivery and review** - [X] days",
        "",
        "*Replace the bracketed timeframes with your actual schedule.*",
      ].join("\n"),
  },
  count: {
    requiredFormat: "A bare number with context: '15 team members', '200+ projects delivered', '3 locations'.",
    extractabilityNotes:
      "The number must appear in a self-contained sentence. 'Over 200 projects' is quotable; 'many projects' is not.",
    draftTemplate: ({ heading, subject }) =>
      [
        `## ${heading}`,
        "",
        `We have [NUMBER] ${subject}.`,
        "",
        "*Replace the bracketed number with your actual figure.*",
      ].join("\n"),
  },
  steps: {
    requiredFormat:
      "Ordered list with explicit step markers: 'Step 1', '1.', or sequential markers (first, then, finally). Each step should be a self-contained action.",
    extractabilityNotes:
      "Use an ordered list or explicit step numbering. Each step must be a complete sentence. Add HowTo schema for machine readability.",
    draftTemplate: ({ heading }) =>
      [
        `## ${heading}`,
        "",
        "1. **Step 1: [Action]** - [What happens and why]",
        "2. **Step 2: [Action]** - [Description]",
        "3. **Step 3: [Action]** - [Description]",
        "4. **Step 4: [Action]** - [Description]",
        "",
        "*Replace the bracketed steps with your actual process.*",
      ].join("\n"),
  },
  comparison: {
    requiredFormat:
      "Explicit comparison language: 'versus', 'compared to', 'whereas', 'on the other hand'. A table with criteria is ideal.",
    extractabilityNotes:
      "Use explicit contrast markers. A comparison table is highly extractable. Be honest about tradeoffs - credibility beats marketing.",
    draftTemplate: ({ heading }) =>
      [
        `## ${heading}`,
        "",
        "| Criterion | Option A | Option B |",
        "|---|---|---|",
        "| Cost | [A] | [B] |",
        "| Speed | [A] | [B] |",
        "| Best for | [A] | [B] |",
        "",
        "**Bottom line:** [Option A] is better for [use case], while [Option B] suits [use case].",
        "",
        "*Replace the bracketed content with your actual comparison.*",
      ].join("\n"),
  },
  entity: {
    requiredFormat: "A named entity: person name, company name, or place. Must appear in the body, not just in metadata.",
    extractabilityNotes:
      "Name the entity in a self-contained sentence under the heading. 'Jane Doe leads our design team' is quotable; 'our team' is not.",
    draftTemplate: ({ heading }) =>
      [
        `## ${heading}`,
        "",
        "[Named entity - person, company, or place that answers this question.]",
        "",
        "*Replace with the actual name and relevant details.*",
      ].join("\n"),
  },
  boolean: {
    requiredFormat: "Direct polarity answer: 'Yes - [explanation]' or 'No, [explanation]'. The answer must be the first word.",
    extractabilityNotes:
      "Start with Yes or No. Elaborate after. 'Yes, you need a permit for...' is quotable; 'It depends on whether you need a permit' is not.",
    draftTemplate: ({ heading }) =>
      [
        `## ${heading}`,
        "",
        "**[Yes/No]** - [One-sentence explanation].",
        "",
        "[Optional: 2-3 sentences of context.]",
        "",
        "*Replace with your actual answer.*",
      ].join("\n"),
  },
  definition: {
    requiredFormat: "Definition pattern: '[Term] is a [category] that [purpose]' or '[Term] refers to [meaning]'.",
    extractabilityNotes:
      "The definition must be the first sentence. 'A content brief is a document that...' is quotable; 'content briefs are useful' is not.",
    draftTemplate: ({ heading, subject }) =>
      [
        `## ${heading}`,
        "",
        `${subject} is [a/the] [category] that [purpose].`,
        "",
        "[Optional: 2-3 sentences of elaboration.]",
        "",
        "*Replace with your actual definition.*",
      ].join("\n"),
  },
};

/**
 * The heading a brief tells you to publish.
 *
 * Prefer the sub-intent verbatim. It came from autocomplete or a competitor heading, so it is
 * a string people actually type - and a question-shaped heading matching a real query is the
 * entire retrieval thesis. Rewriting it into house style loses the match.
 *
 * This replaces a 20-step `.replace()` chain that stripped the interrogative and rebuilt a
 * heading around the remainder. It was order-dependent and wrong on real input: three of four
 * money briefs shipped as "How much does how much to learn full stack web development cost?"
 * and "How much does commercial insurance agents make in california cost?" - the prefix
 * survived the strip and was wrapped a second time.
 */
export function buildHeading(question: string, answerType: AnswerType): string {
  const cleaned = question.replace(/\s+/g, " ").trim().replace(/\?+$/, "");
  if (!cleaned) return "Untitled";

  if (isQuestionLike(cleaned)) {
    return `${cleaned.charAt(0).toUpperCase()}${cleaned.slice(1)}?`;
  }

  // Not question-shaped - usually the raw primary query standing in as a sub-intent.
  // Synthesize a heading rather than publishing a bare keyword as one.
  const subject = subjectPhrase(cleaned) || cleaned;
  const synthesized: Record<AnswerType, string> = {
    money: `How much does ${subject} cost?`,
    duration: `How long does ${subject} take?`,
    count: `How many ${subject} do you have?`,
    steps: `How to ${subject}`,
    comparison: `${subject}: which should you choose?`,
    entity: `Who provides ${subject}?`,
    boolean: `Do you need ${subject}?`,
    definition: `What is ${subject}?`,
  };
  const heading = synthesized[answerType];
  return `${heading.charAt(0).toUpperCase()}${heading.slice(1)}`;
}

/**
 * The question's subject, in the words the asker used.
 *
 * `subjectTerms` returns *stemmed* tokens ("commerci", "insur") - correct for matching and
 * unreadable in a heading. So it decides which words qualify while the original spelling is
 * kept. The span runs from the first qualifying word to the last, so interior function words
 * survive: "business insurance in australia", not "business insurance australia".
 */
export function subjectPhrase(question: string): string {
  const subjects = new Set(subjectTerms(question));
  if (subjects.size === 0) return "";

  const words = question.replace(/\?/g, "").split(/\s+/).filter(Boolean);
  const qualifies = words.map((w) => tokenize(w).some((t) => subjects.has(t)));

  const first = qualifies.indexOf(true);
  if (first < 0) return "";
  const last = qualifies.lastIndexOf(true);

  return words
    .slice(first, last + 1)
    .join(" ")
    .replace(/^(the|a|an|your|my|our)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Currency for the market being evaluated.
 *
 * The money templates hardcoded pesos, so an Australian broker was told to publish peso
 * pricing. Resolved from the same region ladder the competitor search uses - explicit target
 * location, then the asset TLD - so the brief and the search agree on the market.
 */
export function currencyForRegion(region: string): string {
  const byRegion: Record<string, string> = {
    "au-en": "A$",
    "nz-en": "NZ$",
    "uk-en": "£",
    "ca-en": "C$",
    "ph-en": "₱",
    "us-en": "$",
    "ie-en": "€",
    "de-de": "€",
    "fr-fr": "€",
    "es-es": "€",
    "it-it": "€",
    "in-en": "₹",
    "sg-en": "S$",
    "za-en": "R",
  };
  // A neutral placeholder rather than a guess: naming the wrong currency in a pricing
  // instruction is worse than asking the user to name their own.
  return byRegion[region] ?? "[CURRENCY]";
}
