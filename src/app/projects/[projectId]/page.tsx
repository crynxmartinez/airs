"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Plus, ClipboardList, Target, TrendingUp, Globe, Loader2, AlertCircle,
  ArrowRight, Trophy, MapPin, Activity, CheckCircle2, Clock,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

interface ProjectStats {
  project: { id: string; name: string; description: string | null; created_at: string };
  scores: {
    rrs: number | null;
    geo: number | null;
    geoData: { score: number; rating: string; summary: { passed: number; warnings: number; failed: number } } | null;
    gmb: number | null;
    gmbData: { score: number; rating: string; summary: { passed: number; warnings: number; failed: number } } | null;
    gmbLps: number | null;
    composite: number | null;
    target: number;
  };
  stats: {
    evaluationCount: number;
    competitorCount: number;
    missionCount: number;
    activeMissionCount: number;
    totalTasks: number;
    doneTasks: number;
    missionProgress: number;
    gmbAuditCount: number;
  };
  missions: { id: string; name: string; status: string; task_count: number; done_count: number; created_at: string }[];
  activeMissions: { id: string; name: string; status: string; task_count: number; done_count: number; created_at: string }[];
  scoreHistory: { id: string; score: number; rating: string; date: string; index: number }[];
  gmbHistory: { id: string; score: number; rating: string; date: string; search_query: string }[];
  recentActivity: {
    type: "evaluation" | "mission" | "gmb_audit" | "score" | "task_done";
    title: string;
    detail: string;
    score: number | null;
    created_at: string;
  }[];
  evaluations: { id: string; primary_query: string; status: string; rrs_score: number | null; created_at: string }[];
  citationShare: {
    totalQueries: number;
    citedQueries: number;
    citationShare: number;
    perEngine: { engine: string; total: number; cited: number; share: number }[];
  };
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-slate-300";
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-500";
}

function scoreBg(score: number | null): string {
  if (score === null) return "bg-slate-50";
  if (score >= 80) return "bg-green-50";
  if (score >= 60) return "bg-blue-50";
  if (score >= 40) return "bg-yellow-50";
  return "bg-red-50";
}

function scoreRing(score: number | null): string {
  if (score === null) return "ring-slate-200";
  if (score >= 80) return "ring-green-200";
  if (score >= 60) return "ring-blue-200";
  if (score >= 40) return "ring-yellow-200";
  return "ring-red-200";
}

const activityIcon = {
  evaluation: { icon: ClipboardList, color: "text-blue-500", bg: "bg-blue-50" },
  mission: { icon: Target, color: "text-purple-500", bg: "bg-purple-50" },
  gmb_audit: { icon: MapPin, color: "text-orange-500", bg: "bg-orange-50" },
  score: { icon: Trophy, color: "text-green-500", bg: "bg-green-50" },
  task_done: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-50" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export default function ProjectDashboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [data, setData] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/stats`)
      .then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-20 text-center">
        <AlertCircle className="mx-auto mb-3 h-10 w-10 text-slate-300" />
        <p className="text-slate-500">Project not found</p>
        <Link href="/dashboard" className="mt-3 inline-block text-sm text-blue-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { project, scores, stats } = data;

  // Build combined trend chart data
  const maxLen = Math.max(data.scoreHistory.length, data.gmbHistory.length);
  const trendData: { name: string; rrs: number | null; gmb: number | null }[] = [];
  for (let i = 0; i < maxLen; i++) {
    const rrsEntry = data.scoreHistory[i];
    const gmbEntry = data.gmbHistory[i];
    trendData.push({
      name: rrsEntry ? `#${rrsEntry.index}` : gmbEntry ? `#${i + 1}` : `#${i + 1}`,
      rrs: rrsEntry ? rrsEntry.score : null,
      gmb: gmbEntry ? gmbEntry.score : null,
    });
  }

  const quickActions = [
    { label: "AIRS Analysis", href: `/projects/${projectId}/evaluations`, icon: ClipboardList, desc: `${stats.evaluationCount} evaluation${stats.evaluationCount !== 1 ? "s" : ""}`, score: scores.rrs, scoreLabel: "RRS" },
    { label: "GEO Readiness", href: `/projects/${projectId}/geo`, icon: Globe, desc: "AI search visibility", score: scores.geo, scoreLabel: "GEO" },
    { label: "Maps Audit", href: `/projects/${projectId}/gmb`, icon: MapPin, desc: `${stats.gmbAuditCount} scan${stats.gmbAuditCount !== 1 ? "s" : ""}`, score: scores.gmbLps || scores.gmb, scoreLabel: scores.gmbLps ? "LPS" : "GMB" },
    { label: "Action Plans", href: `/projects/${projectId}/gmb/action-plans`, icon: Target, desc: "GMB recommendations", score: null, scoreLabel: "" },
    { label: "Missions", href: `/projects/${projectId}/missions`, icon: Target, desc: `${stats.missionCount} mission${stats.missionCount !== 1 ? "s" : ""}`, score: null, scoreLabel: "" },
    { label: "Benchmarks", href: `/projects/${projectId}/benchmarks`, icon: TrendingUp, desc: "Score history", score: null, scoreLabel: "" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-sm text-slate-500">{project.description}</p>
          )}
        </div>
        {data.evaluations.length === 0 ? (
          <Link href={`/projects/${projectId}/evaluations/new`}>
            <Button><Plus className="h-4 w-4" />New Evaluation</Button>
          </Link>
        ) : (
          <Link href={`/projects/${projectId}/evaluations/${data.evaluations[0].id}`}>
            <Button><ClipboardList className="h-4 w-4" />View Evaluation</Button>
          </Link>
        )}
      </div>

      {/* Composite Health Score Hero */}
      {scores.composite !== null && (
        <div className={`rounded-2xl border-2 ${scoreRing(scores.composite)} ${scoreBg(scores.composite)} p-6`}>
          <div className="flex items-center gap-6">
            <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200" />
                <circle
                  cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8"
                  className={scoreColor(scores.composite)}
                  strokeDasharray={`${(scores.composite / 100) * 351.86} 351.86`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className={`text-3xl font-bold ${scoreColor(scores.composite)}`}>{scores.composite}</span>
                <span className="text-xs text-slate-400">/ 100</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Trophy className={`h-5 w-5 ${scoreColor(scores.composite)}`} />
                <span className={`text-lg font-bold ${scoreColor(scores.composite)}`}>
                  {scores.composite >= 80 ? "Excellent" : scores.composite >= 60 ? "Good" : scores.composite >= 40 ? "Needs Work" : "Critical"}
                </span>
                <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  Target: {scores.target}
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {scores.composite >= scores.target
                  ? "You've reached your target score. Keep maintaining your optimization."
                  : `${scores.target - scores.composite} points to reach your target of ${scores.target}.`}
              </p>
              <div className="mt-3 flex gap-4">
                {scores.rrs !== null && (
                  <div className="flex items-center gap-1.5">
                    <Trophy className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">RRS <span className={scoreColor(scores.rrs)}>{scores.rrs}</span></span>
                  </div>
                )}
                {scores.geo !== null && (
                  <div className="flex items-center gap-1.5">
                    <Globe className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">GEO <span className={scoreColor(scores.geo)}>{scores.geo}</span></span>
                  </div>
                )}
                {(scores.gmbLps || scores.gmb) !== null && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700">{scores.gmbLps ? "LPS" : "GMB"} <span className={scoreColor(scores.gmbLps || scores.gmb)}>{scores.gmbLps || scores.gmb}</span></span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Citation Share — AI visibility headline metric */}
      {data.citationShare && data.citationShare.totalQueries > 0 && (
        <div className="rounded-2xl border-2 border-indigo-200 bg-indigo-50 p-6">
          <div className="flex items-center gap-6">
            <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
              <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128">
                <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8" className="text-indigo-100" />
                <circle
                  cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8"
                  className="text-indigo-600"
                  strokeDasharray={`${data.citationShare.citationShare * 351.86} 351.86`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute flex flex-col items-center">
                <span className="text-3xl font-bold text-indigo-600">
                  {Math.round(data.citationShare.citationShare * 100)}%
                </span>
                <span className="text-xs text-indigo-400">cited</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-indigo-600" />
                <span className="text-lg font-bold text-indigo-900">Citation Share</span>
              </div>
              <p className="mt-1 text-sm text-indigo-700">
                Your site is cited in {data.citationShare.citedQueries} of {data.citationShare.totalQueries} tracked AI queries.
                This is the headline metric — it measures real AI answer capture, not proxy scores.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {data.citationShare.perEngine.map((e) => (
                  <div key={e.engine} className="rounded-lg bg-white/80 px-3 py-1.5">
                    <span className="text-xs font-medium text-indigo-700 capitalize">{e.engine}</span>
                    <span className="ml-2 text-sm font-bold text-indigo-900">
                      {e.cited}/{e.total} ({Math.round(e.share * 100)}%)
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Three-score overview (when no composite yet) */}
      {scores.composite === null && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "RRS Score", value: scores.rrs, icon: Trophy, desc: "AIRS Analysis", href: `/projects/${projectId}/evaluations` },
            { label: "GEO Score", value: scores.geo, icon: Globe, desc: "AI Readiness", href: `/projects/${projectId}/geo` },
            { label: "GMB/LPS Score", value: scores.gmbLps || scores.gmb, icon: MapPin, desc: "Maps Visibility", href: `/projects/${projectId}/gmb` },
          ].map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.label} href={s.href} className="rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-200 transition">
                <div className="flex items-center gap-2">
                  <Icon className={`h-4 w-4 ${scoreColor(s.value)}`} />
                  <p className="text-xs font-medium text-slate-500">{s.label}</p>
                </div>
                <p className={`mt-2 text-2xl font-bold ${scoreColor(s.value)}`}>{s.value ?? "—"}</p>
                <p className="mt-0.5 text-[10px] text-slate-400">{s.desc}</p>
              </Link>
            );
          })}
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Evaluations", value: stats.evaluationCount, icon: ClipboardList, sub: `${stats.competitorCount} competitors` },
          { label: "Missions", value: stats.missionCount, icon: Target, sub: `${stats.activeMissionCount} active` },
          { label: "Mission Progress", value: `${stats.missionProgress}%`, icon: TrendingUp, sub: `${stats.doneTasks}/${stats.totalTasks} tasks` },
          { label: "GMB Scans", value: stats.gmbAuditCount, icon: MapPin, sub: "Maps audits" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <Icon className="h-4 w-4 text-slate-300" />
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</p>
              <p className="mt-0.5 text-xs text-slate-400">{stat.sub}</p>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Score Trend Chart */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">Score Trend</h2>
            {trendData.length > 0 && (
              <Link href={`/projects/${projectId}/benchmarks`} className="text-xs text-blue-600 hover:underline">
                View all benchmarks →
              </Link>
            )}
          </div>
          {trendData.length > 1 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Line type="monotone" dataKey="rrs" name="RRS Score" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} connectNulls />
                  <Line type="monotone" dataKey="gmb" name="GMB/LPS Score" stroke="#f97316" strokeWidth={2} dot={{ r: 3, fill: "#f97316" }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex h-48 items-center justify-center text-center">
              <div>
                <TrendingUp className="mx-auto mb-2 h-8 w-8 text-slate-200" />
                <p className="text-sm text-slate-400">
                  {trendData.length === 1 ? "Score once — re-score to see trends" : "No scores yet. Run an evaluation to start tracking."}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Active Missions */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">Active Missions</h2>
            <Link href={`/projects/${projectId}/missions`} className="text-xs text-blue-600 hover:underline">
              View all →
            </Link>
          </div>
          {data.activeMissions.length > 0 ? (
            <div className="space-y-3">
              {data.activeMissions.map((m) => {
                const mProgress = m.task_count > 0 ? Math.round((m.done_count / m.task_count) * 100) : 0;
                return (
                  <Link key={m.id} href={`/projects/${projectId}/missions/${m.id}`} className="block rounded-lg border border-slate-100 p-3 hover:border-blue-200 hover:bg-blue-50/30 transition">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="truncate text-sm font-medium text-slate-800">{m.name}</span>
                      <span className="text-xs font-bold text-blue-600">{mProgress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${mProgress}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">{m.done_count}/{m.task_count} tasks done</p>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-center">
              <div>
                <Target className="mx-auto mb-2 h-7 w-7 text-slate-200" />
                <p className="text-sm text-slate-400">No active missions</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Recent Evaluations */}
        {data.evaluations.length > 0 ? (
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Recent Evaluations</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-2.5">Query</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Score</th>
                  <th className="px-5 py-2.5">Date</th>
                </tr>
              </thead>
              <tbody>
                {data.evaluations.map((ev) => (
                  <tr key={ev.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link href={`/projects/${projectId}/evaluations/${ev.id}`} className="font-medium text-slate-800 hover:text-blue-600">
                        {ev.primary_query}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        ev.status === "completed" ? "bg-green-100 text-green-700" :
                        ev.status === "in_progress" ? "bg-blue-100 text-blue-700" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {ev.status.replace("_", " ")}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      {ev.rrs_score ? (
                        <span className={`font-bold ${scoreColor(ev.rrs_score)}`}>{ev.rrs_score}</span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-400 text-xs">
                      {new Date(ev.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="lg:col-span-2">
            <EmptyState
              icon={<ClipboardList className="h-7 w-7" />}
              title="No evaluations yet"
              description="Create your first evaluation in this project to start analyzing competitors."
              action={
                <Link href={`/projects/${projectId}/evaluations/new`}>
                  <Button><Plus className="h-4 w-4" />Create Evaluation</Button>
                </Link>
              }
            />
          </div>
        )}

        {/* Recent Activity */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Recent Activity</h2>
          </div>
          {data.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {data.recentActivity.map((item, i) => {
                const config = activityIcon[item.type] || activityIcon.evaluation;
                const Icon = config.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                      <p className="text-[10px] text-slate-400">
                        {item.detail}
                        {item.score !== null && ` · ${item.score} pts`}
                      </p>
                      <p className="text-[10px] text-slate-300">{timeAgo(item.created_at)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-center">
              <div>
                <Clock className="mx-auto mb-2 h-7 w-7 text-slate-200" />
                <p className="text-sm text-slate-400">No recent activity</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-slate-800">Quick Actions</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <Link
                key={action.label}
                href={action.href}
                className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-blue-200 hover:bg-blue-50/30 transition"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100">
                  <Icon className="h-4 w-4 text-blue-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-slate-800">{action.label}</p>
                  <p className="text-xs text-slate-400">{action.desc}</p>
                </div>
                {action.score !== null && action.score !== undefined && (
                  <div className="text-right">
                    <p className="text-[9px] text-slate-400">{action.scoreLabel}</p>
                    <p className={`text-sm font-bold ${scoreColor(action.score)}`}>{action.score}</p>
                  </div>
                )}
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
