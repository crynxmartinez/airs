"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, TrendingUp, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

interface GmbAuditRecord {
  id: string;
  search_query: string;
  location: string;
  lps_score: number;
  rating: string;
  your_rank: number | null;
  total_found: number;
  avg_rating: number;
  avg_review_count: number;
  created_at: string;
}

export default function GmbRankTrackingPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [audits, setAudits] = useState<GmbAuditRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/gmb/audits`);
        if (res.ok) {
          const json = await res.json();
          setAudits(json);
        }
      } catch {
        // no data
      }
      if (active) setLoading(false);
    })();
    return () => { active = false; };
  }, [projectId]);

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
          <h1 className="text-2xl font-bold text-slate-900">Rank Tracking</h1>
          <p className="mt-0.5 text-sm text-slate-500">Track your Google Maps ranking and LPS score over time</p>
        </div>
      </div>

      {audits.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="h-7 w-7" />}
          title="No rank data yet"
          description="Run a Maps Audit scan to start tracking your Google Maps ranking and LPS score over time. Each scan is stored historically."
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
          {/* Trend chart placeholder */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-sm font-semibold text-slate-800 mb-4">LPS Score Trend</h2>
            <div className="flex items-end gap-3 h-40">
              {audits.map((audit) => {
                const height = `${audit.lps_score}%`;
                const color = audit.lps_score >= 80 ? "bg-green-500" : audit.lps_score >= 60 ? "bg-blue-500" : audit.lps_score >= 40 ? "bg-yellow-500" : "bg-red-500";
                return (
                  <div key={audit.id} className="flex flex-1 flex-col items-center gap-1">
                    <span className="text-xs font-bold text-slate-600">{audit.lps_score}</span>
                    <div className="flex w-full items-end justify-center" style={{ height: "100%" }}>
                      <div className={`w-full max-w-[60px] rounded-t ${color}`} style={{ height }} />
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {new Date(audit.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* History table */}
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Query</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">LPS Score</th>
                  <th className="px-4 py-3">Your Rank</th>
                  <th className="px-4 py-3">Avg Rating</th>
                  <th className="px-4 py-3">Avg Reviews</th>
                </tr>
              </thead>
              <tbody>
                {audits.map((audit) => (
                  <tr key={audit.id} className="border-b border-slate-50 hover:bg-slate-50">
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(audit.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{audit.search_query}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{audit.location}</td>
                    <td className="px-4 py-3">
                      <span className={`text-sm font-bold ${
                        audit.lps_score >= 80 ? "text-green-600" :
                        audit.lps_score >= 60 ? "text-blue-600" :
                        audit.lps_score >= 40 ? "text-yellow-600" : "text-red-500"
                      }`}>
                        {audit.lps_score}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-slate-700">
                      {audit.your_rank ? `#${audit.your_rank}` : "—"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">{audit.avg_rating || "—"}</td>
                    <td className="px-4 py-3 text-sm text-slate-600">{audit.avg_review_count || "—"}</td>
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
