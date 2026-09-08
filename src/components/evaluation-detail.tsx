"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Globe, AlertCircle, Loader2,
  RefreshCw, FileText, AlertTriangle, CheckCircle2,
  Lightbulb, ChevronDown, ChevronRight, Target, Trash2,
  TrendingUp, ArrowRight, Grid3x3,
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
  excellent: "bg-purple-100 text-purple-700 border-purple-200",
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

function getRating(score: number): string {
  if (score >= 90) return "platinum";
  if (score >= 75) return "gold";
  if (score >= 60) return "silver";
  if (score >= 40) return "bronze";
  return "foundation";
}

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
  const [findingFilter, setFindingFilter] = useState<"all" | "high" | "opportunity">("all");
  const [openCompetitor, setOpenCompetitor] = useState<string | null>(null);
  const [creatingMission, setCreatingMission] = useState(false);
  const [missionError, setMissionError] = useState<string | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [missionExists, setMissionExists] = useState(false);
  const [checkingMission, setCheckingMission] = useState(true);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    Promise.all([
      fetch(`/api/evaluations/${evaluationId}`).then((r) => r.json()),
      fetch(`/api/evaluations/${evaluationId}/findings`).then((r) => r.json()),
      fetch(`/api/evaluations/${evaluationId}/recommendations`).then((r) => r.json()),
      fetch(`/api/evaluations/${evaluationId}/scores`).then((r) => r.json()),
      fetch(`/api/missions?evaluation_id=${evaluationId}`).then((r) => r.json()),
    ])
      .then(([ev, f, r, s, m]) => {
        setEvaluation(ev);
        setFindings(Array.isArray(f) ? f : []);
        setRecs(Array.isArray(r) ? r : []);
        setScores(Array.isArray(s) ? s : []);
        setMissionExists(Array.isArray(m) && m.length > 0);
        setCheckingMission(false);
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

  async function handleRemoveCompetitor(competitorId: string) {
    setRemovingId(competitorId);
    try {
      const res = await fetch(`/api/evaluations/${evaluationId}/competitors?competitorId=${competitorId}`, { method: "DELETE" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || "Failed to remove competitor"); }

      loadData();
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : "Failed to remove competitor");
    }
    setRemovingId(null);
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
      setMissionExists(true);
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
    const ds = scores.filter((s) => {
      const comp = evaluation.competitors.find((c) => c.id === s.competitor_id);
      return normalizeDimCode(s.dimension_code) === dim && comp?.competitor_type !== "self";
    });
    const avg = ds.length > 0 ? Math.round(ds.reduce((a, s) => a + s.score, 0) / ds.length) : 0;
    return { dimension: dimLabels[dim], score: avg };
  });

  // Self vs field competitors
  const selfCompetitor = evaluation.competitors.find((c) => c.competitor_type === "self");
  const fieldCompetitors = evaluation.competitors.filter((c) => c.competitor_type !== "self");
  const selfScores = selfCompetitor ? scores.filter((s) => s.competitor_id === selfCompetitor.id) : [];
  const selfOverall = selfCompetitor?.score ?? null;

  // Field-only dimension averages (exclude self from field stats)
  const dimAvgs = dimKeys.map((dim) => {
    const ds = scores.filter((s) => {
      const comp = evaluation.competitors.find((c) => c.id === s.competitor_id);
      return normalizeDimCode(s.dimension_code) === dim && comp?.competitor_type !== "self";
    });
    const avg = ds.length > 0 ? Math.round(ds.reduce((a, s) => a + s.score, 0) / ds.length) : 0;
    return { key: dim, label: dimLabels[dim], avg };
  });
  const weakestDims = dimAvgs.filter((d) => d.avg < 60).sort((a, b) => a.avg - b.avg);
  const strongestDims = dimAvgs.filter((d) => d.avg >= 75).sort((a, b) => b.avg - a.avg);
  const topCompetitor = [...fieldCompetitors].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const bottomCompetitor = [...fieldCompetitors].sort((a, b) => (a.score ?? 0) - (b.score ?? 0))[0];
  const fieldAvg = fieldCompetitors.length > 0
    ? Math.round(fieldCompetitors.reduce((a, c) => a + (c.score ?? 0), 0) / fieldCompetitors.length)
    : 0;

  // "opportunity" is a gap most of the field shares — a genuine opening. "gap" is
  // parity work the field already has and your site doesn't — high impact.
  const opportunityFindings = findings.filter((f) => f.type === "opportunity" || f.type === "weakness");
  const highImpactFindings = findings.filter((f) => f.type === "gap" || f.type === "standard");
  const allActionable = [...highImpactFindings, ...opportunityFindings];

  // Mirrors the scoping rule in lib/findings.ts: gap prevalence is measured over
  // contestable rivals, falling back to every result when too few are classified.
  const primaryCompetitors = evaluation.competitors.filter(
    (c) => c.competitor_type === "direct" || c.competitor_type === "functional" || c.competitor_type === "platform"
  );
  const analysisBasisIsFallback =
    evaluation.competitors.length > 0 && primaryCompetitors.length < 3;

  const filteredFindings = (() => {
    switch (findingFilter) {
      case "high": return highImpactFindings;
      case "opportunity": return opportunityFindings;
      default: return allActionable;
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
            <p className="mt-0.5 text-sm text-slate-500 capitalize">{evaluation.search_intent} intent · {fieldCompetitors.length} competitors · {evaluation.evidence.length} evidence</p>
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
          <Link href={`/projects/${projectId}/evaluations/${evaluationId}/coverage`}>
            <Button variant="outline"><Grid3x3 className="h-4 w-4" />Coverage</Button>
          </Link>
          <Link href={`/projects/${projectId}/evaluations/${evaluationId}/briefs`}>
            <Button variant="outline"><FileText className="h-4 w-4" />Briefs</Button>
          </Link>
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

      {/* Guided Workflow Banner */}
      {!checkingMission && (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white">
                {evaluation.rrs_score !== null ? (missionExists ? <CheckCircle2 className="h-4 w-4" /> : <Target className="h-4 w-4" />) : <RefreshCw className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {evaluation.rrs_score === null
                    ? "Step 1: Score your evaluation"
                    : !missionExists
                      ? "Step 2: Create a mission from your findings"
                      : "Step 3: Track progress in Benchmarks"}
                </p>
                <p className="text-xs text-slate-500">
                  {evaluation.rrs_score === null
                    ? "Run scoring to generate findings and recommendations"
                    : !missionExists
                      ? `${allActionable.length} finding${allActionable.length === 1 ? "" : "s"} ready — turn them into an actionable mission`
                      : "Re-score after completing mission tasks to see your progress"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {evaluation.rrs_score === null && (
                <Button onClick={handleRescore} disabled={scoring} className="px-3 py-1.5 text-xs">
                  {scoring ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Score Now
                </Button>
              )}
              {evaluation.rrs_score !== null && !missionExists && (
                <Button onClick={handleCreateMission} disabled={creatingMission} className="px-3 py-1.5 text-xs">
                  {creatingMission ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Target className="h-3.5 w-3.5" />}
                  Create Mission
                </Button>
              )}
              {missionExists && (
                <Link href={`/projects/${projectId}/benchmarks`}>
                  <Button className="px-3 py-1.5 text-xs">
                    <TrendingUp className="h-3.5 w-3.5" />
                    View Benchmarks
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
          {/* Progress dots */}
          <div className="mt-3 flex items-center gap-2">
            {["Score", "Mission", "Benchmark"].map((label, i) => {
              const isDone = (i === 0 && evaluation.rrs_score !== null) || (i === 1 && missionExists) || (i === 2 && false);
              const isCurrent = (i === 0 && evaluation.rrs_score === null) || (i === 1 && evaluation.rrs_score !== null && !missionExists) || (i === 2 && missionExists);
              return (
                <div key={label} className="flex items-center gap-2">
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                    isDone ? "bg-green-500 text-white" : isCurrent ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-400"
                  }`}>
                    {isDone ? <CheckCircle2 className="h-3 w-3" /> : i + 1}
                  </div>
                  <span className={`text-xs ${isDone ? "text-green-600 font-medium" : isCurrent ? "text-blue-700 font-medium" : "text-slate-400"}`}>{label}</span>
                  {i < 2 && <div className={`h-px w-6 ${isDone ? "bg-green-300" : "bg-slate-200"}`} />}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Score Summary — Your Site vs Field */}
      {evaluation.rrs_score !== null && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-medium text-slate-500">{selfCompetitor ? "Your Site Score" : "Overall RRS"}</p>
            <p className="mt-2 text-4xl font-bold text-slate-900">{evaluation.rrs_score}<span className="text-base text-slate-400">/100</span></p>
            {selfCompetitor && fieldCompetitors.length > 0 && (
              <p className="mt-1 text-xs text-slate-400">Field average: {fieldAvg}/100</p>
            )}
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

      {/* Your Site Card */}
      {selfCompetitor && (
        <div className="rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-blue-600" />
              <h2 className="text-sm font-semibold text-slate-800">Your Site — {selfCompetitor.url}</h2>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-2xl font-bold text-slate-900">{selfOverall ?? "—"}<span className="text-sm text-slate-400">/100</span></span>
              {selfCompetitor.score !== null && (
                <span className={`rounded-lg border px-2 py-0.5 text-xs font-bold capitalize ${ratingColors[selfCompetitor.score >= 85 ? "excellent" : selfCompetitor.score >= 70 ? "gold" : selfCompetitor.score >= 50 ? "silver" : "foundation"]}`}>{getRating(selfCompetitor.score)}</span>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {dimKeys.map((dim) => {
              const v = selfScores.find((s) => normalizeDimCode(s.dimension_code) === dim)?.score;
              const fieldAvgForDim = dimAvgs.find((d) => d.key === dim)?.avg ?? 0;
              const diff = v != null ? v - fieldAvgForDim : null;
              return (
                <div key={dim} className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{dimLabels[dim]}</p>
                  <p className={`mt-1 text-lg font-bold ${v == null ? "text-slate-300" : v >= 75 ? "text-green-600" : v >= 50 ? "text-yellow-600" : "text-red-500"}`}>{v ?? "—"}</p>
                  {diff !== null && (
                    <p className={`text-[10px] ${diff > 0 ? "text-green-500" : diff < 0 ? "text-red-400" : "text-slate-400"}`}>
                      {diff > 0 ? "+" : ""}{diff} vs field
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Executive Summary */}
      {scores.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/50 p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-800">Summary</h2>
          <div className="space-y-2 text-sm text-slate-700">
            {selfCompetitor && selfOverall !== null && (
              <p>
                <strong>Your site scores {selfOverall}/100</strong> — {selfOverall >= fieldAvg ? `above` : `below`} the field average of {fieldAvg}/100.
              </p>
            )}
            {topCompetitor && (
              <p>
                <strong>{topCompetitor.competitor_name || topCompetitor.url}</strong> is the top competitor
                with a score of <strong>{topCompetitor.score}/100</strong>
                {bottomCompetitor && bottomCompetitor.id !== topCompetitor.id && (
                  <>, while <strong>{bottomCompetitor.competitor_name || bottomCompetitor.url}</strong> is the weakest at <strong>{bottomCompetitor.score}/100</strong>.</>
                )}
                .
              </p>
            )}
            {weakestDims.length > 0 && (
              <p><strong>Competitor scores — Field weaknesses:</strong> {weakestDims.map((d) => `${d.label} (${d.avg}/100)`).join(", ")}</p>
            )}
            {strongestDims.length > 0 && (
              <p><strong>Competitor scores — Field strengths:</strong> {strongestDims.map((d) => `${d.label} (${d.avg}/100)`).join(", ")}</p>
            )}
            {highImpactFindings.length > 0 && (
              <p>
                <strong className="text-red-600">{highImpactFindings.length} high-impact finding{highImpactFindings.length > 1 ? "s" : ""}</strong> — your site is missing things most competitors already have.
              </p>
            )}
            {opportunityFindings.length > 0 && (
              <p>
                <strong className="text-blue-600">{opportunityFindings.length} opportunit{opportunityFindings.length > 1 ? "ies" : "y"}</strong> found — gaps most of the field shares. See recommendations below.
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
        <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-800">Competitors ({fieldCompetitors.length})</h2>
          {fieldCompetitors.some((c) => (c.score ?? 0) === 0) && (
            <span className="text-xs text-slate-400">Click the trash icon to remove zero-score competitors, then rescore</span>
          )}
        </div>
        {fieldCompetitors.length > 0 ? (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
              <th className="px-5 py-2.5">Competitor</th><th className="px-5 py-2.5">Score</th>
              {dimKeys.map(d => <th key={d} className="px-3 py-2.5" title={dimLabels[d]}>{dimLabels[d]}</th>)}
              <th className="px-3 py-2.5"></th>
            </tr></thead>
            <tbody>
              {fieldCompetitors.map((comp) => {
                const cs = scores.filter((s) => s.competitor_id === comp.id);
                return (
                  <tr key={comp.id} className={`border-b border-slate-50 hover:bg-slate-50 ${(comp.score ?? 0) === 0 ? "bg-red-50/30" : ""}`}>
                    <td className="px-5 py-3"><div className="flex items-center gap-2"><Globe className="h-4 w-4 text-slate-400" /><a href={comp.url} target="_blank" className="font-medium text-slate-800 hover:text-blue-600">{comp.competitor_name || comp.url}</a></div></td>
                    <td className="px-5 py-3 font-bold text-slate-800">{comp.score ?? "—"}</td>
                    {dimKeys.map(dim => {
                      const v = cs.find(s => normalizeDimCode(s.dimension_code) === dim)?.score;
                      const sv = v ?? 0;
                      return <td key={dim} className="px-3 py-3"><span className={`text-xs font-medium ${sv >= 75 ? "text-green-600" : sv >= 50 ? "text-yellow-600" : "text-red-500"}`}>{v ?? "—"}</span></td>;
                    })}
                    <td className="px-3 py-3">
                      <button
                        onClick={() => handleRemoveCompetitor(comp.id)}
                        disabled={removingId === comp.id}
                        className="rounded p-1 text-slate-400 transition hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                        title="Remove competitor and rescore"
                      >
                        {removingId === comp.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <div className="py-10 text-center"><Globe className="mx-auto mb-2 h-8 w-8 text-slate-300" /><p className="text-sm text-slate-500">No competitors yet</p></div>}
      </div>

      {/* Findings */}
      {(opportunityFindings.length > 0 || highImpactFindings.length > 0) && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">
              {findingFilter === "all" && `Findings (${allActionable.length})`}
              {findingFilter === "high" && `High Impact (${highImpactFindings.length})`}
              {findingFilter === "opportunity" && `Opportunities (${opportunityFindings.length})`}
            </h2>
          </div>
          {analysisBasisIsFallback && (
            <div className="border-b border-amber-100 bg-amber-50 px-5 py-2.5 text-xs text-amber-800">
              Measured across all {evaluation.competitors.length} results:{" "}
              {primaryCompetitors.length === 1 ? "only 1 is" : `only ${primaryCompetitors.length} are`} classified as a
              direct, functional or platform competitor — too few to analyse alone. Informational results skew gap
              analysis, so classify more competitors for a sharper read.
            </div>
          )}
          <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-2.5">
            <button
              onClick={() => setFindingFilter("all")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${findingFilter === "all" ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
            >
              All ({allActionable.length})
            </button>
            <button
              onClick={() => setFindingFilter("high")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${findingFilter === "high" ? "bg-red-500 text-white" : "bg-red-50 text-red-600 hover:bg-red-100"}`}
            >
              High Impact ({highImpactFindings.length})
            </button>
            <button
              onClick={() => setFindingFilter("opportunity")}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${findingFilter === "opportunity" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-600 hover:bg-blue-100"}`}
            >
              Opportunities ({opportunityFindings.length})
            </button>
          </div>
          {filteredFindings.length > 0 ? (
            <div className="divide-y divide-slate-50">
              {filteredFindings.map((f) => {
                const isHighImpact = f.type === "gap" || f.type === "standard";
                const Icon = isHighImpact ? AlertTriangle : Lightbulb;
                const color = isHighImpact ? "text-red-500" : "text-blue-500";
                const comp = evaluation.competitors.find((c) => c.id === f.competitor_id);
                const desc = f.description || "";
                const boldMatch = desc.match(/\*\*(.+?)\*\*/);
                const beforeBold = boldMatch ? desc.slice(0, boldMatch.index) : desc;
                const boldText = boldMatch ? boldMatch[1] : "";
                const afterBold = boldMatch ? desc.slice((boldMatch.index ?? 0) + boldMatch[0].length) : "";
                return (
                  <div key={f.id} className="flex items-start gap-3 px-5 py-3">
                    <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{dimLabels[normalizeDimCode(f.dimension_code)] || f.dimension_code || "General"}</span>
                        <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${isHighImpact ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>{isHighImpact ? "High Impact" : "Opportunity"}</span>
                        {comp && <span className="text-xs text-slate-400">{comp.competitor_name || comp.url}</span>}
                      </div>
                      <p className="mt-1 text-sm text-slate-700">
                        {beforeBold}
                        {boldText && <span className="font-semibold text-red-600">{boldText}</span>}
                        {afterBold}
                      </p>
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
            {recs.map((rec, i) => {
              const desc = rec.description || "";
              const stepsIdx = desc.indexOf("Action steps:");
              const summary = stepsIdx >= 0 ? desc.slice(0, stepsIdx).trim() : desc.trim();
              const stepsBlock = stepsIdx >= 0 ? desc.slice(stepsIdx + "Action steps:".length).trim() : "";
              const steps = stepsBlock.split("\n").map(s => s.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
              return (
                <div key={rec.id} className="px-5 py-4"><div className="flex items-start gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">{i+1}</div>
                  <div className="flex-1"><div className="flex items-center gap-2 flex-wrap">
                    <Lightbulb className="h-4 w-4 text-blue-500" />
                    <p className="text-sm font-medium text-slate-800">{rec.title}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rec.priority === "high" ? "bg-red-100 text-red-700" : rec.priority === "medium" ? "bg-yellow-100 text-yellow-700" : "bg-slate-100 text-slate-500"}`}>{rec.priority}</span>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize">{rec.effort} effort</span>
                  </div>
                  {summary && <p className="mt-1.5 text-sm text-slate-600">{summary}</p>}
                  {steps.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Action steps</p>
                      <ul className="mt-1 space-y-1">
                        {steps.map((step, si) => (
                          <li key={si} className="flex items-start gap-2 text-sm text-slate-600">
                            <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                            <span>{step}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {rec.expected_impact && <p className="mt-2 text-xs font-medium text-green-600">Expected impact: {rec.expected_impact.replace(/\bD[1-7]\b/g, (m) => dimLabels[legacyMap[m]] || m)}</p>}
                </div>
              </div></div>
              );
            })}
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
