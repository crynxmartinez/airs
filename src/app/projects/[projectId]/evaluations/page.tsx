"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ClipboardList, Plus, Trash2 } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";
import type { Evaluation } from "@/types";

interface EvaluationWithCounts extends Evaluation {
  competitor_count: number;
  evidence_count: number;
}

export default function ProjectEvaluationsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [evaluations, setEvaluations] = useState<EvaluationWithCounts[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<EvaluationWithCounts | null>(null);

  useEffect(() => {
    fetch("/api/evaluations")
      .then((r) => r.json())
      .then((data) => {
        const projectEvals = Array.isArray(data) ? data.filter((ev: Evaluation) => ev.project_id === projectId) : [];
        setEvaluations(projectEvals);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [projectId]);

  async function handleDelete(evId: string) {
    await fetch(`/api/evaluations/${evId}`, { method: "DELETE" });
    setEvaluations(evaluations.filter((e) => e.id !== evId));
    setDeleteTarget(null);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Evaluations</h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage competitor analysis evaluations for this project
          </p>
        </div>
        <Link href={`/projects/${projectId}/evaluations/new`}>
          <Button>
            <Plus className="h-4 w-4" />
            New Evaluation
          </Button>
        </Link>
      </div>

      {evaluations.length > 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
                <th className="px-5 py-2.5">Query</th>
                <th className="px-5 py-2.5">Intent</th>
                <th className="px-5 py-2.5">Status</th>
                <th className="px-5 py-2.5">Competitors</th>
                <th className="px-5 py-2.5">Evidence</th>
                <th className="px-5 py-2.5">Score</th>
                <th className="px-5 py-2.5">Date</th>
                <th className="px-5 py-2.5"></th>
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
                  <td className="px-5 py-3 capitalize text-slate-600">{ev.search_intent}</td>
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
                  <td className="px-5 py-3">
                    <button
                      onClick={() => setDeleteTarget(ev)}
                      className="text-slate-300 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        !loading && (
          <EmptyState
            icon={<ClipboardList className="h-7 w-7" />}
            title="No evaluations found"
            description="Create an evaluation to analyze competitors for a specific search query."
            action={
              <Link href={`/projects/${projectId}/evaluations/new`}>
                <Button>
                  <Plus className="h-4 w-4" />
                  Start New Evaluation
                </Button>
              </Link>
            }
          />
        )
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete evaluation?"
        message={`"${deleteTarget?.primary_query}" and all its data — competitors, evidence, findings, recommendations, and missions — will be permanently deleted. This cannot be undone.`}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget.id)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
