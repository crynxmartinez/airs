"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Plus, ClipboardList, Target, TrendingUp, Folder, ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import type { Project, Evaluation } from "@/types";

interface ProjectWithCounts extends Project {
  evaluation_count: number;
  competitor_count: number;
}

interface EvaluationWithCounts extends Evaluation {
  competitor_count: number;
  evidence_count: number;
}

export default function DashboardPage() {
  const [projects, setProjects] = useState<ProjectWithCounts[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluationWithCounts[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/evaluations").then((r) => r.json()),
    ])
      .then(([p, e]) => {
        setProjects(Array.isArray(p) ? p : []);
        setEvaluations(Array.isArray(e) ? e : []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalEvals = evaluations.length;
  const activeEvals = evaluations.filter((e) => e.status === "in_progress").length;
  const totalCompetitors = evaluations.reduce((sum, e) => sum + (e.competitor_count || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            Overview across all your projects
          </p>
        </div>
        <Link href="/projects/new">
          <Button>
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </Link>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Projects", value: projects.length, icon: Folder },
          { label: "Evaluations", value: totalEvals, icon: ClipboardList },
          { label: "Active", value: activeEvals, icon: Target },
          { label: "Competitors Tracked", value: totalCompetitors, icon: TrendingUp },
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

      {/* Projects List */}
      {projects.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Your Projects</h2>
            <Link href="/projects/new" className="text-xs font-medium text-blue-600 hover:underline">
              + New Project
            </Link>
          </div>
          <div className="divide-y divide-slate-50">
            {projects.map((p) => (
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
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-700">{p.evaluation_count || 0}</p>
                    <p className="text-xs text-slate-400">evaluations</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-700">{p.competitor_count || 0}</p>
                    <p className="text-xs text-slate-400">competitors</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-slate-300" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : (
        !loading && (
          <EmptyState
            icon={<LayoutDashboard className="h-7 w-7" />}
            title="No projects yet"
            description="Create a project to start analyzing competitors and finding their weaknesses."
            action={
              <Link href="/projects/new">
                <Button>
                  <Plus className="h-4 w-4" />
                  Create Project
                </Button>
              </Link>
            }
          />
        )
      )}
    </div>
  );
}
