import { query, run, generateId } from "@/lib/db";
import { computeCitationShare } from "@/lib/ai-capture";

interface OutcomeRow {
  id: string;
  project_id: string;
  content_brief_id: string | null;
  question: string;
  shipped_at: string | null;
  citation_before: number;
  citation_after: number;
  measured_at: string | null;
  created_at: string;
}

interface BriefRow {
  id: string;
  evaluation_id: string;
  question: string;
  answer_type: string;
  weakness_score: number;
  status: string;
}

/**
 * Marks a content brief as shipped and records the current citation state.
 *
 * This is the "before" snapshot. After the user ships content based on the brief,
 * they re-run the AI capture to see if their site gained a citation for that
 * question. The outcome loop closes when citation_after > citation_before.
 */
export async function markBriefShipped(briefId: string, projectId: string): Promise<OutcomeRow> {
  const brief = (await query<BriefRow>(
    "SELECT * FROM content_briefs WHERE id = ?",
    [briefId]
  ))[0];

  if (!brief) {
    throw new Error("Content brief not found");
  }

  // Check if there's already an outcome for this brief
  const existing = (await query<OutcomeRow>(
    "SELECT * FROM outcomes WHERE content_brief_id = ?",
    [briefId]
  ))[0];

  if (existing) {
    // Update shipped_at if not already set
    if (!existing.shipped_at) {
      await run(
        "UPDATE outcomes SET shipped_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?",
        [existing.id]
      );
      existing.shipped_at = new Date().toISOString();
    }
    return existing;
  }

  // Record current citation state as "before"
  const share = await computeCitationShare(projectId);
  const citationBefore = share.citedQueries;

  const id = generateId();
  await run(
    `INSERT INTO outcomes (id, project_id, content_brief_id, question, shipped_at, citation_before, citation_after, measured_at, created_at)
     VALUES (?, ?, ?, ?, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'), ?, 0, NULL, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))`,
    [id, projectId, briefId, brief.question, citationBefore]
  );

  // Update brief status to 'shipped'
  await run("UPDATE content_briefs SET status = 'shipped' WHERE id = ?", [briefId]);

  return {
    id,
    project_id: projectId,
    content_brief_id: briefId,
    question: brief.question,
    shipped_at: new Date().toISOString(),
    citation_before: citationBefore,
    citation_after: 0,
    measured_at: null,
    created_at: new Date().toISOString(),
  };
}

/**
 * Measures the outcome after re-running AI capture.
 *
 * Compares current citation state against the "before" snapshot taken when the
 * brief was marked shipped. If citation_after > citation_before, the content
 * change worked.
 */
export async function measureOutcome(outcomeId: string): Promise<OutcomeRow> {
  const outcome = (await query<OutcomeRow>(
    "SELECT * FROM outcomes WHERE id = ?",
    [outcomeId]
  ))[0];

  if (!outcome) {
    throw new Error("Outcome not found");
  }

  const share = await computeCitationShare(outcome.project_id);
  const citationAfter = share.citedQueries;

  await run(
    "UPDATE outcomes SET citation_after = ?, measured_at = to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS') WHERE id = ?",
    [citationAfter, outcomeId]
  );

  // If citation increased, mark brief as verified
  if (citationAfter > outcome.citation_before) {
    await run("UPDATE content_briefs SET status = 'verified' WHERE id = ?", [outcome.content_brief_id]);
  }

  return {
    ...outcome,
    citation_after: citationAfter,
    measured_at: new Date().toISOString(),
  };
}

/**
 * Gets all outcomes for a project, showing the full loop:
 * which weaknesses were shipped, and whether citations were gained.
 */
export async function getOutcomes(projectId: string): Promise<(OutcomeRow & {
  brief_status: string;
  answer_type: string;
  weakness_score: number;
  delta: number;
})[]> {
  const rows = await query<OutcomeRow & {
    brief_status: string;
    answer_type: string;
    weakness_score: number;
  }>(
    `SELECT o.*, cb.status as brief_status, cb.answer_type, cb.weakness_score
     FROM outcomes o
     LEFT JOIN content_briefs cb ON o.content_brief_id = cb.id
     WHERE o.project_id = ?
     ORDER BY o.created_at DESC`,
    [projectId]
  );

  return rows.map((r) => ({
    ...r,
    delta: r.citation_after - r.citation_before,
  }));
}

/**
 * Summary stats for the outcome loop.
 */
export async function getOutcomeSummary(projectId: string): Promise<{
  totalShipped: number;
  totalVerified: number;
  totalGained: number;
  avgTimeToMeasure: number | null;
}> {
  const outcomes = await query<{ shipped_at: string; measured_at: string | null; citation_before: number; citation_after: number }>(
    "SELECT shipped_at, measured_at, citation_before, citation_after FROM outcomes WHERE project_id = ?",
    [projectId]
  );

  if (outcomes.length === 0) {
    return { totalShipped: 0, totalVerified: 0, totalGained: 0, avgTimeToMeasure: null };
  }

  const shipped = outcomes.filter((o) => o.shipped_at);
  const verified = outcomes.filter((o) => o.measured_at && o.citation_after > o.citation_before);
  const gained = outcomes.reduce((sum, o) => sum + Math.max(0, o.citation_after - o.citation_before), 0);

  const measuredTimes = outcomes
    .filter((o) => o.shipped_at && o.measured_at)
    .map((o) => new Date(o.measured_at!).getTime() - new Date(o.shipped_at).getTime());

  const avgTimeToMeasure = measuredTimes.length > 0
    ? Math.round(measuredTimes.reduce((a, b) => a + b, 0) / measuredTimes.length / (1000 * 60 * 60 * 24))
    : null;

  return {
    totalShipped: shipped.length,
    totalVerified: verified.length,
    totalGained: gained,
    avgTimeToMeasure,
  };
}
