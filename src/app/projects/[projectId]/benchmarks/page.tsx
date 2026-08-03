"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { TrendingUp, Loader2, Target, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Legend, ReferenceLine,
} from "recharts";

interface BenchmarkData {
  history: { id: string; primary_query: string; rrs_score: number; rating: string; created_at: string }[];
  competitive: { evaluation_id: string; primary_query: string; avg_score: number; competitor_count: number }[];
  industry: { avg_score: number; total_evaluations: number };
  dimensionAvg: { dimension_code: string; avg_score: number }[];
  scoreHistory: { id: string; evaluation_id: string; rrs_score: number; rating: string | null; dimension_scores: { code: string; score: number }[] | null; recorded_at: string }[];
  historyByEval: Record<string, { date: string; score: number; rating: string | null }[]>;
  dimTrends: Record<string, { date: string; score: number }[]>;
  missionProgress: { missionId: string; missionName: string; evaluationId: string; total: number; done: number; progress: number; createdAt: string }[];
  targetScore: number;
}

const dimLabels: Record<string, string> = {
  intent: "Intent", content: "Content", trust: "Trust", ux: "UX",
  technical: "Technical", competitive: "Competitive", ecosystem: "Ecosystem",
  D1: "Intent", D2: "Content", D3: "Trust", D4: "UX",
  D5: "Technical", D6: "Competitive", D7: "Ecosystem",
};

export default function ProjectBenchmarksPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingTarget, setEditingTarget] = useState(false);
  const [targetInput, setTargetInput] = useState("80");
  const [savingTarget, setSavingTarget] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/benchmarks`).then((r) => r.json()).then((d) => {
      setData(d);
      setTargetInput(String(d.targetScore ?? 80));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectId]);

  async function saveTarget() {
    setSavingTarget(true);
    const score = parseInt(targetInput) || 80;
    await fetch(`/api/projects/${projectId}/benchmarks`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target_score: score }),
    });
    setData((prev) => prev ? { ...prev, targetScore: score } : prev);
    setEditingTarget(false);
    setSavingTarget(false);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;

  const hasData = data && (data.history.length > 0 || data.competitive.length > 0 || data.scoreHistory.length > 0);

  if (!hasData) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Benchmarks</h1>
          <p className="mt-1 text-sm text-slate-500">Track scores over time and compare against industry averages</p>
        </div>
        <EmptyState
          icon={<TrendingUp className="h-7 w-7" />}
          title="No benchmark data yet"
          description="Complete evaluations with scoring to see historical trends, competitive comparisons, and industry benchmarks."
        />
      </div>
    );
  }

  const projectAvg = data.history.length > 0
    ? Math.round(data.history.reduce((a, h) => a + h.rrs_score, 0) / data.history.length)
    : 0;

  // Score history chart data — all scoring runs chronologically
  const scoreHistoryData = data.scoreHistory.map((h) => {
    const evalItem = data.history.find((e) => e.id === h.evaluation_id);
    return {
      date: new Date(h.recorded_at).toLocaleDateString(),
      score: h.rrs_score,
      label: evalItem?.primary_query?.slice(0, 15) || "—",
    };
  });

  // Per-evaluation trend lines for the score history chart
  const evalKeys = Object.keys(data.historyByEval);
  const evalColors = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444", "#06b6d4", "#ec4899", "#84cc16"];

  // Merge all dates for the per-evaluation chart
  const allDates = [...new Set(data.scoreHistory.map((h) => new Date(h.recorded_at).toLocaleDateString()))];
  const perEvalChartData = allDates.map((date) => {
    const point: Record<string, number | string> = { date };
    for (const evalId of evalKeys) {
      const entry = data.historyByEval[evalId].find((e) => e.date === date);
      if (entry) {
        const evalItem = data.history.find((e) => e.id === evalId);
        point[evalItem?.primary_query?.slice(0, 15) || evalId] = entry.score;
      }
    }
    return point;
  });

  // Mission progress data — align with score history dates
  const missionData = data.missionProgress.map((m) => {
    const evalItem = data.history.find((e) => e.id === m.evaluationId);
    return {
      name: evalItem?.primary_query?.slice(0, 15) || m.missionName.slice(0, 15),
      progress: m.progress,
      done: m.done,
      total: m.total,
    };
  });

  // Dimension trend data — one line per dimension
  const dimKeys = Object.keys(data.dimTrends);
  const dimColors: Record<string, string> = {
    intent: "#3b82f6", content: "#8b5cf6", trust: "#10b981", ux: "#f59e0b",
    technical: "#ef4444", competitive: "#06b6d4", ecosystem: "#ec4899",
  };
  const dimTrendChartData = allDates.map((date) => {
    const point: Record<string, number | string> = { date };
    for (const dim of dimKeys) {
      const entry = data.dimTrends[dim].find((e) => e.date === date);
      if (entry) point[dimLabels[dim] || dim] = entry.score;
    }
    return point;
  });

  // Trend indicator
  function getTrend(scores: number[]): "up" | "down" | "stable" | "none" {
    if (scores.length < 2) return "none";
    const recent = scores[scores.length - 1];
    const prev = scores[scores.length - 2];
    const diff = recent - prev;
    if (diff > 2) return "up";
    if (diff < -2) return "down";
    return "stable";
  }

  const trendIcon = (trend: string) => {
    if (trend === "up") return <ArrowUp className="h-4 w-4 text-green-600" />;
    if (trend === "down") return <ArrowDown className="h-4 w-4 text-red-600" />;
    if (trend === "stable") return <Minus className="h-4 w-4 text-slate-400" />;
    return null;
  };

  const allScores = data.scoreHistory.map((h) => h.rrs_score);
  const overallTrend = getTrend(allScores);
  const gapToTarget = data.targetScore - projectAvg;

  // Competitive comparison
  const competitiveData = data.competitive.map((c) => ({
    name: c.primary_query.slice(0, 20),
    yourScore: data.history.find((h) => h.id === c.evaluation_id)?.rrs_score || 0,
    competitorAvg: Math.round(c.avg_score),
  }));

  // Dimension averages
  const dimData = data.dimensionAvg.map((d) => ({
    name: dimLabels[d.dimension_code] || d.dimension_code,
    score: Math.round(d.avg_score),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Benchmarks</h1>
          <p className="mt-1 text-sm text-slate-500">Score trends, dimension breakdowns, and mission progress correlation</p>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Project Average</p>
          <div className="mt-2 flex items-center gap-2">
            <p className="text-3xl font-bold text-slate-900">{projectAvg}</p>
            {trendIcon(overallTrend)}
          </div>
          <p className="mt-1 text-xs text-slate-400">{data.scoreHistory.length} scoring runs</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Target Score</p>
          {editingTarget ? (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={100}
                value={targetInput}
                onChange={(e) => setTargetInput(e.target.value)}
                className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-lg font-bold text-slate-900"
              />
              <Button variant="outline" className="h-8 px-2 text-xs" onClick={saveTarget} disabled={savingTarget}>
                {savingTarget ? "Saving..." : "Save"}
              </Button>
              <Button variant="outline" className="h-8 px-2 text-xs" onClick={() => setEditingTarget(false)}>Cancel</Button>
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2">
              <p className="text-3xl font-bold text-slate-900">{data.targetScore}</p>
              <button onClick={() => setEditingTarget(true)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <Target className="h-4 w-4" />
              </button>
            </div>
          )}
          <p className="mt-1 text-xs text-slate-400">
            {gapToTarget > 0 ? `${gapToTarget} points to go` : gapToTarget === 0 ? "Target reached!" : `${Math.abs(gapToTarget)} points above target`}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Industry Average</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{Math.round(data.industry.avg_score || 0)}</p>
          <p className="text-xs text-slate-400">across {data.industry.total_evaluations} evaluations</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <p className="text-sm font-medium text-slate-500">Missions Active</p>
          <p className="mt-2 text-3xl font-bold text-slate-900">{data.missionProgress.length}</p>
          <p className="text-xs text-slate-400">
            {data.missionProgress.reduce((a, m) => a + m.done, 0)} / {data.missionProgress.reduce((a, m) => a + m.total, 0)} tasks done
          </p>
        </div>
      </div>

      {/* Score History with Target Line */}
      {scoreHistoryData.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Score History Over Time</h2>
            <span className="text-xs text-slate-400">Each point = one scoring run</span>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scoreHistoryData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip />
                <ReferenceLine y={data.targetScore} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: "Target", position: "right", fill: "#f59e0b", fontSize: 11 }} />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} name="RRS Score" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-Evaluation Score Trends */}
      {perEvalChartData.length > 1 && evalKeys.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Score Trends Per Evaluation</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={perEvalChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip />
                <Legend />
                <ReferenceLine y={data.targetScore} stroke="#f59e0b" strokeDasharray="5 5" />
                {evalKeys.map((evalId, i) => {
                  const evalItem = data.history.find((e) => e.id === evalId);
                  const key = evalItem?.primary_query?.slice(0, 15) || evalId;
                  return (
                    <Line
                      key={evalId}
                      type="monotone"
                      dataKey={key}
                      stroke={evalColors[i % evalColors.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Mission Progress Correlation */}
      {missionData.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800">Mission Progress</h2>
            <span className="text-xs text-slate-400">Task completion % per mission</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={missionData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} width={120} />
                <Tooltip />
                <Bar dataKey="progress" fill="#10b981" name="Completion %" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 space-y-2">
            {data.missionProgress.map((m) => (
              <div key={m.missionId} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                <span className="text-xs font-medium text-slate-700">{m.missionName}</span>
                <span className="text-xs text-slate-500">{m.done}/{m.total} tasks · {m.progress}%</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Per-Dimension Trends */}
      {dimTrendChartData.length > 1 && dimKeys.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Dimension Score Trends Over Time</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dimTrendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip />
                <Legend />
                {dimKeys.map((dim) => (
                  <Line
                    key={dim}
                    type="monotone"
                    dataKey={dimLabels[dim] || dim}
                    stroke={dimColors[dim] || "#94a3b8"}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Competitive comparison */}
      {competitiveData.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">You vs Competitor Average</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={competitiveData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip />
                <Legend />
                <ReferenceLine y={data.targetScore} stroke="#f59e0b" strokeDasharray="5 5" />
                <Bar dataKey="yourScore" fill="#3b82f6" name="Your Score" />
                <Bar dataKey="competitorAvg" fill="#94a3b8" name="Competitor Avg" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Dimension averages (current snapshot) */}
      {dimData.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-slate-800">Dimension Averages (Current)</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dimData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#64748b" }} />
                <Tooltip />
                <Bar dataKey="score" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
