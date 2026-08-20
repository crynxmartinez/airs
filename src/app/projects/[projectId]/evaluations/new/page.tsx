"use client";

import { useParams } from "next/navigation";
import { EvaluationWizard } from "@/components/evaluation-wizard/wizard";

export default function NewEvaluationPage() {
  const params = useParams();
  const projectId = params.projectId as string;

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
