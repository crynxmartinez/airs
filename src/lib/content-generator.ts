import { searchTavily, type TavilyResult } from "@/lib/tavily";
import { query, queryOne, run } from "@/lib/db";
import type { GeneratedContent, ContentBrief, Evaluation, MissionTask } from "@/types";
import { generatePdf } from "@/lib/pdf-generator";

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-opus-5";
const MAX_TOKENS = 16000;

interface ResearchData {
  facts: string[];
  sources: { title: string; url: string; snippet: string }[];
  statistics: string[];
}

/**
 * Research a question using Tavily — runs gap-aware queries based on what
 * competitors already cover vs what's missing, plus generic baseline queries.
 */
async function researchTopic(
  question: string,
  location?: string,
  taskContext?: TaskContext | null
): Promise<ResearchData> {
  const queries = buildGapAwareQueries(question, location, taskContext);
  const allResults: TavilyResult[] = [];
  const seenUrls = new Set<string>();

  for (const q of queries) {
    try {
      const response = await searchTavily(q, {
        maxResults: 5,
        searchDepth: "advanced",
        includeAnswer: true,
      });
      for (const r of response.results) {
        if (!seenUrls.has(r.url)) {
          seenUrls.add(r.url);
          allResults.push(r);
        }
      }
    } catch (err) {
      console.error("[content-generator] Tavily search failed for:", q, err);
    }
  }

  const sources = allResults.slice(0, 15).map((r) => ({
    title: r.title,
    url: r.url,
    snippet: r.content.substring(0, 500),
  }));

  const facts = allResults
    .map((r) => r.content)
    .filter((c) => c.length > 50)
    .slice(0, 10)
    .map((c) => c.substring(0, 300));

  const statistics = allResults
    .map((r) => r.content)
    .flatMap((c) => c.match(/\d+[%$]\s?\d+|\$\d[\d,.]*\s?(million|billion)?|\d{2,4}%/gi) || [])
    .slice(0, 10);

  return { facts, sources, statistics };
}

/**
 * Build gap-aware search queries. Analyzes what competitors already cover
 * (from their passages and headings) and generates targeted queries for
 * the aspects they DON'T cover well — the actual gaps to fill.
 */
function buildGapAwareQueries(
  question: string,
  location?: string,
  taskContext?: TaskContext | null
): string[] {
  const queries: string[] = [];

  // 1. Always include the core question
  queries.push(question);
  if (location) {
    queries.push(`${question} ${location}`);
  }

  // 2. If we have coverage gap data, build targeted queries for what's missing
  if (taskContext && taskContext.coverageGaps.length > 0) {
    // Extract topics competitors already cover well (from their headings)
    const coveredTopics = new Set<string>();
    for (const gap of taskContext.coverageGaps) {
      if (gap.heading && gap.score >= 60) {
        coveredTopics.add(gap.heading.toLowerCase().trim());
      }
    }

    // Extract keywords from competitor passages to understand landscape
    const competitorKeywords = new Set<string>();
    for (const gap of taskContext.coverageGaps) {
      if (gap.passage) {
        const words = gap.passage.toLowerCase()
          .replace(/[^a-z0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length > 4 && !STOP_WORDS.has(w));
        for (const w of words.slice(0, 5)) {
          competitorKeywords.add(w);
        }
      }
    }

    // Check what aspects are NOT well covered by competitors
    // Low score or low specificity = gap opportunity
    const weakAreas = taskContext.coverageGaps.filter(
      (g) => g.score < 50 || g.specificity < 0.4
    );

    if (weakAreas.length > 0) {
      // Research the weak areas — what competitors don't cover well
      const weakHeadings = weakAreas
        .map((g) => g.heading)
        .filter((h): h is string => h !== null && h.length > 3);
      for (const heading of weakHeadings.slice(0, 2)) {
        queries.push(`${question} ${heading}`);
      }
    }

    // If competitors have low term coverage, research deeper/more specific angles
    const lowTermCoverage = taskContext.coverageGaps.some((g) => g.termCoverage < 0.5);
    if (lowTermCoverage) {
      queries.push(`${question} detailed guide specifics`);
    }

    // If this is a depth gap, research for more depth
    const depthGaps = taskContext.coverageGaps.filter((g) => g.level === "depth_gap" || g.level === "thin");
    if (depthGaps.length > 0) {
      queries.push(`${question} in-depth analysis data statistics`);
    }
  }

  // 3. Add question-type-specific queries (cost, comparison, how-to, etc.)
  const lower = question.toLowerCase();
  if (lower.includes("cost") || lower.includes("price") || lower.includes("how much")) {
    queries.push(`${question} average cost 2025 2026`);
    queries.push(`${question} pricing comparison`);
  } else if (lower.includes("vs") || lower.includes("compare") || lower.includes("difference")) {
    queries.push(`${question} comparison`);
    queries.push(`${question} pros and cons`);
  } else if (lower.includes("how to") || lower.includes("guide")) {
    queries.push(`${question} step by step`);
    queries.push(`${question} best practices`);
  } else {
    queries.push(`${question} examples`);
    queries.push(`${question} case study`);
  }

  // 4. Add data/research queries for authority content
  queries.push(`${question} statistics data research`);

  return queries.slice(0, 7);
}

const STOP_WORDS = new Set([
  "the", "and", "for", "are", "but", "not", "you", "all", "can", "had",
  "her", "was", "one", "our", "out", "day", "get", "has", "him", "his",
  "how", "man", "new", "now", "old", "see", "two", "way", "who", "boy",
  "did", "its", "let", "put", "say", "she", "too", "use", "with", "that",
  "this", "have", "from", "they", "know", "want", "been", "good", "much",
  "some", "time", "very", "just", "your", "what", "about", "which", "when",
  "there", "their", "would", "could", "also", "more", "such", "only", "most",
]);

function selectStyle(answerType: string): "case_study" | "comparison" {
  if (answerType === "comparison") return "comparison";
  return "case_study";
}

function buildTaskBlock(taskContext: TaskContext | null): string {
  if (!taskContext) return "";

  const { task, yourScore, gapEvidence } = taskContext;
  const lines: string[] = [];

  lines.push("MISSION TASK — WHAT THIS CONTENT MUST ADDRESS:");
  lines.push(`- Task: ${task.title}`);
  if (task.description) {
    lines.push(`- Task description: ${task.description}`);
  }
  lines.push(`- Task source: ${task.source.replace(/_/g, " ")}`);
  lines.push(`- Priority score: ${task.priority_score}`);

  if (yourScore > 0) {
    lines.push(`- Your site's current coverage score for this question: ${yourScore}/100`);
  }

  if (gapEvidence) {
    lines.push(`- Gap evidence: ${gapEvidence}`);
  }

  lines.push("");
  lines.push("This content must directly fill the gap identified above. The article should answer the question");
  lines.push("more thoroughly than competitors currently do, using the competitor passages below as a benchmark");
  lines.push("for what already exists — your content must be better, more specific, more data-driven.");

  return lines.join("\n");
}

function buildCoverageBlock(
  coverageData: { score: number; competitorCount: number; totalCompetitors: number } | null,
  taskContext: TaskContext | null
): string {
  if (!coverageData && !taskContext) return "No coverage data available.";

  const lines: string[] = [];

  if (coverageData) {
    lines.push("COVERAGE GAP ANALYSIS:");
    lines.push(`- Your site's coverage score: ${coverageData.score}/100`);
    lines.push(`- ${coverageData.competitorCount} of ${coverageData.totalCompetitors} competitors already answer this question`);
    lines.push("- Your site does NOT adequately answer this question — this is the gap to fill");
  }

  if (taskContext && taskContext.coverageGaps.length > 0) {
    lines.push("");
    lines.push("COMPETITOR COVERAGE — what competitors already say (your content must be better than this):");
    for (const gap of taskContext.coverageGaps) {
      lines.push("");
      lines.push(`  ${gap.competitorLabel} (score: ${gap.score}/100, level: ${gap.level}):`);
      if (gap.heading) lines.push(`    Heading used: "${gap.heading}"`);
      if (gap.passage) lines.push(`    Passage: "${gap.passage.substring(0, 300)}"`);
      if (gap.sourceUrl) lines.push(`    Source: ${gap.sourceUrl}`);
      lines.push(`    Term coverage: ${Math.round(gap.termCoverage * 100)}%, Specificity: ${Math.round(gap.specificity * 100)}%`);
    }
  }

  return lines.join("\n");
}

interface CoverageGapDetail {
  competitorLabel: string;
  score: number;
  level: string;
  passage: string | null;
  heading: string | null;
  sourceUrl: string | null;
  sourceTitle: string | null;
  termCoverage: number;
  specificity: number;
}

interface TaskContext {
  task: MissionTask;
  coverageGaps: CoverageGapDetail[];
  yourScore: number;
  gapEvidence: string | null;
}

function buildPrompt(
  question: string,
  style: "case_study" | "comparison",
  research: ResearchData,
  brief: ContentBrief,
  evaluation: Evaluation,
  coverageData: { score: number; competitorCount: number; totalCompetitors: number } | null,
  taskContext: TaskContext | null
): string {
  const businessName = evaluation.digital_asset_url
    ? evaluation.digital_asset_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")
    : "your business";
  const location = evaluation.target_location || "";
  const audience = evaluation.target_audience || "potential customers";

  const researchBlock = research.sources
    .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${s.snippet}`)
    .join("\n\n");

  const factsBlock = research.facts.map((f) => `- ${f}`).join("\n");

  const statsBlock = research.statistics.length > 0
    ? research.statistics.map((s) => `- ${s}`).join("\n")
    : "No specific statistics found — use general industry knowledge.";

  const competitorBlock = brief.evidence
    ? `Competitor intelligence:\n${brief.evidence}`
    : "No specific competitor data available.";

  const coverageBlock = buildCoverageBlock(coverageData, taskContext);

  const baseRequirements = `
CONTENT REQUIREMENTS:
1. Write 2000-3500 words — comprehensive, data-driven, informative
2. Lead with a 40-60 word direct answer to "${question}" (for AI extraction by ChatGPT/Perplexity)
3. Cite at least 3-5 real sources from the research data above using (Source Name, URL) format
4. Naturally reference ${businessName} (${evaluation.digital_asset_url}) at least 2 times within the flow — as the subject, expert source, or example. Not forced, but contextual
5. Include specific data points, statistics, and real examples from the research
6. Use clear H2/H3 headings (markdown format)
7. End with a "Key Takeaways" section with 5-7 bullet points
8. End with a "Sources" section listing all cited sources with URLs
9. Tone: professional, authoritative, data-driven, trustworthy
10. Target audience: ${audience}
${location ? `11. Where relevant, include context for ${location}` : ""}

FORMAT SPECIFICATIONS:
- Required format: ${brief.required_format || "standard article"}
- Extractability notes: ${brief.extractability_notes || "none"}
- Target heading: ${brief.target_heading || question}
`;

  const taskBlock = buildTaskBlock(taskContext);

  if (style === "case_study") {
    return `You are an expert content writer and researcher. Write a 2000-3500 word case study article about: "${question}"

BUSINESS CONTEXT:
- Business: ${businessName} (${evaluation.digital_asset_url})
- Industry: ${evaluation.primary_query}
- Location: ${location || "not specified"}
- Target audience: ${audience}

${taskBlock}

RESEARCH DATA (from live web search — use these real sources):
${researchBlock}

KEY FACTS GATHERED:
${factsBlock}

STATISTICS AND DATA POINTS:
${statsBlock}

${competitorBlock}

${coverageBlock}

${baseRequirements}

CASE STUDY STRUCTURE:
- Executive Summary (100 words)
- Background & Context
- The Challenge (the problem this question addresses)
- The Approach (how ${businessName} addresses this — use as the case study subject)
- Results & Data (cite real numbers from research)
- Lessons Learned
- Key Takeaways (5-7 bullets)
- Sources (list all with URLs)

Write the full article now in markdown format:`;
  } else {
    return `You are an expert content writer and researcher. Write a 2000-3500 word comparison article about: "${question}"

BUSINESS CONTEXT:
- Business: ${businessName} (${evaluation.digital_asset_url})
- Industry: ${evaluation.primary_query}
- Location: ${location || "not specified"}
- Target audience: ${audience}

${taskBlock}

RESEARCH DATA (from live web search — use these real sources):
${researchBlock}

KEY FACTS GATHERED:
${factsBlock}

STATISTICS AND DATA POINTS:
${statsBlock}

${competitorBlock}

${coverageBlock}

${baseRequirements}

COMPARISON STRUCTURE:
- Introduction (100 words)
- Comparison Table (markdown table, side-by-side)
- Detailed Analysis of each option (H2 for each)
- Pros & Cons (for each option)
- "Which Is Right for You?" (feature ${businessName} as the recommended choice where appropriate)
- Key Takeaways (5-7 bullets)
- Sources (list all with URLs)

Write the full article now in markdown format:`;
  }
}

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set — cannot generate content");
  }

  const response = await fetch(CLAUDE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Claude API failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.content?.[0]?.text;
  if (!content) {
    throw new Error("Claude returned empty content");
  }

  return content;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function extractSources(content: string): { title: string; url: string }[] {
  const sources: { title: string; url: string }[] = [];
  const urlRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = urlRegex.exec(content)) !== null) {
    sources.push({ title: m![1], url: m![2] });
  }

  const plainUrlRegex = /(https?:\/\/[^\s)]+)/g;
  let pm: RegExpExecArray | null;
  while ((pm = plainUrlRegex.exec(content)) !== null) {
    const url = pm![1];
    if (!sources.find((s) => s.url === url)) {
      sources.push({ title: url, url });
    }
  }

  return sources;
}

function countSelfCitations(content: string, domain: string): number {
  const cleanDomain = domain.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
  const regex = new RegExp(cleanDomain.replace(/\./g, "\\."), "gi");
  const matches = content.match(regex);
  return matches ? matches.length : 0;
}

/**
 * Full content generation pipeline: research → write → store → generate PDF.
 */
export async function generateContent(
  taskId: string,
  briefId: string,
  evaluationId: string,
  projectId: string
): Promise<GeneratedContent> {
  const brief = await queryOne<ContentBrief>(
    "SELECT * FROM content_briefs WHERE id = ?",
    [briefId]
  );
  if (!brief) throw new Error("Content brief not found");

  const evaluation = await queryOne<Evaluation>(
    "SELECT * FROM evaluations WHERE id = ?",
    [evaluationId]
  );
  if (!evaluation) throw new Error("Evaluation not found");

  const coverageData = await queryOne<{ score: number; competitor_count: number; total: number }>(
    `SELECT c.score, COUNT(DISTINCT c.competitor_id) as competitor_count, COUNT(*) as total
     FROM coverage c
     WHERE c.evaluation_id = ? AND c.question = ?
     GROUP BY c.question
     ORDER BY c.score DESC LIMIT 1`,
    [evaluationId, brief.question]
  );

  const coverage = coverageData
    ? {
        score: coverageData.score,
        competitorCount: coverageData.competitor_count,
        totalCompetitors: coverageData.total,
      }
    : null;

  // Load the mission task for this brief
  const task = await queryOne<MissionTask>(
    "SELECT * FROM mission_tasks WHERE content_brief_id = ? ORDER BY priority_score DESC LIMIT 1",
    [briefId]
  );

  // Load detailed coverage gap data — what competitors say about this question
  const coverageGaps = await query<CoverageGapDetail>(
    `SELECT c.competitor_label, c.score, c.level, c.passage, c.heading,
            c.source_url, c.source_title, c.term_coverage, c.specificity
     FROM coverage c
     WHERE c.evaluation_id = ? AND c.question = ?
       AND c.run_id = (SELECT id FROM coverage_runs WHERE evaluation_id = ? ORDER BY ran_at DESC LIMIT 1)
     ORDER BY c.score DESC LIMIT 5`,
    [evaluationId, brief.question, evaluationId]
  );

  // Get the user's own coverage score for this question (if it exists)
  const yourCoverage = await queryOne<{ score: number }>(
    `SELECT c.score FROM coverage c
     WHERE c.evaluation_id = ? AND c.question = ?
       AND c.competitor_label = 'Your Site'
     ORDER BY c.score DESC LIMIT 1`,
    [evaluationId, brief.question]
  );

  const taskContext: TaskContext | null = task
    ? {
        task,
        coverageGaps,
        yourScore: yourCoverage?.score ?? coverage?.score ?? 0,
        gapEvidence: brief.evidence,
      }
    : null;

  const question = brief.question;
  const location = evaluation.target_location || undefined;

  const research = await researchTopic(question, location, taskContext);

  const style = selectStyle(brief.answer_type);
  const prompt = buildPrompt(question, style, research, brief, evaluation, coverage, taskContext);

  const content = await callClaude(prompt);

  const wordCount = countWords(content);
  const sources = extractSources(content);
  const selfCitations = evaluation.digital_asset_url
    ? countSelfCitations(content, evaluation.digital_asset_url)
    : 0;

  const generatedAt = new Date().toISOString().replace("T", " ").substring(0, 19);

  await run(
    "UPDATE content_briefs SET draft_content = ?, draft_generated = ?, status = 'in_progress' WHERE id = ?",
    [content, content, briefId]
  );

  const pdfBuffer = await generatePdf(content, {
    title: brief.target_heading || brief.question,
    businessName: evaluation.digital_asset_url?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") || "AIRS",
    date: generatedAt,
  });

  await run(
    "UPDATE mission_tasks SET status = 'in_progress' WHERE content_brief_id = ? AND mission_id IN (SELECT id FROM missions WHERE evaluation_id = ?)",
    [briefId, evaluationId]
  );

  return {
    content,
    wordCount,
    style,
    sources,
    selfCitations,
    generatedAt,
  };
}
