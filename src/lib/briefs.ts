import { query, queryOne, run, generateId } from "@/lib/db";
import type { WeaknessScore } from "@/lib/citation";
import { resolveRegion } from "@/lib/search";
import {
  BRIEF_SPECS,
  buildHeading,
  currencyForRegion,
  subjectPhrase,
} from "@/lib/brief-format";

interface BriefRow {
  id: string;
  evaluation_id: string;
  question: string;
  answer_type: string;
  weakness_score: number;
  severity: number;
  demand: number;
  winnability: number;
  effort: string;
  rationale: string;
  evidence: string | null;
  target_heading: string | null;
  required_format: string | null;
  extractability_notes: string | null;
  draft_content: string | null;
  draft_generated: string | null;
  status: string;
  created_at: string;
}


/**
 * Generates and persists content briefs from ranked weaknesses.
 *
 * Each brief tells the user exactly what to write: the target question, the required
 * answer type, the evidence format, extractability requirements, and a draft template
 * they can fill in. The draft is a scaffold, not a finished page — the user replaces
 * bracketed placeholders with their own data.
 *
 * Upserts rather than replaces. The previous implementation opened with
 * `DELETE FROM content_briefs WHERE evaluation_id = ?`, which had two consequences.
 * It discarded the `status` lifecycle the user drives from the UI — every "shipped"
 * and "verified" mark, and any edited draft, was destroyed on each analysis run. And
 * once an `outcomes` row referenced a brief, the delete failed outright on a foreign
 * key with no ON DELETE clause, taking the whole analysis endpoint down with it.
 *
 * So: computed fields are refreshed, user state is preserved, and a brief is only
 * removed when its question has left the weakness set *and* nobody has acted on it.
 */
export async function generateContentBriefs(evaluationId: string, weaknesses: WeaknessScore[]): Promise<BriefRow[]> {
  const existing = new Map(
    (await query<BriefRow>("SELECT * FROM content_briefs WHERE evaluation_id = ?", [evaluationId])).map(
      (b) => [b.question, b] as const
    )
  );

  // Pricing guidance is denominated in the market being evaluated, not a hardcoded default.
  const market = await queryOne<{ target_location: string | null; digital_asset_url: string | null }>(
    "SELECT target_location, digital_asset_url FROM evaluations WHERE id = ?",
    [evaluationId]
  );
  const currency = currencyForRegion(
    resolveRegion(market?.target_location, market?.digital_asset_url)
  );

  const briefs: BriefRow[] = [];
  const stillWeak = new Set<string>();

  for (const w of weaknesses) {
    if (w.alreadyCovered) continue;

    const spec = BRIEF_SPECS[w.answerType];
    if (!spec) continue;

    stillWeak.add(w.question);

    const prior = existing.get(w.question);
    const targetHeading = buildHeading(w.question, w.answerType);
    const subject = subjectPhrase(w.question) || "this service";
    const template = spec.draftTemplate({ heading: targetHeading, subject, currency });
    const evidence = w.evidence?.slice(0, 500) ?? null;

    // An edit is provable only against the text we actually generated. Comparing to the
    // *current* template was wrong: changing the template made every existing draft look
    // edited, so stale drafts — malformed headings, the wrong currency — could never be
    // refreshed. Rows predating this column have no baseline, so fall back to status: an
    // untouched `pending` brief is safe to regenerate, anything acted on is preserved.
    const userEdited = prior?.draft_generated
      ? prior.draft_content !== prior.draft_generated
      : Boolean(prior && prior.status !== "pending");
    const draftContent = userEdited && prior?.draft_content ? prior.draft_content : template;
    const status = prior?.status ?? "pending";
    const id = prior?.id ?? generateId();

    if (prior) {
      await run(
        `UPDATE content_briefs
            SET answer_type = ?, weakness_score = ?, severity = ?, demand = ?, winnability = ?,
                effort = ?, rationale = ?, evidence = ?, target_heading = ?, required_format = ?,
                extractability_notes = ?, draft_content = ?, draft_generated = ?
          WHERE id = ?`,
        [
          w.answerType,
          w.score,
          w.severity,
          w.demand,
          w.winnability,
          w.effort,
          w.rationale,
          evidence,
          targetHeading,
          spec.requiredFormat,
          spec.extractabilityNotes,
          draftContent,
          template,
          id,
        ]
      );
    } else {
      await run(
        `INSERT INTO content_briefs (id, evaluation_id, question, answer_type, weakness_score, severity, demand, winnability, effort, rationale, evidence, target_heading, required_format, extractability_notes, draft_content, draft_generated, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))`,
        [
          id,
          evaluationId,
          w.question,
          w.answerType,
          w.score,
          w.severity,
          w.demand,
          w.winnability,
          w.effort,
          w.rationale,
          evidence,
          targetHeading,
          spec.requiredFormat,
          spec.extractabilityNotes,
          draftContent,
          template,
        ]
      );
    }

    briefs.push({
      id,
      evaluation_id: evaluationId,
      question: w.question,
      answer_type: w.answerType,
      weakness_score: w.score,
      severity: w.severity,
      demand: w.demand,
      winnability: w.winnability,
      effort: w.effort,
      rationale: w.rationale,
      evidence,
      target_heading: targetHeading,
      required_format: spec.requiredFormat,
      extractability_notes: spec.extractabilityNotes,
      draft_content: draftContent,
      draft_generated: template,
      status,
      created_at: prior?.created_at ?? new Date().toISOString(),
    });
  }

  retireStaleBriefs(existing, stillWeak);
  return briefs;
}

/**
 * Drops briefs whose question is no longer a weakness.
 *
 * Two things are never deleted. A brief the user has moved past `pending` is a record
 * of work done, and the gap closing is precisely why its question left the weakness
 * set — deleting it would erase the evidence that the system worked. And a brief an
 * `outcomes` row points at cannot be deleted at all: that foreign key has no ON DELETE
 * clause, so the attempt fails and aborts the caller.
 */
async function retireStaleBriefs(existing: Map<string, BriefRow>, stillWeak: Set<string>): Promise<void> {
  for (const [question, brief] of existing) {
    if (stillWeak.has(question)) continue;
    if (brief.status !== "pending") continue;
    await run(
      `DELETE FROM content_briefs
        WHERE id = ? AND NOT EXISTS (SELECT 1 FROM outcomes WHERE content_brief_id = ?)`,
      [brief.id, brief.id]
    );
  }
}

export async function getContentBriefs(evaluationId: string): Promise<BriefRow[]> {
  return await query<BriefRow>(
    "SELECT * FROM content_briefs WHERE evaluation_id = ? ORDER BY weakness_score DESC",
    [evaluationId]
  );
}
