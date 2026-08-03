"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Globe, AlertCircle, Loader2,
  RefreshCw, FileText, AlertTriangle, CheckCircle2,
  Lightbulb, ChevronDown, ChevronRight, Target, Trash2,
} from "lucide-react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip,
} from "recharts";
import type { Evaluation, Competitor, Evidence, Finding, Recommendation, DimensionScore } from "@/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface EvaluationDetail extends Evaluation {
  competitors: Competitor[];
  evidence: Evidence[];
}

interface ScoreRow extends DimensionScore {
  competitor_name: string | null;
}

const dimLabels: Record<string, string> = {
  intent: "Intent Alignment", content: "Content Excellence", trust: "Trust & Authority",
  ux: "User Experience", technical: "Technical Excellence", competitive: "Competitive Position",
  ecosystem: "Ecosystem Presence",
  D1: "Intent Alignment", D2: "Content Excellence", D3: "Trust & Authority",
  D4: "User Experience", D5: "Technical Excellence", D6: "Competitive Position", D7: "Ecosystem Presence",
};

const dimKeys = ["intent", "content", "trust", "ux", "technical", "competitive", "ecosystem"];

const legacyMap: Record<string, string> = {
  D1: "intent", D2: "content", D3: "trust", D4: "ux", D5: "technical", D6: "competitive", D7: "ecosystem",
};

function normalizeDimCode(code: string | null): string {
  if (!code) return "";
  return legacyMap[code] || code;
}

const catLabels: Record<string, string> = {
  structural: "Structural", content: "Content", trust: "Trust",
  ux: "UX", technical: "Technical", competitive: "Competitive", ecosystem: "Ecosystem",
};

const ratingColors: Record<string, string> = {
  platinum: "bg-purple-100 text-purple-700 border-purple-200",
  gold: "bg-yellow-100 text-yellow-700 border-yellow-200",
  silver: "bg-slate-100 text-slate-700 border-slate-200",
  bronze: "bg-orange-100 text-orange-700 border-orange-200",
  foundation: "bg-red-100 text-red-700 border-red-200",
};

const ratingDesc: Record<string, string> = {
  platinum: "Exceptional — ready for AI recommendations",
  gold: "Strong — well-optimized for AI search",
  silver: "Good — some gaps to address",
  bronze: "Below average — needs significant work",
  foundation: "Poor — major improvements required",
};

export function EvaluationDetail() {
  const params = useParams();
  const projectId = params.projectId as string;
  const evaluationId = params.id as string;
  const [evaluation, setEvaluation] = useState<EvaluationDetail | null>(null);
  const [scores, setScores] = useState<ScoreRow[]>([]);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [findingFilter, setFindingFilter] = useState<"all" | "high" | "medium" | "standards">("all");
  const [openCompetitor, setOpenCompetitor] = useState<string | null>(null);
  const [creatingMission, setCreatingMission] = useState(false);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const loadData = useCallback(() => {
    Promise.all([
      fetch(`/api/evaluations/${evaluationId}`).then((r) => r.json()),
      fetch(`/api/evaluations/${evaluationId}/findings`).then((r) => r.json()),
      fetch(`/api/evaluations/${evaluationId}/recommendations`).then((r) => r.json()),
      fetch(`/api/evaluations/${evaluationId}/scores`).then((r) => r.json()),
    ])
      .then(([ev, f, r, s]) => {
        setEvaluation(ev);
        setFindings(Array.isArray(f) ? f : []);
        setRecs(Array.isArray(r) ? r : []);
        setScores(Array.isArray(s) ? s : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [evaluationId]);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleRescore() {
    setScoring(true);
    setScoreError(null);
    try {
      const scoreRes = await fetch(`/api/evaluations/${evaluationId}/score`, { method: "POST" });
      if (!scoreRes.ok) { const e = await scoreRes.json().catch(() => ({})); throw new Error(e.error || "Scoring failed"); }

      const findingsRes = await fetch(`/api/evaluations/${evaluationId}/findings`, { method: "POST" });
      if (!findingsRes.ok) { const e = await findingsRes.json().catch(() => ({})); throw new Error(e.error || "Findings generation failed"); }

      const recsRes = await fetch(`/api/evaluations/${evaluationId}/recommendations`, { method: "POST" });
      if (!recsRes.ok) { const e = await recsRes.json().catch(() => ({})); throw new Error(e.error || "Recommendations generation failed"); }

      loadData();
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : "Re-score failed");
    }
    setScoring(false);
  }

  async function handleCreateMission() {
    setCreatingMission(true);
    setMissionError(null);
    try {
      const res = await fetch("/api/missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evaluation_id: evaluationId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create mission");
      window.location.href = `/projects/${projectId}/missions/${data.id}`;
    } catch (err) {
      setMissionError(err instanceof Error ? err.message : "Failed to create mission");
    }
    setCreatingMission(false);
  }

  async function handleDeleteEvaluation() {
    try {
      const res = await fetch(`/api/evaluations/${evaluationId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete evaluation");
      window.location.href = `/projects/${projectId}/evaluations`;
    } catch (err) {
      setMissionError(err instanceof Error ? err.message : "Failed to delete evaluation");
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  if (!evaluation) return (
    <div className="py-20 text-center">
      <AlertCircle className="mx-auto mb-3 h-10 w-10 text-slate-300" />
      <p className="text-slate-500">Evaluation not found</p>
      <Link href={`/projects/${projectId}/evaluations`} className="mt-3 inline-block text-sm text-blue-600 hover:underline">Back to evaluations</Link>
    </div>
  );

  const radarData = dimKeys.map((dim) => {
    const ds = scores.filter((s) => normalizeDimCode(s.dimension_code) === dim);
    const avg = ds.length > 0 ? Math.round(ds.reduce((a, s) => a + s.score, 0) / ds.length) : 0;
    return { dimension: dimLabels[dim], score: avg };
  });

  // Executive summary data
  const dimAvgs = dimKeys.map((dim) => {
    const ds = scores.filter((s) => normalizeDimCode(s.dimension_code) === dim);
    const avg = ds.length > 0 ? Math.round(ds.reduce((a, s) => a + s.score, 0) / ds.length) : 0;
    return { key: dim, label: dimLabels[dim], avg };
  });
  const weakestDims = dimAvgs.filter((d) => d.avg < 60).sort((a, b) => a.avg - b.avg);
  const strongestDims = dimAvgs.filter((d) => d.avg >= 75).sort((a, b) => b.avg - a.avg);
  const topCompetitor = [...evaluation.competitors].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const bottomCompetitor = [...evaluation.competitors].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];

  // Findings: only show opportunities and new standards; exclude old per-competitor "strength" noise
  const opportunityFindings = findings.filter((f) => f.type === "opportunity" || f.type === "weakness" || f.type === "gap");
  const standardFindings = findings.filter((f) => f.type === "standard");
  const highImpact = opportunityFindings.filter((f) => f.impact_level === "high");
  const mediumImpact = opportunityFindings.filter((f) => f.impact_level === "medium");

  const filteredFindings = (() => {
    switch (findingFilter) {
      case "high": return highImpact;
      case "medium": return mediumImpact;
      case "standards": return standardFindings;
      default: return [...opportunityFindings, ...standardFindings];
    }
  })();

  // Evidence grouped by competitor
  const evidenceByCompetitor = evaluation.competitors.map((comp) => ({
    competitor: comp,
    items: evaluation.evidence.filter((e) => e.competitor_id === comp.id),
  })).filter((c) => c.items.length > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}/evaluations`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{evaluation.primary_query}</h1>
            <p className="mt-0.5 text-sm text-slate-500 capitalize">{evaluation.search_intent} intent · {evaluation.competitors.length} competitors · {evaluation.evidence.length} evidence</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRescore} disabled={scoring}>
            {scoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Re-score
          </Button>
          <Button variant="outline" onClick={handleCreateMission} disabled={creatingMission}>
            {creatingMission ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
            Create Mission
          </Button>
          <Link href={`/projects/${projectId}/evaluations/${evaluationId}/report`}>
            <Button variant="outline"><FileText className="h-4 w-4" />Report</Button>
          </Link>
          <Button variant="outline" onClick={() => setShowDeleteDialog(true)} className="text-red-600 hover:text-red-700 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Re-score error */}
      {scoreError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <p className="text-sm font-medium text-red-700">Re-score failed: {scoreError}</p>
          </div>
          <p className="mt-1 text-xs text-red-500">The old findings are still showing. Try again or check the server logs.</p>
        </div>
      )}

      {/* Mission error */}
      {missionError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <p className="text-sm font-medium text-red-700">Mission creation failed: {missionError}</p>
          </div>
          <p className="mt-1 text-xs text-red-500">Make sure you have opportunities generated. Try re-scoring first.</p>
        </div>
      )}

      {/* Score Summary */}
      {evaluation.rrs_score !== null && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">Overall RRS</p>
            <p className="mt-2 text-4xl font-bold text-slate-900">{evaluation.rrs_score}<span className="text-base text-slate-400">/100</span></p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">Rating</p>
            <span className={`mt-2 inline-block rounded-lg border px-3 py-1 text-sm font-bold capitalize ${ratingColors[evaluation.rating || "foundation"]}`}>{evaluation.rating || "—"}</span>
            <p className="mt-1.5 text-xs text-slate-400">{ratingDesc[evaluation.rating || ""]}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">Confidence</p>
            <p className="mt-2 text-4xl font-bold text-slate-900">{evaluation.confidence_score || "—"}</p>
            <p className="text-xs text-slate-400">{evaluation.evidence.length} evidence items</p>
          </div>
        </div>
      )}

      {/* Executive Summary */}
      {scores.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Summary</h2>
          <div className="space-y-2 text-sm text-slate-700">
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
            {opportunityFindings.length > 0 && (
              <p>
                <strong className="text-blue-600">{opportunityFindings.length} opportunit{opportunityFindings.length > 1 ? "ies" : "y"}</strong> found
                {opportunityFindings.filter((f) => f.impact_level === "high").length > 0 && (
                  <> — {opportunityFindings.filter((f) => f.impact_level === "high").length} with high impact</>
                )}
                . See recommendations below for what to do about them.
              </p>
            )}
            {recs.length > 0 && (
              <p><strong>{recs.length} recommendation{recs.length > 1 ? "s" : ""}</strong> available to improve your scores.</p>
            )}
          </div>
        </div>
      )}

      {/* Radar Chart */}
      {scores.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Dimension Scores (Avg)</h2>
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
        </div>
      )}

      {/* Competitors */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3"><h2 className="text-sm font-semibold text-slate-800">Competitors ({evaluation.competitors.length})</h2></div>
        {evaluation.competitors.length > 0 ? (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
              <th className="px-5 py-2.5">Competitor</th><th className="px-5 py-2.5">Score</th>
              {dimKeys.map(d => <th key={d} className="px-3 py-2.5" title={dimLabels[d]}>{dimLabels[d]}</th>)}
            </tr></thead>
            <tbody>
              {evaluation.competitors.map((comp) => {
                const cs = scores.filter((s) => s.competitor_id === comp.id);
                return (
                  <tr key={comp.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3"><div className="flex items-center gap-2"><Globe className="h-4 w-4 text-slate-400" /><a href={comp.url} target="_blank" className="font-medium text-slate-800 hover:text-blue-600">{comp.competitor_name || comp.url}</a></div></td>
                    <td className="px-5 py-3 font-bold text-slate-800">{comp.score ?? "—"}</td>
                    {dimKeys.map(dim => {
                      const v = cs.find(s => normalizeDimCode(s.dimension_code) === dim)?.score;
                      const sv = v ?? 0;
                      return <td key={dim} className="px-3 py-3"><span className={`text-xs font-medium ${sv >= 75 ? "text-green-600" : sv >= 50 ? "text-yellow-600" : "text-red-500"}`}>{v ?? "—"}</span></td>;
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="py-10 text-center"><Globe className="mx-auto mb-2 h-8 w-8 text-slate-300" /><p className="text-sm text-slate-500">No competitors yet</p></div>}
      </div>

      {/* Findings */}
      {(opportunityFindings.length > 0 || standardFindings.length > 0) && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              {findingFilter === "all" && `Opportunities (${opportunityFindings.length})`}
              {findingFilter === "high" && `Opportunities — High Impact (${highImpact.length})`}
              {findingFilter === "medium" && `Opportunities — Medium Impact (${mediumImpact.length})`}
              {findingFilter === "standards" && `Table Stakes (${standardFindings.length})`}
            </h2>
          </div>
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-2.5">
            <button
              onClick={() => setFindingFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${findingFilter === "all" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              All ({opportunityFindings.length + standardFindings.length})
            </button>
            <button
              onClick={() => setFindingFilter("high")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${findingFilter === "high" ? "bg-red-500 text-white" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
            >
              High Impact ({highImpact.length})
            </button>
            <button
              onClick={() => setFindingFilter("medium")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${findingFilter === "medium" ? "bg-yellow-500 text-white" : "bg-yellow-50 text-yellow-600 hover:bg-yellow-100"}`}
            >
              Medium ({mediumImpact.length})
            </button>
            <button
              onClick={() => setFindingFilter("standards")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${findingFilter === "standards" ? "bg-green-600 text-white" : "bg-green-50 text-green-600 hover:bg-green-100"}`}
            >
              Table Stakes ({standardFindings.length})
            </button>
          </div>
          {filteredFindings.length > 0 ? (
            <div className="divide-y divide-slate-50">
              {filteredFindings.map((f) => {
                const Icon = f.impact_level === "high" ? AlertTriangle : f.impact_level === "medium" ? AlertCircle : CheckCircle2;
                const color = f.impact_level === "high" ? "text-red-500" : f.impact_level === "medium" ? "text-yellow-500" : "text-green-500";
                const comp = evaluation.competitors.find((c) => c.id === f.competitor_id);
                return (
                  <div key={f.id} className="flex items-start gap-3 px-5 py-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{dimLabels[normalizeDimCode(f.dimension_code)] || f.dimension_code || "General"}</span>
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium capitalize ${f.impact_level === "high" ? "bg-red-100 text-red-700" : f.impact_level === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}`}>{f.type}</span>
                        {comp && <span className="text-xs text-slate-400">{comp.competitor_name || comp.url}</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{f.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-400" />
              <p className="text-sm text-slate-500">Nothing in this category.</p>
            </div>
          )}
        </div>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3"><h2 className="text-sm font-semibold text-slate-800">Recommendations ({recs.length})</h2></div>
          <div className="divide-y divide-slate-50">
            {recs.map((rec, i) => (
              <div key={rec.id} className="px-5 py-4"><div className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{i+1}</div>
                <div><div className="flex items-center gap-2 flex-wrap">
                  <Lightbulb className="h-4 w-4 text-blue-500" />
                  <p className="text-sm font-medium text-slate-800">{rec.title}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rec.priority === "high" ? "bg-red-100 text-red-700" : rec.priority === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-500"}`}>{rec.priority}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize">{rec.effort} effort</span>
                </div>{rec.description && <p className="mt-1 text-sm text-slate-600">{rec.description}</p>}
                {rec.expected_impact && <p className="mt-1 text-xs font-medium text-green-600">Impact: {rec.expected_impact.replace(/\bD[1-7]\b/g, (m) => dimLabels[legacyMap[m]] || m)}</p>}</div>
              </div></div>
            ))}
          </div>
        </div>
      )}

      {/* Evidence — grouped by competitor, highlighting gaps */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <button onClick={() => setEvidenceOpen(!evidenceOpen)} className="flex w-full items-center justify-between border-b border-slate-200 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Evidence ({evaluation.evidence.length})</h2>
          {evidenceOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
        </button>
        {evidenceOpen && evaluation.evidence.length > 0 && (
          <div className="divide-y divide-slate-50">
            {evidenceByCompetitor.map(({ competitor: comp, items }) => {
              const gaps = items.filter((ev) => /no |not found|missing|don't/i.test(ev.observation));
              return (
                <div key={comp.id} className="px-5 py-4">
                  <button onClick={() => setOpenCompetitor(openCompetitor === comp.id ? null : comp.id)} className="flex w-full items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-slate-400" />
                      <span className="text-sm font-medium text-slate-800">{comp.competitor_name || comp.url}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{items.length} items</span>
                      {gaps.length > 0 && (
                        <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">{gaps.length} gaps</span>
                      )}
                    </div>
                    {openCompetitor === comp.id ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                  </button>
                  {openCompetitor === comp.id && (
                    <div className="mt-3 space-y-3">
                      {Object.entries(
                        items.reduce((acc, ev) => {
                          if (!acc[ev.category]) acc[ev.category] = [];
                          acc[ev.category].push(ev);
                          return acc;
                        }, {} as Record<string, Evidence[]>)
                      ).map(([cat, catItems]) => (
                        <div key={cat}>
                          <h3 className="mb-1.5 text-xs font-semibold uppercase text-slate-400">{catLabels[cat] || cat} ({catItems.length})</h3>
                          <div className="space-y-1">
                            {catItems.map((ev) => {
                              const isGap = /no |not found|missing|don't/i.test(ev.observation);
                              return (
                                <div key={ev.id} className="flex items-start gap-2 text-sm">
                                  {isGap ? (
                                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-600">GAP</span>
                                  ) : (
                                    <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs font-medium text-green-600">OK</span>
                                  )}
                                  <span className={isGap ? "text-red-700 font-medium" : "text-slate-700"}>{ev.observation}</span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete evaluation?"
        message="This will permanently delete the evaluation and all its data — competitors, evidence, findings, recommendations, and missions. This cannot be undone."
        onConfirm={handleDeleteEvaluation}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
