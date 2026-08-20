/**
 * Closing the loop: did shipping the brief actually close the gap?
 *
 * `content_briefs.status` has always supported `pending → drafted → shipped → verified`, and
 * nothing in the codebase ever set `verified`. The UI could mark a brief shipped and that was
 * the end of it — the system found gaps, told you what to write, and then never checked.
 *
 * The point of doing it this way: **the definition of done is byte-identical to the definition
 * of the gap.** The same `assessDocuments` that decided the field was silent on a question
 * decides whether your new page answers it. No human judgement, no separate rubric, and the
 * verdict is re-runnable next month against the same engine — which is what makes a
 * month-over-month diff real signal rather than drift.
 *
 * The citation half of the loop (did an assistant actually quote it?) stays blocked on AI
 * capture. This half needs nothing but a crawl.
 */

import { query, queryOne, run } from "@/lib/db";
import { assessDocuments, type CoverageDocument } from "@/lib/coverage";
import { crawlCompetitor } from "@/lib/crawler";

export interface VerificationResult {
  briefId: string;
  question: string;
  url: string;
  /** Verdict before shipping, from the brief's originating analysis. */
  before: string | null;
  after: "answered" | "lexical" | "none";
  specificityBefore: number | null;
  specificityAfter: number;
  status: "verified" | "shipped";
  /** The passage that satisfied the answer, when one did. */
  passage: string | null;
  /** Why it did not verify, in words a non-technical reader can act on. */
  reason: string | null;
}

const REQUIRED_SHAPE: Record<string, string> = {
  money: "a figure",
  duration: "a timeframe",
  count: "a number",
  steps: "an ordered process",
  comparison: "a direct contrast",
  entity: "a named entity",
  boolean: "a yes or no",
  definition: "a plain definition",
};

/**
 * Re-crawl the shipped URL and re-run coverage for the brief's question.
 *
 * `answered` promotes the brief to `verified`. Anything less holds it at `shipped` with the
 * reason — publishing a page that discusses the topic without committing to an answer is the
 * common failure, and saying so is more useful than a pass/fail.
 */
export async function verifyShippedBrief(briefId: string, url: string): Promise<VerificationResult> {
  const brief = await queryOne<{
    id: string;
    evaluation_id: string;
    question: string;
    answer_type: string;
    status: string;
  }>("SELECT id, evaluation_id, question, answer_type, status FROM content_briefs WHERE id = ?", [briefId]);

  if (!brief) throw new Error(`Brief ${briefId} not found`);

  // The verdict this brief was created from, so the result is a before/after rather than a
  // bare score. Self rows are keyed "self" by the analysis endpoint.
  const before = await queryOne<{ level: string; specificity: number }>(
    `SELECT level, specificity FROM coverage
      WHERE evaluation_id = ? AND question = ? AND competitor_id = 'self'
      ORDER BY scored_at DESC LIMIT 1`,
    [brief.evaluation_id, brief.question]
  );

  const crawl = await crawlCompetitor(url);
  const documents: CoverageDocument[] = crawl.content.map((page) => ({
    url: page.url,
    title: page.title,
    passages: [
      { heading: page.title ?? "", text: "" },
      ...(page.sections ?? []).map((s) => ({ heading: s.heading, text: s.text })),
    ],
  }));

  if (documents.length === 0) {
    return {
      briefId,
      question: brief.question,
      url,
      before: before?.level ?? null,
      after: "none",
      specificityBefore: before?.specificity ?? null,
      specificityAfter: 0,
      status: "shipped",
      passage: null,
      reason: `Could not read ${url}. Check the page is published and reachable.`,
    };
  }

  const assessment = assessDocuments(brief.question, documents);
  const verified = assessment.level === "answered";
  const shape = REQUIRED_SHAPE[brief.answer_type] ?? "a direct answer";

  const reason = verified
    ? null
    : assessment.level === "lexical"
      ? `The page discusses this but does not state ${shape}. That is still a hedge — a reader ` +
        `and a retriever both leave without the answer.`
      : `The page does not address this question. Check the heading matches the question and ` +
        `the answer sits in body text, not only in a table or image.`;

  await run("UPDATE content_briefs SET status = ? WHERE id = ?", [verified ? "verified" : "shipped", briefId]);

  // Record the before/after on the outcome so the attribution chain — gap found, brief
  // shipped, verdict flipped — can be shown without recomputing it.
  const outcome = await queryOne<{ id: string }>(
    "SELECT id FROM outcomes WHERE content_brief_id = ? ORDER BY created_at DESC LIMIT 1",
    [briefId]
  );
  if (outcome) {
    await run(
      `UPDATE outcomes
          SET verdict_before = ?, verdict_after = ?,
              specificity_before = ?, specificity_after = ?, measured_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')
        WHERE id = ?`,
      [
        before?.level ?? null,
        assessment.level,
        before?.specificity ?? null,
        assessment.specificity,
        outcome.id,
      ]
    );
  }

  return {
    briefId,
    question: brief.question,
    url,
    before: before?.level ?? null,
    after: assessment.level,
    specificityBefore: before?.specificity ?? null,
    specificityAfter: assessment.specificity,
    status: verified ? "verified" : "shipped",
    passage: verified ? assessment.passage : null,
    reason,
  };
}

/** Every brief for an evaluation that has been shipped, for a batch re-check. */
export async function shippedBriefs(evaluationId: string): Promise<{ id: string; question: string }[]> {
  return await query<{ id: string; question: string }>(
    "SELECT id, question FROM content_briefs WHERE evaluation_id = ? AND status IN ('shipped', 'verified')",
    [evaluationId]
  );
}
