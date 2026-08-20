"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Target, Loader2, Power, ArrowRight, ChevronDown, ChevronRight, Globe } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import type { Mission, MissionTask, Evaluation } from "@/types";

interface MissionWithTasks extends Mission {
  tasks: MissionTask[];
}

interface EvaluationGroup {
  evaluation: Evaluation;
  missions: MissionWithTasks[];
}

export default function ProjectMissionsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [groups, setGroups] = useState<EvaluationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasEvaluations, setHasEvaluations] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [collapsedEvals, setCollapsedEvals] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      fetch("/api/missions").then((r) => r.json()),
      fetch("/api/evaluations").then((r) => r.json()),
    ]).then(async ([m, evals]) => {
      const missionList = Array.isArray(m) ? m : [];
      const projectEvals = (Array.isArray(evals) ? evals.filter((e: Evaluation) => e.project_id === projectId) : []) as Evaluation[];
      setHasEvaluations(projectEvals.length > 0);
      const projectEvalIds = new Set(projectEvals.map((e) => e.id));
      const projectMissions = missionList.filter((mission: Mission) => projectEvalIds.has(mission.evaluation_id));
      const withTasks = await Promise.all(
        projectMissions.map(async (mission: Mission) => {
          const res = await fetch(`/api/missions/${mission.id}`);
          return res.json();
        })
      );
      // Group missions by evaluation
      const grouped: EvaluationGroup[] = projectEvals
        .map((evaluation) => ({
          evaluation,
          missions: withTasks
            .filter((m: MissionWithTasks) => m.evaluation_id === evaluation.id)
            .sort((a, b) => {
              // Active first, then completed, then inactive, then by date
              const rank: Record<string, number> = { active: 0, completed: 1, inactive: 2 };
              return (rank[a.status] ?? 3) - (rank[b.status] ?? 3) || 0;
            }),
        }))
        .filter((g) => g.missions.length > 0);
      setGroups(grouped);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectId]);

  async function activateMission(missionId: string, evalId: string) {
    setActivatingId(missionId);
    try {
      await fetch(`/api/missions/${missionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      setGroups((prev) =>
        prev.map((g) =>
          g.evaluation.id === evalId
            ? {
                ...g,
                missions: g.missions.map((m) => ({
                  ...m,
                  status: m.id === missionId ? "active" : m.status === "active" ? "inactive" : m.status,
                })),
              }
            : g
        )
      );
    } catch (err) { console.error("[page.tsx]", err); }
    setActivatingId(null);
  }

  function toggleEval(evalId: string) {
    setCollapsedEvals((prev) => {
      const next = new Set(prev);
      if (next.has(evalId)) next.delete(evalId);
      else next.add(evalId);
      return next;
    });
  }

  function evalLabel(e: Evaluation): string {
    const url = e.digital_asset_url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
    const question = e.primary_query || "";
    return question ? `${url} — ${question}` : url;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Missions</h1>
        <p className="mt-1 text-sm text-slate-500">Action plans built from evaluation recommendations</p>
      </div>

      {!loading && groups.length > 0 ? (
        <div className="space-y-4">
          {groups.map((group) => {
            const isCollapsed = collapsedEvals.has(group.evaluation.id);
            const activeMission = group.missions.find((m) => m.status === "active");
            return (
              <div key={group.evaluation.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                {/* Collapsible evaluation header */}
                <button
                  onClick={() => toggleEval(group.evaluation.id)}
                  className="w-full flex items-center gap-3 px-5 py-4 bg-slate-50/50 hover:bg-slate-50 transition-colors text-left"
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown className="h-5 w-5 shrink-0 text-slate-400" />
                  )}
                  <Globe className="h-4 w-4 shrink-0 text-slate-400" />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800 truncate">{evalLabel(group.evaluation)}</h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {group.missions.length} mission{group.missions.length !== 1 ? "s" : ""}
                      {activeMission && " · 1 active"}
                    </p>
                  </div>
                </button>

                {/* Missions inside the collapsible */}
                {!isCollapsed && (
                  <div className="divide-y divide-slate-100">
                    {group.missions.map((mission) => {
                      const done = mission.tasks.filter((t) => t.status === "done").length;
                      const progress = mission.tasks.length > 0 ? Math.round((done / mission.tasks.length) * 100) : 0;
                      return (
                        <Link
                          key={mission.id}
                          href={`/projects/${projectId}/missions/${mission.id}`}
                          className="block px-5 py-4 hover:bg-blue-50/30 transition"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-medium text-slate-800 truncate">{mission.name}</h4>
                              <div className="mt-2 flex items-center gap-3">
                                <div className="flex-1 max-w-[200px]">
                                  <div className="flex justify-between text-xs text-slate-500">
                                    <span>{done}/{mission.tasks.length} tasks</span>
                                    <span>{progress}%</span>
                                  </div>
                                  <div className="mt-1 h-1.5 rounded-full bg-slate-100">
                                    <div className={`h-1.5 rounded-full ${progress === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${progress}%` }} />
                                  </div>
                                </div>
                                <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize shrink-0 ${
                                  mission.status === "active" ? "bg-blue-100 text-blue-700" :
                                  mission.status === "completed" ? "bg-green-100 text-green-700" :
                                  "bg-slate-100 text-slate-500"
                                }`}>{mission.status}</span>
                                {mission.status !== "active" && mission.status !== "completed" && (
                                  <Button
                                    variant="outline"
                                    onClick={(e) => { e.preventDefault(); activateMission(mission.id, group.evaluation.id); }}
                                    disabled={activatingId === mission.id}
                                    className="shrink-0 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                  >
                                    {activatingId === mission.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Power className="h-3.5 w-3.5" />}
                                    Activate
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : !loading ? (
        <EmptyState
          icon={<Target className="h-7 w-7" />}
          title="No missions yet"
          description={hasEvaluations
            ? "Create a mission from your evaluation to generate an action plan with tasks."
            : "Create an evaluation first, then generate a mission from the evaluation detail page."}
          action={hasEvaluations ? (
            <Link href={`/projects/${projectId}/evaluations`}>
              <Button>
                <ArrowRight className="h-4 w-4" />
                Go to Evaluations
              </Button>
            </Link>
          ) : (
            <Link href={`/projects/${projectId}/evaluations/new`}>
              <Button>
                <Target className="h-4 w-4" />
                New Evaluation
              </Button>
            </Link>
          )}
        />
      ) : (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      )}
    </div>
  );
}
