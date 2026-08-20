import { NextRequest, NextResponse } from "next/server";
import { scrapePage } from "@/lib/scraper";
import { query } from "@/lib/db";
import type { Evidence } from "@/types";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: evaluationId } = await params;
  const { url } = await req.json();

  if (!url) {
    return NextResponse.json({ error: "url is required" }, { status: 400 });
  }

  try {
    const { evidence: myEvidence, title, description } = await scrapePage(url);

    // Get competitor evidence for comparison
    const competitorEvidence = await query<Evidence>(
      "SELECT * FROM evidence WHERE evaluation_id = ?",
      [evaluationId]
    );

    // Group competitor evidence by indicator_code
    const compByIndicator: Record<string, Evidence[]> = {};
    for (const ev of competitorEvidence) {
      const code = ev.indicator_code || "";
      if (!compByIndicator[code]) compByIndicator[code] = [];
      compByIndicator[code].push(ev);
    }

    // Compare my evidence against competitors
    const comparisons = myEvidence.map((myEv) => {
      const code = myEv.indicator_code || "";
      const compEvs = compByIndicator[code] || [];
      const compValues = compEvs.map((e) => e.value);
      const compObservations = compEvs.map((e) => e.observation);

      // For boolean indicators
      const compTrueCount = compValues.filter((v) => v === "true").length;
      const compTotal = compValues.length;
      const myValue = myEv.value;

      let status: "good" | "warning" | "gap";
      let detail = "";

      if (myValue === "true" || myValue === "false") {
        if (myValue === "true" && compTrueCount >= Math.ceil(compTotal * 0.8)) {
          status = "good";
          detail = `You have this — and so do ${compTrueCount} of ${compTotal} competitors. Table stakes met.`;
        } else if (myValue === "true" && compTrueCount < Math.ceil(compTotal * 0.5)) {
          status = "good";
          detail = `You have this — only ${compTrueCount} of ${compTotal} competitors do. You're ahead!`;
        } else if (myValue === "false" && compTrueCount >= Math.ceil(compTotal * 0.8)) {
          status = "gap";
          detail = `You're MISSING this — ${compTrueCount} of ${compTotal} competitors have it. This is table stakes. Fix it.`;
        } else if (myValue === "false" && compTrueCount > 0) {
          status = "warning";
          detail = `You don't have this — ${compTrueCount} of ${compTotal} competitors do. Consider adding it.`;
        } else {
          status = "good";
          detail = `Neither you nor most competitors have this. Low priority.`;
        }
      } else {
        // Numeric value — compare ranges
        const myNum = parseFloat(myValue || "0");
        const compNums = compValues.map((v) => parseFloat(v || "0")).filter((n) => !isNaN(n));
        const compAvg = compNums.length > 0 ? compNums.reduce((a, b) => a + b, 0) / compNums.length : 0;

        if (myNum >= compAvg * 1.1) {
          status = "good";
          detail = `Your value: ${myValue}. Competitor average: ${Math.round(compAvg)}. You're above average.`;
        } else if (myNum <= compAvg * 0.7) {
          status = "gap";
          detail = `Your value: ${myValue}. Competitor average: ${Math.round(compAvg)}. You're significantly below average.`;
        } else {
          status = "warning";
          detail = `Your value: ${myValue}. Competitor average: ${Math.round(compAvg)}. You're in range.`;
        }
      }

      return {
        indicator_code: code,
        category: myEv.category,
        observation: myEv.observation,
        status,
        detail,
        competitor_summary: compObservations.slice(0, 3),
      };
    });

    const gaps = comparisons.filter((c) => c.status === "gap");
    const warnings = comparisons.filter((c) => c.status === "warning");
    const goods = comparisons.filter((c) => c.status === "good");

    return NextResponse.json({
      url,
      title,
      description,
      total_checks: comparisons.length,
      gaps: gaps.length,
      warnings: warnings.length,
      goods: goods.length,
      comparisons,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Self-audit failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
