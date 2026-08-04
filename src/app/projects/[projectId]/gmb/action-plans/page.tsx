"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ClipboardList, Loader2, CheckCircle2, Circle, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

interface GmbRecommendation {
  id: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  effort: "quick" | "moderate" | "significant";
  expectedImpact: string;
  steps: string[];
  findingIds: string[];
}

const priorityConfig = {
  critical: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Critical" },
  high: { color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", label: "High Priority" },
  medium: { color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", label: "Medium Priority" },
  low: { color: "text-slate-600", bg: "bg-slate-50", border: "border-slate-200", label: "Low Priority" },
};

const effortConfig = {
  quick: "Quick win (< 1 hour)",
  moderate: "Moderate effort (1-4 hours)",
  significant: "Significant effort (ongoing)",
};

export default function GmbActionPlansPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [recommendations, setRecommendations] = useState<GmbRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/gmb`);
        if (res.ok) {
          // Try to load from latest GMB audit
          const auditRes = await fetch(`/api/projects/${projectId}/gmb/audit`);
          if (auditRes.ok) {
            const auditJson = await auditRes.json();
            if (auditJson.recommendations) {
              setRecommendations(auditJson.recommendations);
            }
          }
        }
      } catch {
        // no data yet
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [projectId]);

  function toggleStep(recId: string, stepIndex: number) {
    const key = `${recId}-${stepIndex}`;
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/projects/${projectId}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">GMB Action Plans</h1>
          <p className="mt-0.5 text-sm text-slate-500">Step-by-step plans to improve your Google Maps ranking</p>
        </div>
      </div>

      {recommendations.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-7 w-7" />}
          title="No action plans yet"
          description="Run a Maps Audit scan first to generate personalized action plans for your GMB profile."
          action={
            <Link href={`/projects/${projectId}/gmb`}>
              <Button>
                <MapPin className="h-4 w-4" />
                Go to Maps Audit
              </Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-4">
          {recommendations.map((rec) => {
            const pc = priorityConfig[rec.priority];
            const totalSteps = rec.steps.length;
            const doneSteps = rec.steps.filter((_, i) => completedSteps.has(`${rec.id}-${i}`)).length;
            const progress = Math.round((doneSteps / totalSteps) * 100);

            return (
              <div key={rec.id} className={`rounded-xl border ${pc.border} ${pc.bg} p-5`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${pc.color} ${pc.bg} border ${pc.border}`}>
                        {pc.label}
                      </span>
                      <span className="text-[10px] text-slate-400">{effortConfig[rec.effort]}</span>
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-slate-800">{rec.title}</p>
                    <p className="mt-1 text-xs text-slate-600">{rec.description}</p>
                    <p className="mt-1.5 text-xs text-slate-500">
                      <span className="font-medium">Expected impact:</span> {rec.expectedImpact}
                    </p>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="mb-3 flex items-center gap-2">
                  <div className="h-2 flex-1 rounded-full bg-slate-200">
                    <div
                      className={`h-2 rounded-full transition-all ${progress === 100 ? "bg-green-500" : "bg-blue-500"}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-slate-500">{doneSteps}/{totalSteps}</span>
                </div>

                {/* Steps */}
                <div className="space-y-1.5">
                  {rec.steps.map((step, i) => {
                    const stepKey = `${rec.id}-${i}`;
                    const done = completedSteps.has(stepKey);
                    return (
                      <button
                        key={i}
                        onClick={() => toggleStep(rec.id, i)}
                        className="flex w-full items-start gap-2.5 rounded-lg bg-white/80 p-2.5 text-left transition-colors hover:bg-white"
                      >
                        {done ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-slate-300 mt-0.5" />
                        )}
                        <span className={`text-xs ${done ? "text-slate-400 line-through" : "text-slate-700"}`}>
                          {step}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
