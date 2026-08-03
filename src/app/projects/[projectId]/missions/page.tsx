"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Target, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import type { Mission, MissionTask } from "@/types";

interface MissionWithTasks extends Mission {
  tasks: MissionTask[];
}

export default function ProjectMissionsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [missions, setMissions] = useState<MissionWithTasks[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/missions").then((r) => r.json()),
    ]).then(async ([m]) => {
      const missionList = Array.isArray(m) ? m : [];
      const withTasks = await Promise.all(
        missionList.map(async (mission: Mission) => {
          const res = await fetch(`/api/missions/${mission.id}`);
          return res.json();
        })
      );
      setMissions(withTasks);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [projectId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Missions</h1>
        <p className="mt-1 text-sm text-slate-500">Action plans built from evaluation recommendations</p>
      </div>

      {!loading && missions.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {missions.map((mission) => {
            const done = mission.tasks.filter((t) => t.status === "done").length;
            const progress = mission.tasks.length > 0 ? Math.round((done / mission.tasks.length) * 100) : 0;
            return (
              <Link key={mission.id} href={`/projects/${projectId}/missions/${mission.id}`}
                className="rounded-xl border border-slate-200 bg-white p-5 hover:border-blue-300 hover:shadow-sm transition">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-slate-800">{mission.name}</h3>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                    mission.status === "active" ? "bg-blue-100 text-blue-700" :
                    mission.status === "completed" ? "bg-green-100 text-green-700" :
                    "bg-slate-100 text-slate-500"
                  }`}>{mission.status}</span>
                </div>
                <div className="mt-3">
                  <div className="flex justify-between text-xs text-slate-500">
                    <span>{done}/{mission.tasks.length} tasks</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="mt-1 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-blue-500" style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : !loading ? (
        <EmptyState
          icon={<Target className="h-7 w-7" />}
          title="No missions yet"
          description="Complete an evaluation and generate recommendations, then create a mission from the evaluation detail page."
        />
      ) : (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      )}
    </div>
  );
}
