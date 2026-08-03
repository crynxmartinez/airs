"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { FileText, Loader2, AlertCircle, ArrowLeft, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { Project, Evaluation, Mission, MissionTask } from "@/types";

interface EvaluationWithCounts extends Evaluation {
  competitor_count: number;
}

interface MissionWithTasks extends Mission {
  tasks: MissionTask[];
  site_url: string | null;
}

export default function ReportsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [missions, setMissions] = useState<MissionWithTasks[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch("/api/evaluations").then((r) => r.json()),
      fetch("/api/missions").then((r) => r.json()),
    ])
      .then(([p, e, m]) => {
        setProject(p);
        const projectEvals = Array.isArray(e) ? e.filter((ev: Evaluation) => ev.project_id === projectId) : [];
        setEvaluations(projectEvals);
        const evalIds = new Set(projectEvals.map((ev) => ev.id));
        const projectMissions = Array.isArray(m) ? m.filter((mi: Mission) => evalIds.has(mi.evaluation_id)) : [];
        setMissions(projectMissions);
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

  const evalById = new Map(evaluations.map((e) => [e.id, e]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href={`/projects/${projectId}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
          <p className="mt-0.5 text-sm text-slate-500">{project.name} — mission reports & summaries</p>
        </div>
      </div>

      {/* Mission Reports */}
      {missions.length > 0 ? (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Mission Reports ({missions.length})</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {missions.map((m) => {
              const totalTasks = m.tasks?.length || 0;
              const doneTasks = m.tasks?.filter((t) => t.status === "done").length || 0;
              const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
              const evalData = evalById.get(m.evaluation_id);
              return (
                <Link
                  key={m.id}
                  href={`/projects/${projectId}/missions/${m.id}/report`}
                  className="group rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-md transition"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                        <FileText className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-800 group-hover:text-blue-600">{m.name}</p>
                        <p className="text-xs text-slate-400">
                          {evalData?.primary_query || "—"}
                        </p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      m.status === "active" ? "bg-blue-100 text-blue-700" :
                      m.status === "completed" ? "bg-green-100 text-green-700" :
                      "bg-slate-100 text-slate-500"
                    }`}>
                      {m.status}
                    </span>
                  </div>

                  <div className="mt-4 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-400">Progress</span>
                        <span className="text-xs font-bold text-blue-600">{progress}%</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-slate-100">
                        <div className={`h-1.5 rounded-full ${progress === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${progress}%` }} />
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-slate-400">Tasks</p>
                      <p className="text-sm font-medium text-slate-700">{doneTasks}/{totalTasks}</p>
                    </div>
                  </div>

                  {m.site_url && (
                    <p className="mt-3 text-xs text-slate-400 truncate">🌐 {m.site_url}</p>
                  )}

                  <p className="mt-3 text-xs text-slate-400">
                    Created {new Date(m.created_at).toLocaleDateString()}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<FileText className="h-7 w-7" />}
          title="No reports yet"
          description="Create an evaluation, then a mission to generate a printable report."
          action={
            <Link href={`/projects/${projectId}/evaluations/new`}>
              <Button>
                <Target className="h-4 w-4" />
                New Evaluation
              </Button>
            </Link>
          }
        />
      )}

      {/* Evaluation Reports (links to existing report pages) */}
      {evaluations.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-800">Evaluation Reports ({evaluations.length})</h2>
          <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                  <th className="px-5 py-2.5">Evaluation</th>
                  <th className="px-5 py-2.5">Score</th>
                  <th className="px-5 py-2.5">Competitors</th>
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-5 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((ev) => (
                  <tr key={ev.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">{ev.primary_query}</td>
                    <td className="px-5 py-3">
                      {ev.rrs_score ? (
                        <span className={`font-bold ${ev.rrs_score >= 75 ? "text-green-600" : ev.rrs_score >= 50 ? "text-yellow-600" : "text-red-500"}`}>
                          {ev.rrs_score}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-slate-600">{ev.competitor_count || 0}</td>
                    <td className="px-5 py-3 text-slate-400 text-xs">{new Date(ev.created_at).toLocaleDateString()}</td>
                    <td className="px-5 py-3 text-right">
                      <Link
                        href={`/projects/${projectId}/evaluations/${ev.id}/report`}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700"
                      >
                        <FileText className="h-3.5 w-3.5" />
                        View Report
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
