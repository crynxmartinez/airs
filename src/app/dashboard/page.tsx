"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  LayoutDashboard, Plus, ClipboardList, Target, Folder,
  ArrowRight, Globe, MapPin, Trophy, AlertTriangle, Activity,
  CheckCircle2, Clock, Loader2,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

interface DashboardData {
  stats: {
    totalProjects: number;
    totalEvals: number;
    totalCompetitors: number;
    avgComposite: number | null;
    avgRrs: number | null;
    avgGeo: number | null;
    avgGmb: number | null;
  };
  projects: {
    id: string;
    name: string;
    description: string | null;
    evaluation_count: number;
    competitor_count: number;
    rrs_score: number | null;
    geo_score: number | null;
    gmb_score: number | null;
    gmb_lps_score: number | null;
    composite_score: number | null;
    target_score: number | null;
  }[];
  needsAttention: {
    id: string;
    name: string;
    composite_score: number | null;
    target_score: number | null;
  }[];
  recentActivity: {
    type: "evaluation" | "mission" | "gmb_audit" | "score";
    project_id: string;
    project_name: string;
    title: string;
    detail: string;
    score: number | null;
    created_at: string;
  }[];
}

function scoreColor(score: number | null): string {
  if (score === null) return "text-slate-300";
  if (score >= 80) return "text-green-600";
  if (score >= 60) return "text-blue-600";
  if (score >= 40) return "text-yellow-600";
  return "text-red-500";
}

function scoreBg(score: number | null): string {
  if (score === null) return "bg-slate-100";
  if (score >= 80) return "bg-green-100";
  if (score >= 60) return "bg-blue-100";
  if (score >= 40) return "bg-yellow-100";
  return "bg-red-100";
}

function scoreBarColor(score: number | null): string {
  if (score === null) return "#cbd5e1";
  if (score >= 80) return "#22c55e";
  if (score >= 60) return "#3b82f6";
  if (score >= 40) return "#eab308";
  return "#ef4444";
}

const activityIcon = {
  evaluation: { icon: ClipboardList, color: "text-blue-500", bg: "bg-blue-50" },
  mission: { icon: Target, color: "text-purple-500", bg: "bg-purple-50" },
  gmb_audit: { icon: MapPin, color: "text-orange-500", bg: "bg-orange-50" },
  score: { icon: Trophy, color: "text-green-500", bg: "bg-green-50" },
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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data || data.projects.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="mt-1 text-sm text-slate-500">Overview across all your projects</p>
          </div>
          <Link href="/projects/new">
            <Button><Plus className="h-4 w-4" />New Project</Button>
          </Link>
        </div>
        <EmptyState
          icon={<LayoutDashboard className="h-7 w-7" />}
          title="No projects yet"
          description="Create a project to start analyzing competitors and finding their weaknesses."
          action={
            <Link href="/projects/new">
              <Button><Plus className="h-4 w-4" />Create Project</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const { stats } = data;
  const chartData = data.projects
    .filter((p) => p.composite_score !== null)
    .map((p) => ({
      name: p.name.length > 12 ? p.name.slice(0, 12) + "..." : p.name,
      composite: p.composite_score,
      rrs: p.rrs_score,
      geo: p.geo_score,
      gmb: p.gmb_lps_score || p.gmb_score,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Overview across all your projects</p>
        </div>
        <Link href="/projects/new">
          <Button><Plus className="h-4 w-4" />New Project</Button>
        </Link>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Projects", value: stats.totalProjects, icon: Folder, sub: "active" },
          { label: "Avg Health Score", value: stats.avgComposite ?? "—", icon: Trophy, sub: stats.avgComposite !== null ? "composite" : "not scored", score: stats.avgComposite },
          { label: "Evaluations", value: stats.totalEvals, icon: ClipboardList, sub: "total" },
          { label: "Competitors", value: stats.totalCompetitors, icon: Globe, sub: "tracked" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <Icon className="h-4 w-4 text-slate-300" />
              </div>
              <p className={`mt-2 text-3xl font-bold ${stat.score !== undefined ? scoreColor(stat.score) : "text-slate-900"}`}>
                {stat.value}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{stat.sub}</p>
            </div>
          );
        })}
      </div>

      {/* Score Averages */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Avg RRS", value: stats.avgRrs, icon: Trophy, desc: "AIRS Analysis" },
          { label: "Avg GEO", value: stats.avgGeo, icon: Globe, desc: "AI Readiness" },
          { label: "Avg GMB/LPS", value: stats.avgGmb, icon: MapPin, desc: "Maps Visibility" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2">
                <Icon className={`h-4 w-4 ${scoreColor(s.value)}`} />
                <p className="text-xs font-medium text-slate-500">{s.label}</p>
              </div>
              <div className="mt-2 flex items-end gap-2">
                <p className={`text-2xl font-bold ${scoreColor(s.value)}`}>{s.value ?? "—"}</p>
                {s.value !== null && <p className="mb-0.5 text-xs text-slate-400">/ 100</p>}
              </div>
              <p className="mt-0.5 text-[10px] text-slate-400">{s.desc}</p>
              {s.value !== null && (
                <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                  <div className="h-1.5 rounded-full" style={{ width: `${s.value}%`, backgroundColor: scoreBarColor(s.value) }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Cross-project chart */}
        {chartData.length > 0 && (
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">Project Score Comparison</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} />
                  <Tooltip contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }} />
                  <Bar dataKey="composite" name="Composite" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={scoreBarColor(entry.composite)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Needs Attention */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <h2 className="text-sm font-semibold text-slate-800">Needs Attention</h2>
          </div>
          {data.needsAttention.length > 0 ? (
            <div className="space-y-2">
              {data.needsAttention.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  className="flex items-center justify-between rounded-lg border border-orange-100 bg-orange-50/50 p-3 hover:bg-orange-50 transition"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    <p className="text-xs text-slate-400">
                      Target: {p.target_score || 80} · Gap: {((p.target_score || 80) - (p.composite_score || 0))} pts
                    </p>
                  </div>
                  <span className={`text-lg font-bold ${scoreColor(p.composite_score)}`}>
                    {p.composite_score}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-center">
              <div>
                <CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-green-300" />
                <p className="text-sm text-slate-400">All projects on track</p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Projects List */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Your Projects</h2>
            <Link href="/projects/new" className="text-xs font-medium text-blue-600 hover:underline">
              + New Project
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {data.projects.map((p) => (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50">
                    <Folder className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-800">{p.name}</p>
                    {p.description && (
                      <p className="mt-0.5 text-xs text-slate-500 line-clamp-1">{p.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Score badges */}
                  {p.composite_score !== null && (
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${scoreBg(p.composite_score)}`}>
                      <span className={`text-sm font-bold ${scoreColor(p.composite_score)}`}>{p.composite_score}</span>
                    </div>
                  )}
                  <div className="hidden gap-2 sm:flex">
                    {p.rrs_score !== null && (
                      <div className="text-center" title="RRS Score">
                        <p className="text-[9px] text-slate-400">RRS</p>
                        <p className={`text-xs font-bold ${scoreColor(p.rrs_score)}`}>{p.rrs_score}</p>
                      </div>
                    )}
                    {p.geo_score !== null && (
                      <div className="text-center" title="GEO Score">
                        <p className="text-[9px] text-slate-400">GEO</p>
                        <p className={`text-xs font-bold ${scoreColor(p.geo_score)}`}>{p.geo_score}</p>
                      </div>
                    )}
                    {(p.gmb_lps_score || p.gmb_score) !== null && (
                      <div className="text-center" title="GMB Score">
                        <p className="text-[9px] text-slate-400">GMB</p>
                        <p className={`text-xs font-bold ${scoreColor(p.gmb_lps_score || p.gmb_score)}`}>{p.gmb_lps_score || p.gmb_score}</p>
                      </div>
                    )}
                  </div>
                  <div className="hidden text-right md:block">
                    <p className="text-sm font-medium text-slate-700">{p.evaluation_count}</p>
                    <p className="text-xs text-slate-400">evals</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Recent Activity */}
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center gap-2 mb-4">
            <Activity className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-800">Recent Activity</h2>
          </div>
          {data.recentActivity.length > 0 ? (
            <div className="space-y-3">
              {data.recentActivity.map((item, i) => {
                const config = activityIcon[item.type];
                const Icon = config.icon;
                return (
                  <div key={i} className="flex items-start gap-3">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${config.bg}`}>
                      <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-slate-700 truncate">{item.title}</p>
                      <p className="text-[10px] text-slate-400">
                        {item.project_name} · {item.detail}
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
    </div>
  );
}
