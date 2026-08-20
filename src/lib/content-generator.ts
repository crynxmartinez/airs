import { searchTavily, type TavilyResult } from "@/lib/tavily";
import { query, queryOne, run } from "@/lib/db";
import type { GeneratedContent, ContentBrief, Evaluation } from "@/types";
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
 * Research a question using Tavily — runs 3-5 varied queries to gather
 * comprehensive data before writing.
 */
async function researchTopic(question: string, location?: string): Promise<ResearchData> {
  const queries = buildSearchQueries(question, location);
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

function buildSearchQueries(question: string, location?: string): string[] {
  const queries = [question];

  if (location) {
    queries.push(`${question} ${location}`);
  }

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

  return queries.slice(0, 5);
}

function selectStyle(answerType: string): "case_study" | "comparison" {
  if (answerType === "comparison") return "comparison";
  return "case_study";
}

function buildPrompt(
  question: string,
  style: "case_study" | "comparison",
  research: ResearchData,
  brief: ContentBrief,
  evaluation: Evaluation,
  coverageData: { score: number; competitorCount: number; totalCompetitors: number } | null
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

  const coverageBlock = coverageData
    ? `Coverage gap analysis:\n- Current score: ${coverageData.score}/100\n- ${coverageData.competitorCount} of ${coverageData.totalCompetitors} competitors answer this question\n- Your site does not adequately answer this question`
    : "No coverage data available.";

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

  if (style === "case_study") {
    return `You are an expert content writer and researcher. Write a 2000-3500 word case study article about: "${question}"

BUSINESS CONTEXT:
- Business: ${businessName} (${evaluation.digital_asset_url})
- Industry: ${evaluation.primary_query}
- Location: ${location || "not specified"}
- Target audience: ${audience}

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

  const question = brief.question;
  const location = evaluation.target_location || undefined;

  const research = await researchTopic(question, location);

  const style = selectStyle(brief.answer_type);
  const prompt = buildPrompt(question, style, research, brief, evaluation, coverage);

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
