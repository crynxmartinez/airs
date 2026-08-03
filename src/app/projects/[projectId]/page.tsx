"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Plus, ClipboardList, Target, TrendingUp, Globe, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { Project, Evaluation } from "@/types";

interface EvaluationWithCounts extends Evaluation {
  competitor_count: number;
  evidence_count: number;
}

export default function ProjectDashboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<Project | null>(null);
  const [evaluations, setEvaluations] = useState<EvaluationWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`/api/projects/${projectId}`).then((r) => r.json()),
      fetch("/api/evaluations").then((r) => r.json()),
    ])
      .then(([p, e]) => {
        setProject(p);
        const projectEvals = Array.isArray(e) ? e.filter((ev: Evaluation) => ev.project_id === projectId) : [];
        setEvaluations(projectEvals);
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
          { label: "Evaluations", value: evaluations.length, icon: ClipboardList },
          { label: "Active", value: activeCount, icon: Target },
          { label: "Competitors Tracked", value: competitorCount, icon: Globe },
          { label: "Missions", value: 0, icon: TrendingUp },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{stat.label}</p>
                <Icon className="h-4 w-4 text-slate-300" />
              </div>
              <p className="mt-2 text-3xl font-bold text-slate-900">{stat.value}</p>
            </div>
          );
        })}
      </div>

      {/* Recent Evaluations */}
      {evaluations.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Recent Evaluations</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                <th className="px-5 py-2.5">Query</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5">Competitors</th>
                <th className="px-5 py-2.5">Evidence</th>
                <th className="px-5 py-2.5">Score</th>
                <th className="px-5 py-2.5">Date</th>
              </tr>
            </thead>
            <tbody>
              {evaluations.map((ev) => (
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
                  <td className="px-5 py-3 text-slate-600">{ev.evidence_count || 0}</td>
                  <td className="px-5 py-3">
                    {ev.rrs_score ? (
                      <span className="font-medium text-slate-800">{ev.rrs_score}</span>
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
      )}
    </div>
  );
}
