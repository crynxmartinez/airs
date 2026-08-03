"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  Sparkles, Loader2, AlertCircle, ArrowLeft, CheckCircle2, AlertTriangle,
  XCircle, RefreshCw, FileText, Bot,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

interface GeoCheck {
  code: string;
  label: string;
  description: string;
  status: "pass" | "fail" | "warn";
  value: string;
  recommendation: string;
  weight: number;
}

interface GeoResult {
  score: number;
  rating: "excellent" | "good" | "fair" | "poor";
  checks: GeoCheck[];
  summary: { passed: number; warnings: number; failed: number };
  siteUrl: string;
  evaluationId: string;
  primaryQuery: string;
}

const ratingConfig = {
  excellent: { label: "Excellent", color: "text-green-600", bg: "bg-green-50", ring: "ring-green-200", bar: "bg-green-500" },
  good: { label: "Good", color: "text-blue-600", bg: "bg-blue-50", ring: "ring-blue-200", bar: "bg-blue-500" },
  fair: { label: "Fair", color: "text-yellow-600", bg: "bg-yellow-50", ring: "ring-yellow-200", bar: "bg-yellow-500" },
  poor: { label: "Poor", color: "text-red-600", bg: "bg-red-50", ring: "ring-red-200", bar: "bg-red-500" },
};

const statusConfig = {
  pass: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", border: "border-green-200", label: "Pass" },
  warn: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200", label: "Warning" },
  fail: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Fail" },
};

export default function GeoReadinessPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [data, setData] = useState<GeoResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);

  async function loadGeo() {
    try {
      const res = await fetch(`/api/projects/${projectId}/geo`);
      if (!res.ok) {
        setError(true);
        setData(null);
        return;
      }
      const json = await res.json();
      setData(json);
      setError(false);
    } catch {
      setError(true);
      setData(null);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      await loadGeo();
      if (active) setLoading(false);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadGeo();
    setRefreshing(false);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">GEO Readiness</h1>
            <p className="mt-0.5 text-sm text-slate-500">AI Search Visibility Analysis</p>
          </div>
        </div>
        <EmptyState
          icon={<Sparkles className="h-7 w-7" />}
          title="No evaluation found"
          description="Create an evaluation and crawl your site first to see your GEO Readiness score."
          action={
            <Link href={`/projects/${projectId}/evaluations/new`}>
              <Button>
                <FileText className="h-4 w-4" />
                New Evaluation
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  const rc = ratingConfig[data.rating];
  const failedChecks = data.checks.filter((c) => c.status === "fail");
  const warnChecks = data.checks.filter((c) => c.status === "warn");
  const passedChecks = data.checks.filter((c) => c.status === "pass");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">GEO Readiness</h1>
            <p className="mt-0.5 text-sm text-slate-500">AI Search Visibility Analysis — {data.primaryQuery}</p>
          </div>
        </div>
        <Button variant="outline" onClick={handleRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {/* Score Card */}
      <div className={`rounded-2xl border-2 ${rc.ring} ${rc.bg} p-6`}>
        <div className="flex items-center gap-6">
          {/* Score circle */}
          <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
            <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128">
              <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200" />
              <circle
                cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8"
                className={rc.color}
                strokeDasharray={`${(data.score / 100) * 351.86} 351.86`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute flex flex-col items-center">
              <span className={`text-3xl font-bold ${rc.color}`}>{data.score}</span>
              <span className="text-xs text-slate-400">/ 100</span>
            </div>
          </div>

          {/* Rating + summary */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <Sparkles className={`h-5 w-5 ${rc.color}`} />
              <span className={`text-lg font-bold ${rc.color}`}>{rc.label}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {data.score >= 80
                ? "Your site is well-optimized for AI search engines. AI systems are likely to find and cite your content."
                : data.score >= 60
                  ? "Your site has good AI visibility foundations. Fix the remaining issues to improve your chances of being cited."
                : data.score >= 40
                  ? "Your site has significant gaps for AI search visibility. Focus on the failed checks below."
                  : "Your site is not optimized for AI search. Address the critical issues below to start appearing in AI answers."}
            </p>
            <div className="mt-3 flex gap-4">
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium text-slate-700">{data.summary.passed} passed</span>
              </div>
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
                <span className="text-sm font-medium text-slate-700">{data.summary.warnings} warnings</span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm font-medium text-slate-700">{data.summary.failed} failed</span>
              </div>
            </div>
            {data.siteUrl && (
              <p className="mt-2 text-xs text-slate-400">Analyzed: {data.siteUrl}</p>
            )}
          </div>
        </div>
      </div>

      {/* Failed Checks */}
      {failedChecks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-red-700">Critical Issues ({failedChecks.length})</h2>
          {failedChecks.map((check) => {
            const sc = statusConfig[check.status];
            const Icon = sc.icon;
            return (
              <div key={check.code} className={`rounded-xl border ${sc.border} ${sc.bg} p-4`}>
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 shrink-0 ${sc.color} mt-0.5`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">{check.label}</p>
                      <span className="text-xs font-medium text-slate-400">{check.weight} pts</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{check.description}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      <span className="font-medium">Current:</span> {check.value}
                    </p>
                    <div className="mt-2 rounded-lg bg-white/80 p-2.5">
                      <p className="text-xs text-slate-700">
                        <span className="font-semibold text-slate-800">Fix:</span> {check.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Warnings */}
      {warnChecks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-yellow-700">Warnings ({warnChecks.length})</h2>
          {warnChecks.map((check) => {
            const sc = statusConfig[check.status];
            const Icon = sc.icon;
            return (
              <div key={check.code} className={`rounded-xl border ${sc.border} ${sc.bg} p-4`}>
                <div className="flex items-start gap-3">
                  <Icon className={`h-5 w-5 shrink-0 ${sc.color} mt-0.5`} />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-800">{check.label}</p>
                      <span className="text-xs font-medium text-slate-400">{check.weight} pts</span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{check.description}</p>
                    <p className="mt-1 text-xs text-slate-600">
                      <span className="font-medium">Current:</span> {check.value}
                    </p>
                    <div className="mt-2 rounded-lg bg-white/80 p-2.5">
                      <p className="text-xs text-slate-700">
                        <span className="font-semibold text-slate-800">Tip:</span> {check.recommendation}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Passed Checks */}
      {passedChecks.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-green-700">Passed ({passedChecks.length})</h2>
          <div className="flex flex-wrap gap-2">
            {passedChecks.map((check) => (
              <span key={check.code} className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 border border-green-200">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {check.label}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* AI Crawler Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="h-5 w-5 text-blue-500" />
          <h2 className="text-sm font-semibold text-slate-800">AI Crawler Access</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          These AI crawlers scan the web to build answers. If blocked in robots.txt, your content won&apos;t appear in their responses.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {[
            { name: "ChatGPT", crawler: "GPTBot" },
            { name: "Perplexity", crawler: "PerplexityBot" },
            { name: "Claude", crawler: "ClaudeBot" },
            { name: "Google AI", crawler: "Google-Extended" },
            { name: "Amazon", crawler: "Amazonbot" },
            { name: "ByteDance", crawler: "Bytespider" },
          ].map((ai) => {
            const geo12 = data.checks.find((c) => c.code === "GEO-12");
            const isBlocked = geo12?.value.includes("Blocked") && geo12?.value.includes(ai.name);
            const isAllowed = geo12?.value.includes("Allowed") && geo12?.value.includes(ai.name);
            return (
              <div
                key={ai.crawler}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 ${
                  isBlocked ? "border-red-200 bg-red-50" :
                  isAllowed ? "border-green-200 bg-green-50" :
                  "border-slate-200 bg-slate-50"
                }`}
              >
                {isBlocked ? <XCircle className="h-4 w-4 text-red-500" /> :
                 isAllowed ? <CheckCircle2 className="h-4 w-4 text-green-500" /> :
                 <AlertCircle className="h-4 w-4 text-slate-400" />}
                <div>
                  <p className="text-xs font-medium text-slate-700">{ai.name}</p>
                  <p className="text-[10px] text-slate-400">{ai.crawler}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Link to evaluation */}
      <div className="flex justify-end">
        <Link href={`/projects/${projectId}/evaluations/${data.evaluationId}`}>
          <Button variant="outline">
            <FileText className="h-4 w-4" />
            View Full Evaluation
          </Button>
        </Link>
      </div>
    </div>
  );
}
