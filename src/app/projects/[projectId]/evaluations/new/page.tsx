"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { EvaluationWizard } from "@/components/evaluation-wizard/wizard";
import type { Evaluation } from "@/types";

export default function NewEvaluationPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetch("/api/evaluations")
      .then((r) => r.json())
      .then((data) => {
        const existing = Array.isArray(data)
          ? data.find((ev: Evaluation) => ev.project_id === projectId)
          : null;
        if (existing) {
          router.replace(`/projects/${projectId}/evaluations/${existing.id}`);
        } else {
          setChecking(false);
        }
      })
      .catch(() => setChecking(false));
  }, [projectId, router]);

  if (checking) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">New Evaluation</h1>
        <p className="mt-1 text-sm text-slate-500">
          Analyze competitors for a search query and find their weaknesses
        </p>
      </div>
      <EvaluationWizard projectId={projectId} />
    </div>
  );
}
