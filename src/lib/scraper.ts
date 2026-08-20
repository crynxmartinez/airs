import { extractEvidence, extractMeta, extractContent } from "@/lib/indicators";
import type { ScrapedEvidence, PageContent } from "@/lib/indicators";

export type { ScrapedEvidence };

export async function scrapePage(url: string): Promise<{
  evidence: ScrapedEvidence[];
  title: string;
  description: string;
  content: PageContent;
}> {
  const startTime = Date.now();

  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  const loadTime = Date.now() - startTime;

  const { title, description } = extractMeta(html);
  const evidence = extractEvidence({ html, url, loadTime });
  const content = extractContent({ html });

  return { evidence, title, description, content };
}
