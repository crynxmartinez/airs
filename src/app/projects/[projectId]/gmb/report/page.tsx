"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2, Printer, ArrowLeft, MapPin, Trophy, TrendingUp } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

interface GmbBusiness {
  placeId: string;
  name: string;
  address: string;
  rating: number;
  reviewsCount: number;
  categoryName: string;
  photoCount: number;
  rank: number;
  isYourBusiness: boolean;
  permanentlyClosed: boolean;
  website: string;
}

interface GmbFinding {
  id: string;
  type: "weakness" | "gap" | "opportunity" | "strength";
  category: string;
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
  metric: string;
  competitorBenchmark?: string;
}

interface GmbRecommendation {
  id: string;
  title: string;
  description: string;
  priority: "critical" | "high" | "medium" | "low";
  effort: "quick" | "moderate" | "significant";
  expectedImpact: string;
  steps: string[];
}

interface ReportData {
  audit: {
    id: string;
    searchQuery: string;
    location: string;
    lpsScore: number;
    rating: string;
    yourRank: number | null;
    totalFound: number;
    avgRating: number;
    avgReviewCount: number;
    createdAt: string;
  };
  businesses: GmbBusiness[];
  findings: GmbFinding[];
  recommendations: GmbRecommendation[];
}

const findingTypeLabels: Record<string, string> = {
  weakness: "Weakness",
  gap: "Gap",
  opportunity: "Opportunity",
  strength: "Strength",
};

const priorityLabels: Record<string, string> = {
  critical: "Critical",
  high: "High Priority",
  medium: "Medium Priority",
  low: "Low Priority",
};

const effortLabels: Record<string, string> = {
  quick: "Quick win (< 1 hour)",
  moderate: "Moderate effort (1-4 hours)",
  significant: "Significant effort (ongoing)",
};

export default function GmbReportPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/gmb/report`)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [projectId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="text-center">
          <MapPin className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="text-slate-500">No GMB audit found.</p>
          <Link href={`/projects/${projectId}/gmb`} className="mt-3 inline-block text-sm text-blue-600 hover:underline">
            Go to Maps Audit
          </Link>
        </div>
      </div>
    );
  }

  const { audit, businesses, findings, recommendations: recs } = data;
  const yourBusiness = businesses.find((b) => b.isYourBusiness);
  const topRated = [...businesses].sort((a, b) => b.rating - a.rating)[0];
  const mostReviewed = [...businesses].sort((a, b) => b.reviewsCount - a.reviewsCount)[0];
  const highImpact = findings.filter((f) => f.impact === "high");
  const reportDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Toolbar */}
      <div className="no-print sticky top-0 z-10 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href={`/projects/${projectId}/gmb`}>
            <Button variant="outline">
              <ArrowLeft className="h-4 w-4" />
              Back to Maps Audit
            </Button>
          </Link>
          <Button onClick={() => window.print()}>
            <Printer className="h-4 w-4" />
            Print / Save as PDF
          </Button>
        </div>
      </div>

      {/* Report document */}
      <div className="mx-auto max-w-4xl bg-white p-12 print:p-0 print:shadow-none shadow-sm print:max-w-none">
        {/* Header */}
        <div className="border-b-2 border-slate-800 pb-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">GMB Maps Audit Report</p>
              <h1 className="mt-1 text-3xl font-bold text-slate-900">
                {audit.searchQuery} — {audit.location}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                Scan date: {new Date(audit.createdAt).toLocaleDateString()} · {audit.totalFound} businesses found
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Report Date</p>
              <p className="mt-1 text-sm text-slate-700">{reportDate}</p>
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <section className="mt-8">
          <h2 className="text-lg font-bold text-slate-900">1. Executive Summary</h2>
          <div className="mt-4 grid grid-cols-4 gap-4">
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">LPS Score</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{audit.lpsScore}/100</p>
              <p className="mt-0.5 text-xs capitalize text-slate-500">{audit.rating}</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Your Rank</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">
                {audit.yourRank ? `#${audit.yourRank}` : "Not found"}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">of {audit.totalFound} results</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Avg Rating</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{audit.avgRating || "—"}</p>
              <p className="mt-0.5 text-xs text-slate-500">across all results</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Avg Reviews</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{audit.avgReviewCount || "—"}</p>
              <p className="mt-0.5 text-xs text-slate-500">per business</p>
            </div>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-600">
            {yourBusiness ? (
              <p>
                <strong>{yourBusiness.name}</strong> ranks <strong>#{yourBusiness.rank}</strong> on Google Maps
                for &quot;{audit.searchQuery}&quot; in {audit.location}, with a rating of{" "}
                <strong>{yourBusiness.rating}/5</strong> and <strong>{yourBusiness.reviewsCount}</strong> reviews.
              </p>
            ) : (
              <p>
                Your business was <strong>not found</strong> in the top {audit.totalFound} results for
                &quot;{audit.searchQuery}&quot; in {audit.location}. This means you are not ranking on Google Maps
                for this query.
              </p>
            )}
            {topRated && topRated.placeId !== yourBusiness?.placeId && (
              <p>
                <strong>{topRated.name}</strong> is the top-rated competitor ({topRated.rating}/5,
                {" "}{topRated.reviewsCount} reviews).
              </p>
            )}
            {highImpact.length > 0 && (
              <p>
                <strong className="text-red-600">{highImpact.length} high-impact finding{highImpact.length > 1 ? "s" : ""}</strong>
                {" "}need immediate attention. See findings below.
              </p>
            )}
            {recs.length > 0 && (
              <p>
                <strong>{recs.length} recommendation{recs.length > 1 ? "s" : ""}</strong> available to improve
                your local pack visibility.
              </p>
            )}
          </div>
        </section>

        {/* Competitor Comparison */}
        {businesses.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-slate-900">2. Competitor Comparison</h2>
            <p className="mt-1 text-sm text-slate-500">
              Google Maps results for &quot;{audit.searchQuery}&quot; in {audit.location}
            </p>
            <table className="mt-4 w-full text-sm border border-slate-200">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-500">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Business</th>
                  <th className="px-3 py-2">Rating</th>
                  <th className="px-3 py-2">Reviews</th>
                  <th className="px-3 py-2">Photos</th>
                  <th className="px-3 py-2">Category</th>
                </tr>
              </thead>
              <tbody>
                {businesses.map((biz) => (
                  <tr key={biz.placeId || biz.rank} className={`border-b border-slate-100 ${biz.isYourBusiness ? "bg-blue-50" : ""}`}>
                    <td className="px-3 py-2.5">
                      <span className={`text-xs font-bold ${biz.isYourBusiness ? "text-blue-600" : "text-slate-400"}`}>
                        #{biz.rank}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <p className={`font-medium ${biz.isYourBusiness ? "text-blue-800" : "text-slate-800"}`}>
                        {biz.name}
                        {biz.isYourBusiness && <span className="ml-1 text-xs text-blue-500">(You)</span>}
                      </p>
                      {biz.address && <p className="text-[10px] text-slate-400">{biz.address}</p>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`font-bold ${biz.rating >= 4.5 ? "text-green-600" : biz.rating >= 4 ? "text-blue-600" : biz.rating > 0 ? "text-yellow-600" : "text-slate-300"}`}>
                        {biz.rating > 0 ? biz.rating : "—"}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{biz.reviewsCount}</td>
                    <td className="px-3 py-2.5 text-slate-600">{biz.photoCount}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">{biz.categoryName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Your Business Detail */}
        {yourBusiness && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-slate-900">3. Your Business Profile</h2>
            <table className="mt-4 w-full text-sm">
              <tbody className="divide-y divide-slate-100">
                <tr><td className="py-2 font-medium text-slate-500">Business Name</td><td className="py-2">{yourBusiness.name}</td></tr>
                <tr><td className="py-2 font-medium text-slate-500">Rank</td><td className="py-2">#{yourBusiness.rank} of {audit.totalFound}</td></tr>
                <tr><td className="py-2 font-medium text-slate-500">Rating</td><td className="py-2">{yourBusiness.rating} / 5</td></tr>
                <tr><td className="py-2 font-medium text-slate-500">Reviews</td><td className="py-2">{yourBusiness.reviewsCount}</td></tr>
                <tr><td className="py-2 font-medium text-slate-500">Photos</td><td className="py-2">{yourBusiness.photoCount}</td></tr>
                <tr><td className="py-2 font-medium text-slate-500">Category</td><td className="py-2">{yourBusiness.categoryName}</td></tr>
                <tr><td className="py-2 font-medium text-slate-500">Address</td><td className="py-2">{yourBusiness.address}</td></tr>
                <tr><td className="py-2 font-medium text-slate-500">Website</td><td className="py-2">{yourBusiness.website || "—"}</td></tr>
              </tbody>
            </table>
          </section>
        )}

        {/* Findings */}
        {findings.length > 0 && (
          <section className="mt-8 break-before-page">
            <h2 className="text-lg font-bold text-slate-900">4. Findings ({findings.length})</h2>
            <div className="mt-4 space-y-3">
              {findings.map((f) => (
                <div key={f.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <span className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${
                      f.impact === "high" ? "bg-red-100 text-red-700" :
                      f.impact === "medium" ? "bg-yellow-100 text-yellow-700" :
                      "bg-green-100 text-green-700"
                    }`}>{f.impact} impact</span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                      {findingTypeLabels[f.type] || f.type}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm font-semibold text-slate-800">{f.title}</p>
                  <p className="mt-1 text-sm text-slate-600">{f.description}</p>
                  {f.competitorBenchmark && (
                    <p className="mt-1 text-xs text-slate-500">
                      <span className="font-medium">Benchmark:</span> {f.competitorBenchmark}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    <span className="font-medium">Metric:</span> {f.metric}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Recommendations */}
        {recs.length > 0 && (
          <section className="mt-8 break-before-page">
            <h2 className="text-lg font-bold text-slate-900">5. Action Plans ({recs.length})</h2>
            <div className="mt-4 space-y-4">
              {recs.map((rec, i) => (
                <div key={rec.id} className="rounded-lg border border-slate-200 p-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800">{i + 1}.</span>
                    <p className="text-sm font-semibold text-slate-800">{rec.title}</p>
                    <span className={`rounded px-2 py-0.5 text-xs ${
                      rec.priority === "critical" ? "bg-red-100 text-red-700" :
                      rec.priority === "high" ? "bg-orange-100 text-orange-700" :
                      rec.priority === "medium" ? "bg-blue-100 text-blue-700" :
                      "bg-slate-100 text-slate-600"
                    }`}>{priorityLabels[rec.priority] || rec.priority}</span>
                  </div>
                  {rec.description && <p className="mt-1 text-sm text-slate-600">{rec.description}</p>}
                  {rec.expectedImpact && (
                    <p className="mt-1 text-xs font-medium text-green-600">Expected: {rec.expectedImpact}</p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">{effortLabels[rec.effort] || rec.effort}</p>
                  {rec.steps.length > 0 && (
                    <div className="mt-3 rounded-lg bg-slate-50 p-3">
                      <p className="mb-2 text-xs font-semibold text-slate-700">Steps:</p>
                      <ol className="space-y-1.5">
                        {rec.steps.map((step, si) => (
                          <li key={si} className="flex items-start gap-2 text-xs text-slate-600">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                              {si + 1}
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="mt-12 border-t border-slate-200 pt-4 text-center">
          <p className="text-xs text-slate-400">
            Generated by Airs CRM — GMB Maps Audit Report — {reportDate}
          </p>
        </div>
      </div>

      {/* Print styles */}
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          @page { margin: 1in; }
          section { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
