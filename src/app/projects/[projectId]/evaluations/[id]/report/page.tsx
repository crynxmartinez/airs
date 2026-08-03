"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Printer, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { Evaluation, Competitor, Evidence, Finding, Recommendation, DimensionScore } from "@/types";

interface ReportData {
  evaluation: Evaluation;
  competitors: Competitor[];
  evidence: Evidence[];
  findings: Finding[];
  recommendations: Recommendation[];
  scores: (DimensionScore & { competitor_name: string | null })[];
}

const dimLabels: Record<string, string> = {
  intent: "Intent Alignment", content: "Content Excellence", trust: "Trust & Authority",
  ux: "User Experience", technical: "Technical Excellence", competitive: "Competitive Position",
  ecosystem: "Ecosystem Presence",
};

const legacyMap: Record<string, string> = {
  D1: "intent", D2: "content", D3: "trust", D4: "ux", D5: "technical", D6: "competitive", D7: "ecosystem",
};

function normalizeDimCode(code: string | null): string {
  if (!code) return "";
  return legacyMap[code] || code;
}

const dimKeys = ["intent", "content", "trust", "ux", "technical", "competitive", "ecosystem"];

export default function ReportPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const evalId = params.id as string;
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/evaluations/${evalId}/report`).then((r) => r.json()).then((d) => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [evalId]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (!data) return <p className="text-slate-500">Report not found</p>;

  const { evaluation: ev, competitors, evidence, findings, recommendations: recs, scores } = data;
  const critical = findings.filter((f) => f.impact_level === "high");
  const moderate = findings.filter((f) => f.impact_level === "medium");

  return (
    <div className="mx-auto max-w-3xl space-y-8 print:max-w-none">
      {/* Action bar (hidden in print) */}
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/projects/${projectId}/evaluations/${evalId}`}>
          <Button variant="outline"><ArrowLeft className="h-4 w-4" />Back</Button>
        </Link>
        <Button onClick={() => window.print()}><Printer className="h-4 w-4" />Print / Save PDF</Button>
      </div>

      {/* Report header */}
      <div className="border-b-2 border-slate-800 pb-4">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">AIRS Evaluation Report</p>
        <h1 className="mt-1 text-3xl font-bold text-slate-900">{ev.primary_query}</h1>
        <p className="mt-2 text-sm text-slate-500">
          Generated {new Date().toLocaleDateString()} · {competitors.length} competitors analyzed · {evidence.length} evidence items
        </p>
      </div>

      {/* Executive Summary */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">1. Executive Summary</h2>
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Overall RRS</p>
            <p className="text-2xl font-bold">{ev.rrs_score ?? "—"}/100</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Rating</p>
            <p className="text-2xl font-bold capitalize">{ev.rating ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Confidence</p>
            <p className="text-2xl font-bold">{ev.confidence_score ?? "—"}</p>
          </div>
        </div>
        <div className="mt-4 space-y-1 text-sm text-slate-600">
          <p>• {critical.length} critical findings, {moderate.length} moderate findings</p>
          <p>• {recs.length} recommendations generated</p>
          <p>• {competitors.length} competitors analyzed across 7 dimensions</p>
        </div>
      </section>

      {/* Evaluation Scope */}
      <section>
        <h2 className="mb-3 text-lg font-bold text-slate-900">2. Evaluation Scope</h2>
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr><td className="py-2 font-medium text-slate-500">Primary Query</td><td className="py-2">{ev.primary_query}</td></tr>
            <tr><td className="py-2 font-medium text-slate-500">Search Intent</td><td className="py-2 capitalize">{ev.search_intent}</td></tr>
            <tr><td className="py-2 font-medium text-slate-500">Digital Asset</td><td className="py-2">{ev.digital_asset_url}</td></tr>
            {ev.target_audience && <tr><td className="py-2 font-medium text-slate-500">Target Audience</td><td className="py-2">{ev.target_audience}</td></tr>}
            <tr><td className="py-2 font-medium text-slate-500">Competitors</td><td className="py-2">{competitors.map((c) => c.competitor_name || c.url).join(", ")}</td></tr>
          </tbody>
        </table>
      </section>

      {/* Score Summary */}
      {scores.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900">3. Score Summary</h2>
          <table className="w-full text-sm border border-slate-200">
            <thead><tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
              <th className="px-3 py-2">Competitor</th>
              {dimKeys.map(d => <th key={d} className="px-3 py-2">{dimLabels[d]}</th>)}
              <th className="px-3 py-2">Total</th>
            </tr></thead>
            <tbody>
              {competitors.map((comp) => {
                const cs = scores.filter((s) => s.competitor_id === comp.id);
                return (
                  <tr key={comp.id} className="border-b border-slate-100">
                    <td className="px-3 py-2 font-medium">{comp.competitor_name || comp.url}</td>
                    {dimKeys.map(dim => <td key={dim} className="px-3 py-2">{cs.find(s => normalizeDimCode(s.dimension_code) === dim)?.score ?? "—"}</td>)}
                    <td className="px-3 py-2 font-bold">{comp.score ?? "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900">4. Findings</h2>
          <div className="space-y-2">
            {findings.map((f) => (
              <div key={f.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{dimLabels[normalizeDimCode(f.dimension_code)] || f.dimension_code || "General"}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${f.impact_level === "high" ? "bg-red-100 text-red-700" : f.impact_level === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>{f.impact_level}</span>
                  <span className="text-xs text-slate-400 capitalize">{f.type}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{f.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold text-slate-900">5. Recommendations</h2>
          <div className="space-y-2">
            {recs.map((rec, i) => (
              <div key={rec.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-800">{i + 1}.</span>
                  <p className="text-sm font-medium text-slate-800">{rec.title}</p>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${rec.priority === "high" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{rec.priority}</span>
                </div>
                {rec.description && <p className="mt-1 text-sm text-slate-600">{rec.description}</p>}
                {rec.expected_impact && <p className="mt-1 text-xs font-medium text-green-600">Expected: {rec.expected_impact.replace(/\bD[1-7]\b/g, (m) => dimLabels[legacyMap[m]] || m)}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Footer */}
      <div className="border-t border-slate-200 pt-4 text-center text-xs text-slate-400">
        <p>AIRS CRM Evaluation Report · {new Date().toLocaleDateString()}</p>
      </div>
    </div>
  );
}
