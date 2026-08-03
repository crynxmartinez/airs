"use client";

import { useState } from "react";
import { Search, Loader2, CheckCircle2, AlertTriangle, AlertCircle, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";

interface AuditCheck {
  category: string;
  name: string;
  status: "pass" | "warn" | "fail";
  score: number;
  value: string;
  detail: string;
  recommendation: string;
}

interface AuditResult {
  url: string;
  title: string;
  description: string;
  total_score: number;
  checks: AuditCheck[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
}

const categoryColors: Record<string, string> = {
  Technical: "text-blue-600 bg-blue-50",
  Structural: "text-purple-600 bg-purple-50",
  "Meta Tags": "text-indigo-600 bg-indigo-50",
  Content: "text-green-600 bg-green-50",
  Trust: "text-orange-600 bg-orange-50",
  UX: "text-pink-600 bg-pink-50",
  Ecosystem: "text-teal-600 bg-teal-50",
};

export default function AuditPage() {
  const [url, setUrl] = useState("");
  const [auditing, setAuditing] = useState(false);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAudit() {
    if (!url) return;
    setAuditing(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Audit failed");
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Audit failed");
    }
    setAuditing(false);
  }

  const groupedChecks = result?.checks.reduce((acc, check) => {
    if (!acc[check.category]) acc[check.category] = [];
    acc[check.category].push(check);
    return acc;
  }, {} as Record<string, AuditCheck[]>) || {};

  const scoreColor = result
    ? result.total_score >= 80 ? "text-green-600"
    : result.total_score >= 60 ? "text-yellow-600"
    : result.total_score >= 40 ? "text-orange-600"
    : "text-red-600"
    : "";

  const scoreBg = result
    ? result.total_score >= 80 ? "bg-green-500"
    : result.total_score >= 60 ? "bg-yellow-500"
    : result.total_score >= 40 ? "bg-orange-500"
    : "bg-red-500"
    : "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Website Audit</h1>
        <p className="mt-1 text-sm text-slate-500">Automated SEO and AI-readiness audit — checks 25+ factors in seconds</p>
      </div>

      {/* URL Input */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="url"
              placeholder="https://yourwebsite.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runAudit()}
              className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm focus:border-blue-400 focus:outline-none"
            />
          </div>
          <Button onClick={runAudit} disabled={auditing || !url}>
            {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            Audit
          </Button>
        </div>
        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-4">
          {/* Score Card */}
          <div className="rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{result.title || result.url}</h2>
                <p className="mt-0.5 text-sm text-slate-500">{result.url}</p>
              </div>
              <div className="text-right">
                <p className={`text-4xl font-bold ${scoreColor}`}>{result.total_score}<span className="text-lg text-slate-400">/100</span></p>
              </div>
            </div>
            <div className="mt-3 h-3 rounded-full bg-slate-100">
              <div className={`h-3 rounded-full transition-all ${scoreBg}`} style={{ width: `${result.total_score}%` }} />
            </div>
            <div className="mt-3 flex gap-4">
              <span className="flex items-center gap-1.5 text-sm"><CheckCircle2 className="h-4 w-4 text-green-500" /> {result.summary.passed} passed</span>
              <span className="flex items-center gap-1.5 text-sm"><AlertTriangle className="h-4 w-4 text-yellow-500" /> {result.summary.warnings} warnings</span>
              <span className="flex items-center gap-1.5 text-sm"><AlertCircle className="h-4 w-4 text-red-500" /> {result.summary.failed} failed</span>
            </div>
          </div>

          {/* Checks by Category */}
          {Object.entries(groupedChecks).map(([category, checks]) => (
            <div key={category} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-3">
                <span className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${categoryColors[category] || "text-slate-600 bg-slate-50"}`}>
                  {category}
                </span>
              </div>
              <div className="divide-y divide-slate-50">
                {checks.map((check, i) => (
                  <div key={i} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      {check.status === "pass" ? (
                        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                      ) : check.status === "warn" ? (
                        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
                      ) : (
                        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                      )}
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <h3 className="text-sm font-semibold text-slate-800">{check.name}</h3>
                          <span className="text-xs font-medium text-slate-400">{check.value}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">{check.detail}</p>
                        {check.recommendation && (
                          <p className="mt-1.5 rounded-lg bg-blue-50 px-3 py-1.5 text-xs text-blue-700">
                            <span className="font-semibold">Fix: </span>{check.recommendation}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
