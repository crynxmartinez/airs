"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Plus, ClipboardList, Target, TrendingUp, Globe, Loader2, AlertCircle,
  ArrowRight, Trophy,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { Project, Evaluation, Mission, MissionTask } from "@/types";

interface EvaluationWithCounts extends Evaluation {
  competitor_count: number;
  evidence_count: number;
}

interface MissionWithTasks extends Mission {
  tasks: MissionTask[];
}

interface ScoreHistoryEntry {
  id: string;
  evaluation_id: string;
  rrs_score: number;
  rating: string;
  created_at: string;
}

export default function ProjectDashboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationWithCounts[]>([]);
  const [missions, setMissions] = useState<MissionWithTasks[]>([]);
  const [scoreHistory, setScoreHistory] = useState<ScoreHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch("/api/evaluations").then((r) => r.json()),
      fetch("/api/missions").then((r) => r.json()),
      fetch(`/api/projects/${projectId}/benchmarks`).then((r) => r.json()),
    ])
      .then(([p, e, m, b]) => {
        setProject(p);
        const projectEvals = Array.isArray(e) ? e.filter((ev: Evaluation) => ev.project_id === projectId) : [];
        setEvaluations(projectEvals);
        const projectMissions = Array.isArray(m) ? m.filter((mi: Mission) => projectEvals.some((ev) => ev.id === mi.evaluation_id)) : [];
        setMissions(projectMissions);
        setScoreHistory(Array.isArray(b?.scoreHistory) ? b.scoreHistory : []);
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

  if (!project) {
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

  const activeCount = evaluations.filter((e) => e.status === "in_progress").length;
  const competitorCount = evaluations.reduce((sum, e) => sum + (e.competitor_count || 0), 0);
  const scoredEvals = evaluations.filter((e) => e.rrs_score !== null);
  const avgScore = scoredEvals.length > 0
    ? Math.round(scoredEvals.reduce((sum, e) => sum + (e.rrs_score || 0), 0) / scoredEvals.length)
    : null;
  const activeMissions = missions.filter((m) => m.status === "active");
  const totalTasks = missions.reduce((sum, m) => sum + (m.tasks?.length || 0), 0);
  const doneTasks = missions.reduce((sum, m) => sum + (m.tasks?.filter((t) => t.status === "done").length || 0), 0);
  const missionProgress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Score trend data
  const trendData = scoreHistory.slice(-10).map((h, i) => ({
    name: `#${i + 1}`,
    score: h.rrs_score,
    date: new Date(h.created_at).toLocaleDateString(),
  }));

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
        <Link href={`/projects/${projectId}/evaluations/new`}>
          <Button>
            <Plus className="h-4 w-4" />
            New Evaluation
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Evaluations", value: evaluations.length, icon: ClipboardList, sub: `${activeCount} active` },
          { label: "Avg RRS Score", value: avgScore ?? "—", icon: Trophy, sub: avgScore !== null ? `of ${scoredEvals.length} scored` : "not scored yet" },
          { label: "Competitors Tracked", value: competitorCount, icon: Globe, sub: "across all evaluations" },
          { label: "Mission Progress", value: `${missionProgress}%`, icon: Target, sub: `${doneTasks}/${totalTasks} tasks done` },
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
        {/* Score Trend */}
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
                  <Tooltip
                    contentStyle={{ borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                    labelFormatter={(_, payload) => payload?.[0]?.payload?.date || ""}
                  />
                  <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6" }} />
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
          {activeMissions.length > 0 ? (
            <div className="space-y-3">
              {activeMissions.slice(0, 3).map((m) => {
                const mDone = m.tasks?.filter((t) => t.status === "done").length || 0;
                const mTotal = m.tasks?.length || 0;
                const mProgress = mTotal > 0 ? Math.round((mDone / mTotal) * 100) : 0;
                return (
                  <Link key={m.id} href={`/projects/${projectId}/missions/${m.id}`} className="block rounded-lg border border-slate-100 p-3 hover:border-blue-200 hover:bg-blue-50/30 transition">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="truncate text-sm font-medium text-slate-800">{m.name}</span>
                      <span className="text-xs font-bold text-blue-600">{mProgress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-100">
                      <div className="h-1.5 rounded-full bg-blue-500" style={{ width: `${mProgress}%` }} />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">{mDone}/{mTotal} tasks done</p>
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

      {/* Recent Evaluations + Quick Actions */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {evaluations.length > 0 ? (
          <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white overflow-hidden">
            <div className="border-b border-slate-200 px-5 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Recent Evaluations</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-2.5">Query</th>
                  <th className="px-5 py-2.5">Status</th>
                  <th className="px-5 py-2.5">Competitors</th>
                  <th className="px-5 py-2.5">Score</th>
                  <th className="px-5 py-2.5">Date</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.slice(0, 5).map((ev) => (
                  <tr key={ev.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3">
                      <Link
                        href={`/projects/${projectId}/evaluations/${ev.id}`}
                        className="font-medium text-slate-800 hover:text-blue-600"
                      >
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
                    <td className="px-5 py-3 text-slate-600">{ev.competitor_count || 0}</td>
                    <td className="px-5 py-3">
                      {ev.rrs_score ? (
                        <span className={`font-bold ${ev.rrs_score >= 75 ? "text-green-600" : ev.rrs_score >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                          {ev.rrs_score}
                        </span>
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
                  <Button>
                    <Plus className="h-4 w-4" />
                    Create Evaluation
                  </Button>
                </Link>
              }
            />
          </div>
        )}

        {/* Quick Actions */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-slate-800">Quick Actions</h2>
          {[
            { label: "New Evaluation", href: `/projects/${projectId}/evaluations/new`, icon: Plus, desc: "Analyze a new search query" },
            { label: "View Missions", href: `/projects/${projectId}/missions`, icon: Target, desc: `${missions.length} mission${missions.length !== 1 ? "s" : ""} total` },
            { label: "Check Benchmarks", href: `/projects/${projectId}/benchmarks`, icon: TrendingUp, desc: avgScore ? `Avg score: ${avgScore}` : "No scores yet" },
          ].map((action) => {
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
                <ArrowRight className="h-4 w-4 text-slate-300" />
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
