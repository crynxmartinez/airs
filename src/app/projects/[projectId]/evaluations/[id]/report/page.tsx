"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ReportShell, ReportSection } from "@/components/report-shell";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip,
} from "recharts";
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

  const radarData = dimKeys.map((dim) => {
    const ds = scores.filter((s) => normalizeDimCode(s.dimension_code) === dim);
    const avg = ds.length > 0 ? Math.round(ds.reduce((a, s) => a + s.score, 0) / ds.length) : 0;
    return { dimension: dimLabels[dim], score: avg };
  });

  const dimAvgs = dimKeys.map((dim) => {
    const ds = scores.filter((s) => normalizeDimCode(s.dimension_code) === dim);
    const avg = ds.length > 0 ? Math.round(ds.reduce((a, s) => a + s.score, 0) / ds.length) : 0;
    return { key: dim, label: dimLabels[dim], avg };
  });
  const weakestDims = dimAvgs.filter((d) => d.avg < 60).sort((a, b) => a.avg - b.avg);
  const strongestDims = dimAvgs.filter((d) => d.avg >= 75).sort((a, b) => b.avg - a.avg);
  const topCompetitor = [...competitors].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const bottomCompetitor = [...competitors].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  const opportunityFindings = findings.filter((f) => f.type === "opportunity" || f.type === "weakness");
  const standardFindings = findings.filter((f) => f.type === "gap" || f.type === "standard");

  const host = (() => {
    try {
      return new URL(ev.digital_asset_url.startsWith("http") ? ev.digital_asset_url : `https://${ev.digital_asset_url}`).hostname.replace("www.", "");
    } catch {
      return ev.digital_asset_url;
    }
  })();

  return (
    <ReportShell
      kind="AI Search Visibility Evaluation"
      subject={ev.primary_query}
      backHref={`/projects/${projectId}/evaluations/${evalId}`}
      backLabel="Back to evaluation"
      fileStem={`AIRS Evaluation — ${ev.primary_query}`}
      facts={[
        { label: "Your site", value: host },
        { label: "Market", value: ev.target_location || "All regions" },
        { label: "Intent", value: ev.search_intent },
        { label: "Competitors", value: String(competitors.length) },
        { label: "Evidence items", value: String(evidence.length) },
        { label: "Field RRS", value: ev.rrs_score != null ? `${ev.rrs_score}/100` : "—" },
      ]}
    >
      {/* The deliverable itself. `src/lib/export.ts` renders the Markdown that gets sent to a
          client; until now the only way to trigger it was curl, which meant the actual product
          was unreachable from the app that produces it. Markdown rather than PDF on purpose —
          an agency needs to drop its own logo on this. */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 print:hidden">
        <span className="text-sm font-medium text-slate-700">Download deliverable:</span>
        <a
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700"
          href={`/api/evaluations/${evalId}/export?tier=1&download=1`}
        >
          Tier 1 — Snapshot
        </a>
        <a
          className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-900 hover:bg-slate-100"
          href={`/api/evaluations/${evalId}/export?tier=2&download=1`}
        >
          Tier 2 — Asset Package
        </a>
        <span className="text-xs text-slate-500">Unbranded Markdown</span>
      </div>

      {/* Executive Summary */}
      <ReportSection title="Executive Summary">
        <div className="grid grid-cols-3 gap-4">
          <div className="report-block rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Overall RRS</p>
            <p className="text-2xl font-bold">{ev.rrs_score ?? "—"}/100</p>
          </div>
          <div className="report-block rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Rating</p>
            <p className="text-2xl font-bold capitalize">{ev.rating ?? "—"}</p>
          </div>
          <div className="report-block rounded-lg border border-slate-200 p-4">
            <p className="text-xs text-slate-500">Confidence</p>
            <p className="text-2xl font-bold">{ev.confidence_score ?? "—"}</p>
          </div>
        </div>
        <div className="mt-4 space-y-2 text-sm text-slate-600">
          {topCompetitor && (
            <p>
              <strong>{topCompetitor.competitor_name || topCompetitor.url}</strong> is the top performer
              with a score of <strong>{topCompetitor.score}/100</strong>
              {bottomCompetitor && bottomCompetitor.id !== topCompetitor.id && (
                <>, while <strong>{bottomCompetitor.competitor_name || bottomCompetitor.url}</strong> is the weakest at <strong>{bottomCompetitor.score}/100</strong>.</>
              )}
              .
            </p>
          )}
          {weakestDims.length > 0 && (
            <p><strong>Needs work:</strong> {weakestDims.map((d) => `${d.label} (${d.avg}/100)`).join(", ")}</p>
          )}
          {strongestDims.length > 0 && (
            <p><strong>Doing well:</strong> {strongestDims.map((d) => `${d.label} (${d.avg}/100)`).join(", ")}</p>
          )}
          {opportunityFindings.length > 0 ? (
            <p>
              <strong className="text-blue-600">{opportunityFindings.length} opportunit{opportunityFindings.length > 1 ? "ies" : "y"}</strong> found
              {critical.length > 0 && <> — {critical.length} with high impact</>}
              {" "}— gaps most of this field shares. See recommendations below.
            </p>
          ) : standardFindings.length > 0 && (
            <p>
              <strong>No majority weakness found</strong> — this field has no gap that most competitors share.
              {standardFindings.length} table-stakes item{standardFindings.length > 1 ? "s" : ""} remain to reach parity.
            </p>
          )}
          {recs.length > 0 && (
            <p><strong>{recs.length} recommendation{recs.length > 1 ? "s" : ""}</strong> available to improve your scores.</p>
          )}
        </div>
      </ReportSection>

      {/* Evaluation Scope */}
      <ReportSection title="Evaluation Scope">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-slate-100">
            <tr><td className="py-2 font-medium text-slate-500">Primary Query</td><td className="py-2">{ev.primary_query}</td></tr>
            <tr><td className="py-2 font-medium text-slate-500">Search Intent</td><td className="py-2 capitalize">{ev.search_intent}</td></tr>
            <tr><td className="py-2 font-medium text-slate-500">Digital Asset</td><td className="py-2">{ev.digital_asset_url}</td></tr>
            {ev.target_audience && <tr><td className="py-2 font-medium text-slate-500">Target Audience</td><td className="py-2">{ev.target_audience}</td></tr>}
            <tr><td className="py-2 font-medium text-slate-500">Competitors</td><td className="py-2">{competitors.map((c) => c.competitor_name || c.url).join(", ")}</td></tr>
          </tbody>
        </table>
      </ReportSection>

      {/* Dimension Scores Radar */}
      {scores.length > 0 && (
        <ReportSection title="Dimension Scores (Avg)">
          <p className="mb-3 text-sm text-slate-500">Average scores across all competitors by dimension</p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: "#64748b" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Radar dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </ReportSection>
      )}

      {/* Score Summary */}
      {scores.length > 0 && (
        <ReportSection title="Score Summary">
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
        </ReportSection>
      )}

      {/* Findings */}
      {findings.length > 0 && (
        <ReportSection title="Findings">
          <div className="space-y-2">
            {findings.map((f) => (
              <div key={f.id} className="report-block rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{dimLabels[normalizeDimCode(f.dimension_code)] || f.dimension_code || "General"}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${f.impact_level === "high" ? "bg-red-100 text-red-700" : f.impact_level === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>{f.impact_level}</span>
                  <span className="text-xs text-slate-400 capitalize">{f.type}</span>
                </div>
                <p className="mt-1 text-sm text-slate-700">{f.description}</p>
              </div>
            ))}
          </div>
        </ReportSection>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <ReportSection title="Recommendations">
          <div className="space-y-2">
            {recs.map((rec, i) => (
              <div key={rec.id} className="report-block rounded-lg border border-slate-200 p-3">
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
        </ReportSection>
      )}

    </ReportShell>
  );
}
