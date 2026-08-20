import { NextRequest, NextResponse } from "next/server";
import { query, queryOne, run, generateId } from "@/lib/db";
import { assessDocuments, COVERAGE_ENGINE_VERSION, type CoverageDocument } from "@/lib/coverage";
import { predictCitations, rankWeaknesses, type CandidatePage, type WeaknessInput } from "@/lib/citation";
import { parseRobotsForAiCrawlers, fetchRobotsTxt } from "@/lib/geo";
import { generateWeaknessFindings, MIN_PRIMARY_SET, PRIMARY_TYPES } from "@/lib/findings";
import { trimToBoundary } from "@/lib/prose";
import { generateRecommendations } from "@/lib/recommendations";
import { generateContentBriefs } from "@/lib/briefs";
import type { Evaluation } from "@/types";
import { hostOf } from "@/lib/url";

interface PageRow {
  competitor_id: string;
  ctype: string | null;
  site: string;
  url: string;
  title: string | null;
  sections: string | null;
  published_at: string | null;
  modified_at: string | null;
}

interface SubIntentRow {
  question: string;
  source: string;
}

/**
 * Full deterministic AIRS analysis for an evaluation.
 *
 * Runs the whole pipeline: sub-intents (demand) → heading-anchored retrieval
 * (supply) → citation prediction → weakness ranking. No model and no network calls
 * beyond an optional robots.txt check, so the same corpus always yields the same
 * findings and every score can be traced to the passage that produced it.
 *
 * Query params:
 *   limit=N        cap the questions analysed (default 12)
 *   robots=1       check whether each site blocks AI crawlers (slower, live fetch)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const evaluation = await queryOne<Evaluation>("SELECT * FROM evaluations WHERE id = ?", [id]);
  if (!evaluation) return NextResponse.json({ error: "Evaluation not found" }, { status: 404 });

  const limit = Math.min(50, Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "12", 10) || 12));
  // Crawlability is gate zero: a site AI crawlers cannot fetch is uncitable no matter how
  // good its content is. It used to be opt-in behind ?robots=1 and to cover competitors
  // only, never the client's own site — which is how this evaluation scored Clayton
  // Insurance Brokers 86/100 "gold" while their robots.txt blocks ClaudeBot, GPTBot,
  // Google-Extended and CCBot outright. On by default now; ?robots=0 skips the live fetch.
  const checkRobots = req.nextUrl.searchParams.get("robots") !== "0";

  const pages = await query<PageRow>(
    `SELECT p.competitor_id, c.competitor_type ctype, c.url site, p.url, p.title, p.sections,
            p.published_at, p.modified_at
     FROM page_content p JOIN competitors c ON c.id = p.competitor_id
     WHERE p.evaluation_id = ? AND p.sections IS NOT NULL`,
    [id]
  );
  if (pages.length === 0) {
    return NextResponse.json({ error: "No stored page content — crawl the competitors first" }, { status: 400 });
  }

  // Group pages per site, but keep each page a separate document.
  //
  // Concatenating a site's pages into one passage list is what produced the false
  // "answered" verdicts independent validation traced to 78% accuracy: subject scope
  // leaks across pages, so a price on an unrelated page satisfies this question and
  // the quoted evidence comes from a different page than the one being judged.
  // `assessDocuments` scores each page alone and reports which one answered — which
  // is also what a citation names.
  const sites = new Map<string, { row: PageRow; documents: CoverageDocument[]; latest: string | null }>();
  for (const p of pages) {
    const host = hostOf(p.site);
    const key = `${p.ctype === "self" ? "self:" : ""}${host}`;
    const entry = sites.get(key) ?? { row: p, documents: [], latest: null };

    const passages = [{ heading: p.title ?? "", text: "" }];
    try {
      for (const s of JSON.parse(p.sections ?? "[]") as { heading: string; text: string }[]) {
        passages.push({ heading: s.heading, text: s.text });
      }
    } catch (err) { console.error("[route.ts]", err); }
    entry.documents.push({ url: p.url, title: p.title, passages });

    const date = p.modified_at ?? p.published_at;
    if (date && (!entry.latest || date > entry.latest)) entry.latest = date;
    sites.set(key, entry);
  }

  // Registered competitors that produced no crawled page. Prevalence math already excludes
  // them — `total` counts observed evidence rows, not registered rivals — but a report
  // reading "8 of 8 competitors publish no pricing" implies the field is eight when ten were
  // found. Naming the unreachable ones keeps the denominator honest, and a competitor that
  // blocks crawlers is itself worth reporting: ausure.com.au returns 403 to everything.
  const unreachable = await query<{ url: string; ctype: string | null }>(
    `SELECT c.url, c.competitor_type ctype
       FROM competitors c
      WHERE c.evaluation_id = ?
        AND (c.competitor_type IS NULL OR c.competitor_type != 'self')
        AND NOT EXISTS (
          SELECT 1 FROM page_content p
           WHERE p.competitor_id = c.id AND p.evaluation_id = c.evaluation_id
        )`,
    [id]
  );

  const selfEntry = Array.from(sites.entries()).find(([k]) => k.startsWith("self:"))?.[1] ?? null;
  const allField = Array.from(sites.entries()).filter(([k]) => !k.startsWith("self:"));

  // Hosts an assistant actually retrieved for this project's queries.
  //
  // These bypass the intent gate below, and that is the point rather than an exception. The
  // gate exists to keep a commercial evaluation from being scored against documentation the
  // SERP happened to return — but a source the assistant *pulled into its answer* is
  // occupying the answer, whatever kind of page it is. An insurance-comparison blog that
  // states premiums is a competitor for the AI answer even though it sells nothing.
  //
  // Without this the gate discarded the AI-cited field wholesale: eight retrieved hosts were
  // registered unclassified, `PRIMARY_TYPES.has(null)` was false, and coverage went back to
  // scoring only the SERP set the citation capture was meant to replace.
  const citedHosts = new Set(
    (await query<{ url: string }>(
      `SELECT DISTINCT c.url
         FROM ai_citations c JOIN evaluations e ON e.project_id = c.project_id
        WHERE e.id = ?`,
      [id]
    ))
      .map((r) => hostOf(r.url))
      .filter(Boolean)
  );

  // Scope the field to contestable rivals, the same rule `generateFindings` already applies.
  // Coverage never did, so a transactional evaluation was scored against whatever the SERP
  // returned: on one reference evaluation, nine of ten competitors were stored as
  // `informational` and the resulting briefs told a services business to compete with
  // documentation pages. Both facts were already in the database; nothing read them.
  const primaryField = allField.filter(
    ([, entry]) =>
      citedHosts.has(hostOf(entry.row.site)) ||
      (entry.row.ctype !== null && PRIMARY_TYPES.has(entry.row.ctype))
  );
  const scoped = primaryField.length >= MIN_PRIMARY_SET;
  const fieldEntries = scoped ? primaryField : allField;

  // Too few contestable rivals is itself the finding, not a reason to quietly widen the set.
  // Falling back keeps the run useful, but the caller is told the field is the wrong shape
  // rather than left to infer it from odd-looking output.
  const intentMismatch =
    !scoped && allField.length > 0 && primaryField.length < allField.length
      ? {
          search_intent: evaluation.search_intent,
          contestable: primaryField.length,
          total: allField.length,
          message:
            `Only ${primaryField.length} of ${allField.length} competitors are contestable rivals; ` +
            `the rest are informational or reference pages. Findings below are scored against ` +
            `the full set and should be read as directional. Consider a more commercial query.`,
        }
      : null;

  // Optional live gate: a site that blocks AI crawlers cannot be cited at all.
  const crawlable = new Map<string, boolean>();
  let selfRobots: { allowed: string[]; blocked: string[]; hasRobotsTxt: boolean } | null = null;
  if (checkRobots) {
    await Promise.all(
      fieldEntries.map(async ([key, entry]) => {
        const robots = parseRobotsForAiCrawlers(await fetchRobotsTxt(entry.row.site));
        crawlable.set(key, robots.blocked.length === 0);
      })
    );

    // The client's own site — the omission that let a blocked site score gold.
    if (evaluation.digital_asset_url) {
      selfRobots = parseRobotsForAiCrawlers(await fetchRobotsTxt(evaluation.digital_asset_url));
    }
  }

  const candidates: CandidatePage[] = fieldEntries.map(([key, entry]) => ({
    id: key,
    label: hostOf(entry.row.site),
    url: entry.row.site,
    documents: entry.documents,
    lastModified: entry.latest,
    aiCrawlable: checkRobots ? crawlable.get(key) : undefined,
  }));

  // Question-shaped sub-intents first — those are what an assistant fans out into.
  // Order by strength of evidence, not alphabetically. The first run selected ten
  // question-shaped headings in alphabetical order and every one was boilerplate, while the
  // autocomplete-sourced queries — actual strings people type — went unanalysed.
  //
  // Four tiers, strongest first:
  //   manual         a question a human deliberately chose. Outranks everything: it is the
  //                  only source that encodes intent rather than inferring it.
  //   ai_fanout      a sub-query an assistant *actually issued* for this topic. Observed
  //                  decomposition; nothing else in the system is direct evidence of it.
  //   autocomplete   a string real people type. A good proxy for demand, not for fan-out.
  //   heading        what one competitor chose to write about. Weakest — it is their
  //                  content plan, not anyone's question.
  const subIntents = await query<SubIntentRow>(
    `SELECT question, source, COUNT(*) OVER (PARTITION BY question) freq
     FROM sub_intents WHERE evaluation_id = ?
     ORDER BY CASE
                WHEN source = 'manual' THEN 0
                WHEN source = 'ai_fanout' THEN 1
                WHEN source LIKE 'autocomplete%' THEN 2
                ELSE 3
              END,
              is_question DESC, LENGTH(question) DESC
     LIMIT ?`,
    [id, limit]
  );
  const questions = subIntents.length > 0 ? subIntents : [{ question: evaluation.primary_query, source: "primary_query" }];

  const headingCounts = new Map<string, number>();
  for (const s of await query<SubIntentRow>(
    "SELECT question, source FROM sub_intents WHERE evaluation_id = ? AND source = 'competitor_heading'",
    [id]
  )) {
    headingCounts.set(s.question, (headingCounts.get(s.question) ?? 0) + 1);
  }

  const perQuestion = questions.map((q) => {
    const predictions = predictCitations(q.question, candidates);
    const self = selfEntry ? assessDocuments(q.question, selfEntry.documents) : null;
    return { question: q.question, source: q.source, predictions, self };
  });

  const weaknessInputs: WeaknessInput[] = perQuestion.map((r) => ({
    question: r.question,
    // An observed fan-out query is stronger evidence of demand than an autocomplete
    // suggestion, so it must not score lower on the same axis.
    // Badly named by now: the flag means "someone actually asks this", and a hand-picked
    // question is the strongest such evidence there is.
    inAutocomplete:
      r.source.startsWith("autocomplete") || r.source === "ai_fanout" || r.source === "manual",
    competitorHeadings: headingCounts.get(r.question) ?? 0,
    predictions: r.predictions,
    self: r.self,
  }));

  const weaknesses = rankWeaknesses(weaknessInputs);

  // Persist coverage verdicts as a new run. Append, never replace: the previous code
  // deleted every prior verdict before writing, which made the "diffable week to week"
  // intent recorded in schema.sql impossible to satisfy — progress is a diff between
  // two runs, and there was only ever one.
  const runId = generateId();
  await run(
    `INSERT INTO coverage_runs (id, evaluation_id, questions, sites, engine_version, ran_at)
     VALUES (?, ?, ?, ?, ?, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))`,
    [runId, id, perQuestion.length, candidates.length, COVERAGE_ENGINE_VERSION]
  );

  for (const r of perQuestion) {
    for (const p of r.predictions) {
      await run(
        `INSERT OR REPLACE INTO coverage (id, evaluation_id, run_id, competitor_id, competitor_label, question, answer_type, level, score, term_coverage, subject_coverage, specificity, is_depth_gap, passage, heading, gap_evidence, source_url, source_title, scored_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))`,
        [
          generateId(),
          id,
          runId,
          p.id,
          p.label,
          r.question,
          p.assessment.answerType,
          p.assessment.level,
          p.assessment.score,
          p.assessment.termCoverage,
          p.assessment.subjectCoverage,
          p.assessment.specificity,
          p.assessment.isDepthGap ? 1 : 0,
          p.assessment.passage ? trimToBoundary(p.assessment.passage, 500) : null,
          p.assessment.heading,
          p.assessment.gapEvidence ? trimToBoundary(p.assessment.gapEvidence, 500) : null,
          p.assessment.sourceUrl ?? null,
          p.assessment.sourceTitle ?? null,
        ]
      );
    }
    // Also persist self assessment if present
    if (r.self) {
      await run(
        `INSERT OR REPLACE INTO coverage (id, evaluation_id, run_id, competitor_id, competitor_label, question, answer_type, level, score, term_coverage, subject_coverage, specificity, is_depth_gap, passage, heading, gap_evidence, source_url, source_title, scored_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS'))`,
        [
          generateId(),
          id,
          runId,
          "self",
          "Self",
          r.question,
          r.self.answerType,
          r.self.level,
          r.self.score,
          r.self.termCoverage,
          r.self.subjectCoverage,
          r.self.specificity,
          r.self.isDepthGap ? 1 : 0,
          r.self.passage ? trimToBoundary(r.self.passage, 500) : null,
          r.self.heading,
          r.self.gapEvidence ? trimToBoundary(r.self.gapEvidence, 500) : null,
          r.self.sourceUrl ?? null,
          r.self.sourceTitle ?? null,
        ]
      );
    }
  }

  // Write weakness-based findings and regenerate recommendations so the full
  // pipeline flows: analysis → findings → recommendations → missions.
  //
  // Each stage is named so a failure reports where it happened. This route runs five
  // sequential stages over a whole corpus; an unlabelled 500 gives no way to tell a
  // crawl problem from a persistence problem, and the coverage rows are already
  // committed by this point so the run is not simply retryable.
  let stage = "findings";
  let weaknessFindings, allRecommendations, briefs;
  try {
    weaknessFindings = await generateWeaknessFindings(id, weaknesses);
    stage = "recommendations";
    allRecommendations = await generateRecommendations(id);
    stage = "briefs";
    briefs = await generateContentBriefs(id, weaknesses);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[analysis] ${stage} failed for evaluation ${id}:`, error);
    return NextResponse.json(
      {
        error: `Analysis failed while generating ${stage}: ${message}`,
        stage,
        // The coverage run is durable, so progress still has a comparable snapshot
        // even though the derived artefacts are missing.
        run_id: runId,
        coverage_written: true,
      },
      { status: 500 }
    );
  }

  return NextResponse.json({
    evaluation_id: id,
    run_id: runId,
    engine_version: COVERAGE_ENGINE_VERSION,
    corpus: {
      sites: candidates.length,
      pages: pages.length,
      self_crawled: Boolean(selfEntry),
      // The denominator every prevalence claim is actually computed over.
      competitors_observed: candidates.length,
      competitors_unreachable: unreachable.length,
      unreachable: unreachable.map((u) => u.url),
      scoped_to_contestable: scoped,
      excluded_as_non_contestable: scoped ? allField.length - primaryField.length : 0,
      // Sources in the field because an assistant retrieved them, not because they ranked.
      ai_retrieved_in_field: allField.filter(([, e]) => citedHosts.has(hostOf(e.row.site))).length,
      serp_only_in_field: allField.filter(([, e]) => !citedHosts.has(hostOf(e.row.site))).length,
      // Hosts the assistant retrieved that are not in the field at all — every one is a
      // source shaping the answer that this analysis has not looked at.
      ai_retrieved_not_analysed: Array.from(citedHosts).filter(
        (h) => !allField.some(([, e]) => hostOf(e.row.site) === h) && h !== hostOf(evaluation.digital_asset_url)
      ).length,
    },
    intent_mismatch: intentMismatch,
    questions_analysed: perQuestion.length,
    robots_checked: checkRobots,
    // Gate zero, reported before anything else in the response the export reads. When this
    // is non-null nothing downstream can help: the content is invisible to the assistants
    // being optimised for, and the fix is a robots.txt edit, not a content programme.
    ai_crawlability: selfRobots
      ? {
          blocked_crawlers: selfRobots.blocked,
          allowed_crawlers: selfRobots.allowed,
          has_robots_txt: selfRobots.hasRobotsTxt,
          disqualified: selfRobots.blocked.length > 0,
          message:
            selfRobots.blocked.length > 0
              ? `This site blocks ${selfRobots.blocked.join(", ")} in robots.txt. ` +
                `No content it publishes can be cited by those assistants, whatever its quality. ` +
                `Every finding below is contingent on lifting these rules first.`
              : null,
        }
      : null,
    competitors_blocking_ai: Array.from(crawlable.entries())
      .filter(([, ok]) => ok === false)
      .map(([key]) => key.replace(/^self:/, "")),
    findings_generated: weaknessFindings.length,
    recommendations_generated: allRecommendations.length,
    briefs_generated: briefs.length,
    weaknesses: weaknesses.map((w) => ({
      question: w.question,
      answer_type: w.answerType,
      score: w.score,
      severity: w.severity,
      demand: w.demand,
      winnability: w.winnability,
      effort: w.effort,
      forces_hedge: w.forcesHedge,
      why: w.rationale,
      evidence: w.evidence?.slice(0, 240) ?? null,
      evidence_is_real: w.evidenceIsReal,
    })),
    predicted_citations: perQuestion.map((r) => ({
      question: r.question,
      you: r.self ? { level: r.self.level, specificity: r.self.specificity } : null,
      top: r.predictions.slice(0, 3).map((p) => ({
        site: p.label,
        score: p.score,
        level: p.assessment.level,
        specificity: p.assessment.specificity,
        why: p.reason,
      })),
    })),
  });
}

