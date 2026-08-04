"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/empty-state";

export default function GmbKeywordsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href={`/projects/${projectId}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Local Keywords</h1>
          <p className="mt-0.5 text-sm text-slate-500">Track keywords that trigger Google Maps and local pack results</p>
        </div>
      </div>
      <EmptyState
        icon={<TrendingUp className="h-7 w-7" />}
          title="Local keyword tracking coming soon"
          description="This feature will track your rankings for local search queries like 'plumber near me', 'plumber [city]', and service-specific local keywords."
      />
    </div>
  );
}
