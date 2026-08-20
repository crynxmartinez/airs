/**
 * Google Gemini adapter — uses google_search grounding to find web sources.
 *
 * Free tier: 5,000 search-grounded prompts/month (requires billing setup, no charge).
 * Requires GEMINI_API_KEY in environment. Get one at https://aistudio.google.com/apikey
 *
 * Uses the generateContent endpoint with the google_search tool, which returns
 * grounding metadata containing source URLs — the same pattern as Claude's citations.
 */

export interface GeminiCitation {
  url: string;
  title: string;
}

export interface GeminiSearchResult {
  query: string;
  answer_text: string;
  citations: GeminiCitation[];
}

const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta";

export async function searchGemini(
  query: string,
  options?: { model?: string }
): Promise<GeminiSearchResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set — get one at https://aistudio.google.com/apikey");
  }

  const model = options?.model ?? "gemini-2.0-flash";

  const response = await fetch(
    `${GEMINI_API_BASE}/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [{ text: query }],
          },
        ],
        tools: [{ google_search: {} }],
      }),
      signal: AbortSignal.timeout(30000),
    }
  );

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gemini API failed: ${response.status} ${text}`);
  }

  const data = await response.json();

  // Extract answer text
  const answerText =
    data?.candidates?.[0]?.content?.parts
      ?.filter((p: { text?: string }) => p.text)
      .map((p: { text?: string }) => p.text)
      .join("") ?? "";

  // Extract grounding chunks (source URLs)
  const groundingChunks =
    data?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [];

  const seenUrls = new Set<string>();
  const citations: GeminiCitation[] = [];
  for (const chunk of groundingChunks) {
    const uri = chunk?.web?.uri;
    const title = chunk?.web?.title ?? "";
    if (uri && !seenUrls.has(uri)) {
      seenUrls.add(uri);
      citations.push({ url: uri, title });
    }
  }

  return {
    query,
    answer_text: answerText,
    citations,
  };
}
