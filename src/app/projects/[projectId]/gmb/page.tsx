"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  MapPin, Loader2, ArrowLeft, CheckCircle2, AlertTriangle,
  XCircle, RefreshCw, FileText, Star, Search, Trophy, TrendingUp,
  Globe, Sparkles, Lightbulb,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

interface GmbCheck {
  code: string;
  label: string;
  description: string;
  status: "pass" | "fail" | "warn";
  value: string;
  recommendation: string;
  weight: number;
  category: "profile" | "website" | "content" | "reviews";
}

interface GmbResult {
  score: number;
  rating: "excellent" | "good" | "fair" | "poor";
  checks: GmbCheck[];
  summary: { passed: number; warnings: number; failed: number };
  categoryScores: { profile: number; website: number; content: number; reviews: number };
  siteUrl: string;
  evaluationId: string;
  primaryQuery: string;
}

interface GmbBusiness {
  placeId: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number;
  reviewsCount: number;
  categoryName: string;
  categories: string[];
  isOpen: boolean;
  openingHours: string[];
  latitude: number;
  longitude: number;
  url: string;
  photoCount: number;
  reviewCount: number;
  questionCount: number;
  description: string;
  neighborhood: string;
  city: string;
  state: string;
  postalCode: string;
  countryCode: string;
  priceLevel: string;
  temporarilyClosed: boolean;
  permanentlyClosed: boolean;
  rank: number;
}

interface GmbScrapeAnalysis {
  yourBusiness: GmbBusiness | null;
  competitors: GmbBusiness[];
  rankInResults: number | null;
  avgRating: number;
  avgReviewCount: number;
  topRated: GmbBusiness | null;
  mostReviewed: GmbBusiness | null;
}

interface LpsCheck {
  code: string;
  label: string;
  description: string;
  status: "pass" | "fail" | "warn";
  value: string;
  recommendation: string;
  weight: number;
  category: "reviews" | "profile" | "ranking" | "engagement";
}

interface LpsScoreResult {
  score: number;
  rating: "excellent" | "good" | "fair" | "poor";
  checks: LpsCheck[];
  summary: { passed: number; warnings: number; failed: number };
  categoryScores: { reviews: number; profile: number; ranking: number; engagement: number };
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
  findingIds: string[];
}

interface GmbScrapeResponse {
  businesses: GmbBusiness[];
  totalFound: number;
  searchQuery: string;
  location: string;
  analysis: GmbScrapeAnalysis;
  scoreResult: LpsScoreResult;
  findings: GmbFinding[];
  recommendations: GmbRecommendation[];
  auditId: string;
  evaluationId: string;
}

const ratingConfig = {
  excellent: { label: "Excellent", color: "text-green-600", bg: "bg-green-50", ring: "ring-green-200" },
  good: { label: "Good", color: "text-blue-600", bg: "bg-blue-50", ring: "ring-blue-200" },
  fair: { label: "Fair", color: "text-yellow-600", bg: "bg-yellow-50", ring: "ring-yellow-200" },
  poor: { label: "Poor", color: "text-red-600", bg: "bg-red-50", ring: "ring-red-200" },
};

const statusConfig = {
  pass: { icon: CheckCircle2, color: "text-green-600", bg: "bg-green-50", border: "border-green-200", label: "Pass" },
  warn: { icon: AlertTriangle, color: "text-yellow-600", bg: "bg-yellow-50", border: "border-yellow-200", label: "Warning" },
  fail: { icon: XCircle, color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Fail" },
};

const categoryLabels = {
  profile: "GMB Profile",
  website: "Website Technical",
  content: "Content & Services",
  reviews: "Reviews & Trust",
};

const lpsCategoryLabels = {
  reviews: "Reviews",
  profile: "Profile",
  ranking: "Ranking",
  engagement: "Engagement",
};

const findingTypeConfig = {
  weakness: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200", label: "Weakness" },
  gap: { color: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200", label: "Gap" },
  opportunity: { color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", label: "Opportunity" },
  strength: { color: "text-green-600", bg: "bg-green-50", border: "border-green-200", label: "Strength" },
};

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

export default function GmbProfileAuditPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [data, setData] = useState<GmbResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [scrapeData, setScrapeData] = useState<GmbScrapeResponse | null>(null);
  const [scrapeError, setScrapeError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [location, setLocation] = useState("");
  const [hasScanned, setHasScanned] = useState(false);
  const [showScanForm, setShowScanForm] = useState(false);

  // Scan form — URL analysis + query suggestions
  const [scanUrl, setScanUrl] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<{ query: string; type: string }[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<{ title: string; domain: string; businessName: string } | null>(null);

  async function loadGmb() {
    try {
      const res = await fetch(`/api/projects/${projectId}/gmb`);
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
      // Fetch project to get target_location
      try {
        const projRes = await fetch(`/api/projects/${projectId}`);
        if (projRes.ok) {
          const proj = await projRes.json();
          if (proj.target_location) setLocation(proj.target_location);
        }
      } catch {}
      // Check if a previous GMB scrape audit exists
      try {
        const auditRes = await fetch(`/api/projects/${projectId}/gmb/audits`);
        if (auditRes.ok) {
          const audits = await auditRes.json();
          if (Array.isArray(audits) && audits.length > 0) {
            setHasScanned(true);
          }
        }
      } catch {}
      // Also load AIRS-derived GMB readiness (secondary data)
      await loadGmb();
      if (active) setLoading(false);
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Pre-fill the URL from evaluation data once, without a synchronous setState in an
  // effect (which triggers a cascading render). The ref makes it a one-shot.
  const prefilled = useRef(false);
  useEffect(() => {
    if (prefilled.current || !data?.siteUrl) return;
    prefilled.current = true;
    setScanUrl((current) => current || data.siteUrl);
  }, [data]);

  async function analyzeScanUrl() {
    if (!scanUrl) return;
    setAnalyzing(true);
    setSuggestError(null);
    setSuggestions([]);
    setPageInfo(null);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scanUrl }),
      });
      const d = await res.json();
      if (d.error) {
        setSuggestError(d.error);
      } else {
        setSuggestions(d.suggestions || []);
        setPageInfo({
          title: d.pageTitle || "",
          domain: d.domain || "",
          businessName: d.businessName || "",
        });
        if (!searchQuery && d.suggestions?.length > 0) {
          setSearchQuery(d.suggestions[0].query);
        }
      }
    } catch {
      setSuggestError("Could not analyze this URL. You can still type a query manually.");
    }
    setAnalyzing(false);
  }

  async function handleRefresh() {
    setRefreshing(true);
    await loadGmb();
    setRefreshing(false);
  }

  async function handleScrape() {
    if (!searchQuery || !location) return;
    setScrapeLoading(true);
    setScrapeError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/gmb/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ searchQuery, location, maxResults: 20 }),
      });
      if (!res.ok) {
        const err = await res.json();
        setScrapeError(err.error || "Scrape failed");
        setScrapeData(null);
      } else {
        const json = await res.json();
        setScrapeData(json);
        setScrapeError(null);
        setHasScanned(true);
        setShowScanForm(false);
      }
    } catch {
      setScrapeError("Failed to connect to GMB scraper");
      setScrapeData(null);
    }
    setScrapeLoading(false);
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
            <h1 className="text-2xl font-bold text-slate-900">Maps Audit</h1>
            <p className="mt-0.5 text-sm text-slate-500">Google Maps Competitor Scan & Local Pack Visibility</p>
          </div>
        </div>
        <EmptyState
          icon={<MapPin className="h-7 w-7" />}
          title="No evaluation found"
          description="Create an evaluation and crawl your site first to run a Maps audit."
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

  // Scan-first flow: if no GMB scrape has been done and no scrape data loaded, show scan form
  if (!hasScanned && !scrapeData) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Maps Audit</h1>
            <p className="mt-0.5 text-sm text-slate-500">Google Maps Competitor Scan & Local Pack Visibility</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
              <Search className="h-6 w-6 text-blue-500" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Scan Google Maps</h2>
              <p className="text-sm text-slate-500">Find your business and competitors on Google Maps</p>
            </div>
          </div>
          <p className="text-sm text-slate-600 mb-6">
            Search Google Maps for businesses ranking in your area. We&apos;ll identify your business,
            compare against competitors, and show where you rank.
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Search Query</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={data.primaryQuery || "e.g., plumber, dentist, restaurant"}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-500 mb-1 block">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Chicago, IL"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            {scrapeError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-red-500" />
                  <p className="text-xs text-red-700">{scrapeError}</p>
                </div>
              </div>
            )}
            <Button onClick={handleScrape} disabled={scrapeLoading || !searchQuery || !location} className="w-full">
              {scrapeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {scrapeLoading ? "Scanning Google Maps..." : "Start Maps Audit"}
            </Button>
            {scrapeLoading && (
              <p className="text-center text-xs text-slate-500">This can take 30-60 seconds.</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  const rc = ratingConfig[data.rating];
  const failedChecks = data.checks.filter((c) => c.status === "fail");
  const warnChecks = data.checks.filter((c) => c.status === "warn");
  const passedChecks = data.checks.filter((c) => c.status === "pass");
  const sa = scrapeData?.analysis;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Maps Audit</h1>
            <p className="mt-0.5 text-sm text-slate-500">Google Maps Competitor Scan & Local Pack Visibility</p>
          </div>
        </div>
        <div className="flex gap-2">
          {hasScanned && (
            <Link href={`/projects/${projectId}/gmb/report`}>
              <Button variant="outline">
                <FileText className="h-4 w-4" />
                Report
              </Button>
            </Link>
          )}
          <Button variant="outline" onClick={() => setShowScanForm(!showScanForm)}>
            <Search className="h-4 w-4" />
            New Scan
          </Button>
        </div>
      </div>

      {/* Scan form — collapsible */}
      {showScanForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-800">Scan Google Maps</h2>
          </div>
          <p className="text-xs text-slate-500">
            Enter your website URL to get query suggestions, then scan Google Maps to see where you rank against competitors.
          </p>

          {/* Step 1: URL + Analyze */}
          <div>
            <label className="text-xs font-medium text-slate-500 mb-1 block">Your Website URL</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="url"
                  value={scanUrl}
                  onChange={(e) => setScanUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && analyzeScanUrl()}
                  placeholder="https://yoursite.com"
                  className="w-full rounded-lg border border-slate-200 pl-10 pr-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
              <Button onClick={analyzeScanUrl} disabled={analyzing || !scanUrl} variant="secondary">
                {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Analyze
              </Button>
            </div>
          </div>

          {/* Page info preview */}
          {pageInfo && (
            <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-2.5">
              <p className="text-xs text-slate-500">
                Detected: <span className="font-medium text-slate-700">{pageInfo.businessName || pageInfo.domain}</span>
              </p>
              {pageInfo.title && <p className="mt-0.5 truncate text-xs text-slate-400">{pageInfo.title}</p>}
            </div>
          )}

          {/* Suggest error */}
          {suggestError && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
              {suggestError}
            </div>
          )}

          {/* Step 2: Query suggestions */}
          {suggestions.length > 0 && (
            <div>
              <div className="mb-2 flex items-center gap-1.5">
                <Lightbulb className="h-4 w-4 text-amber-500" />
                <label className="text-xs font-medium text-slate-700">Suggested Search Queries</label>
              </div>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => setSearchQuery(s.query)}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors",
                      searchQuery === s.query
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50"
                    )}
                  >
                    {s.query}
                    <span className={cn(
                      "ml-1.5 text-xs",
                      searchQuery === s.query ? "text-blue-200" : "text-slate-400"
                    )}>
                      {s.type}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 3: Query + Location + Scan */}
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Search Query</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g., plumber, dentist, restaurant"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="text-xs font-medium text-slate-500 mb-1 block">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Sydney, Australia"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleScrape} disabled={scrapeLoading || !searchQuery || !location}>
                {scrapeLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Scan Maps
              </Button>
            </div>
          </div>

          {scrapeError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3">
              <div className="flex items-center gap-2">
                <XCircle className="h-4 w-4 text-red-500" />
                <p className="text-xs text-red-700">{scrapeError}</p>
              </div>
            </div>
          )}
          {scrapeLoading && (
            <div className="flex items-center justify-center py-8">
              <div className="text-center">
                <Loader2 className="mx-auto mb-2 h-6 w-6 animate-spin text-blue-500" />
                <p className="text-xs text-slate-500">Scanning Google Maps... This can take 30-60 seconds.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Scrape loading state */}
      {scrapeLoading && !showScanForm && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-blue-500" />
            <p className="text-sm text-slate-500">Scanning Google Maps... This can take 30-60 seconds.</p>
          </div>
        </div>
      )}

      {/* No scan data yet prompt */}
      {!scrapeData && !scrapeLoading && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-3">
            <Search className="h-5 w-5 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-blue-800">No Maps scan data yet</p>
              <p className="text-xs text-blue-600">Click &quot;New Scan&quot; above to scan Google Maps for your business and competitors.</p>
            </div>
          </div>
        </div>
      )}

      {/* Website GMB Readiness section — from AIRS crawl */}
      <div>
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-600">Website GMB Readiness</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">from AIRS crawl</span>
        </div>
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
              <MapPin className={`h-5 w-5 ${rc.color}`} />
              <span className={`text-lg font-bold ${rc.color}`}>{rc.label}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {data.score >= 80
                ? "Your site is well-optimized for Google local search. You're likely to appear in Maps and local pack results."
                : data.score >= 60
                  ? "Good local SEO foundation. Fix the remaining issues to improve your Maps and local pack visibility."
                : data.score >= 40
                  ? "Significant local SEO gaps. Focus on the critical issues below to start appearing in local searches."
                  : "Your site is not optimized for local search. Address the critical issues to appear in Google Maps results."}
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
      </div>

      {/* Category Scores */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Object.entries(data.categoryScores).map(([key, val]) => {
          const catColor = val >= 80 ? "text-green-600" : val >= 60 ? "text-blue-600" : val >= 40 ? "text-yellow-600" : "text-red-500";
          const barColor = val >= 80 ? "bg-green-500" : val >= 60 ? "bg-blue-500" : val >= 40 ? "bg-yellow-500" : "bg-red-500";
          return (
            <div key={key} className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium text-slate-500">{categoryLabels[key as keyof typeof categoryLabels]}</p>
              <p className={`mt-1 text-2xl font-bold ${catColor}`}>{val}</p>
              <div className="mt-2 h-1.5 rounded-full bg-slate-100">
                <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${val}%` }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrape results — from Google Maps scan */}
      {scrapeData && !scrapeLoading && (
        <div className="space-y-4">
          <div className="mb-1 flex items-center gap-2">
            <Search className="h-4 w-4 text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-600">Google Maps Scan Results</h2>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-600">live data</span>
          </div>
            {/* Analysis summary */}
            {sa && (
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Your Rank</p>
                  <p className="mt-0.5 text-lg font-bold text-slate-800">
                    {sa.rankInResults ? `#${sa.rankInResults}` : "Not found"}
                  </p>
                  <p className="text-[10px] text-slate-400">of {scrapeData.totalFound} results</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Avg Rating</p>
                  <p className="mt-0.5 text-lg font-bold text-slate-800">{sa.avgRating || "—"}</p>
                  <p className="text-[10px] text-slate-400">across all results</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Avg Reviews</p>
                  <p className="mt-0.5 text-lg font-bold text-slate-800">{sa.avgReviewCount || "—"}</p>
                  <p className="text-[10px] text-slate-400">per business</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500">Total Found</p>
                  <p className="mt-0.5 text-lg font-bold text-slate-800">{scrapeData.totalFound}</p>
                  <p className="text-[10px] text-slate-400">businesses</p>
                </div>
              </div>
            )}

            {/* Your business highlight */}
            {sa?.yourBusiness && (
              <div className="rounded-lg border-2 border-blue-200 bg-blue-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Trophy className="h-4 w-4 text-blue-600" />
                  <p className="text-sm font-semibold text-blue-800">Your Business — Rank #{sa.yourBusiness.rank}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div>
                    <p className="text-[10px] text-slate-500">Rating</p>
                    <p className="text-sm font-bold text-slate-800">{sa.yourBusiness.rating} / 5</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">Reviews</p>
                    <p className="text-sm font-bold text-slate-800">{sa.yourBusiness.reviewsCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">Photos</p>
                    <p className="text-sm font-bold text-slate-800">{sa.yourBusiness.photoCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500">Category</p>
                    <p className="text-sm font-bold text-slate-800">{sa.yourBusiness.categoryName}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Not found warning */}
            {sa && !sa.yourBusiness && scrapeData.totalFound > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500" />
                  <p className="text-xs text-yellow-700">
                    Your business was not found in the top {scrapeData.totalFound} results for &quot;{scrapeData.searchQuery}&quot; in {scrapeData.location}. This means you&apos;re not ranking in Google Maps for this query.
                  </p>
                </div>
              </div>
            )}

            {/* Competitor comparison table */}
            {scrapeData.businesses.length > 0 && (
              <div className="overflow-x-auto rounded-lg border border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs font-medium text-slate-500">
                      <th className="px-3 py-2">#</th>
                      <th className="px-3 py-2">Business</th>
                      <th className="px-3 py-2">Rating</th>
                      <th className="px-3 py-2">Reviews</th>
                      <th className="px-3 py-2">Photos</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scrapeData.businesses.map((biz) => {
                      const isYou = sa?.yourBusiness?.placeId === biz.placeId;
                      return (
                        <tr key={biz.placeId || biz.rank} className={`border-b border-slate-50 ${isYou ? "bg-blue-50" : "hover:bg-slate-50"}`}>
                          <td className="px-3 py-2.5">
                            <span className={`text-xs font-bold ${isYou ? "text-blue-600" : "text-slate-400"}`}>#{biz.rank}</span>
                          </td>
                          <td className="px-3 py-2.5">
                            <p className="text-sm font-medium text-slate-800">{biz.name}</p>
                            {biz.address && <p className="text-[10px] text-slate-400">{biz.address}</p>}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`text-sm font-bold ${biz.rating >= 4.5 ? "text-green-600" : biz.rating >= 4 ? "text-blue-600" : biz.rating > 0 ? "text-yellow-600" : "text-slate-300"}`}>
                              {biz.rating > 0 ? biz.rating : "—"}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-sm text-slate-600">{biz.reviewsCount}</td>
                          <td className="px-3 py-2.5 text-sm text-slate-600">{biz.photoCount}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500">{biz.categoryName}</td>
                          <td className="px-3 py-2.5">
                            {biz.permanentlyClosed ? (
                              <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700">Closed</span>
                            ) : biz.temporarilyClosed ? (
                              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-[10px] font-medium text-yellow-700">Temp Closed</span>
                            ) : biz.isOpen ? (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">Open</span>
                            ) : (
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">Closed</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Top competitor insight */}
            {sa?.topRated && sa.topRated.placeId !== sa.yourBusiness?.placeId && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-slate-400" />
                  <p className="text-xs text-slate-600">
                    <span className="font-semibold">Top rated:</span> {sa.topRated.name} ({sa.topRated.rating}/5, {sa.topRated.reviewsCount} reviews)
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

      {/* LPS Score from scrape */}
      {scrapeData?.scoreResult && !scrapeLoading && (
        <>
          {/* LPS Score Card */}
          <div className={`rounded-2xl border-2 ${ratingConfig[scrapeData.scoreResult.rating].ring} ${ratingConfig[scrapeData.scoreResult.rating].bg} p-6`}>
            <div className="flex items-center gap-6">
              <div className="relative flex h-32 w-32 shrink-0 items-center justify-center">
                <svg className="h-32 w-32 -rotate-90" viewBox="0 0 128 128">
                  <circle cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8" className="text-slate-200" />
                  <circle
                    cx="64" cy="64" r="56" fill="none" stroke="currentColor" strokeWidth="8"
                    className={ratingConfig[scrapeData.scoreResult.rating].color}
                    strokeDasharray={`${(scrapeData.scoreResult.score / 100) * 351.86} 351.86`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className={`text-3xl font-bold ${ratingConfig[scrapeData.scoreResult.rating].color}`}>{scrapeData.scoreResult.score}</span>
                  <span className="text-xs text-slate-400">LPS</span>
                </div>
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <MapPin className={`h-5 w-5 ${ratingConfig[scrapeData.scoreResult.rating].color}`} />
                  <span className={`text-lg font-bold ${ratingConfig[scrapeData.scoreResult.rating].color}`}>Local Pack Visibility: {ratingConfig[scrapeData.scoreResult.rating].label}</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  {scrapeData.scoreResult.score >= 80
                    ? "You're well-positioned for local pack. Maintain your GMB profile with regular posts and reviews."
                    : scrapeData.scoreResult.score >= 60
                      ? "Good local visibility. Fix the issues below to reach the local pack."
                      : scrapeData.scoreResult.score >= 40
                        ? "Significant local SEO gaps. Focus on critical issues to improve Maps ranking."
                        : "Your GMB profile needs major work. Start with the critical recommendations below."}
                </p>
                <div className="mt-3 flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium text-slate-700">{scrapeData.scoreResult.summary.passed} passed</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-4 w-4 text-yellow-500" />
                    <span className="text-sm font-medium text-slate-700">{scrapeData.scoreResult.summary.warnings} warnings</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <XCircle className="h-4 w-4 text-red-500" />
                    <span className="text-sm font-medium text-slate-700">{scrapeData.scoreResult.summary.failed} failed</span>
                  </div>
                </div>
              </div>
            </div>
            {/* LPS Category scores */}
            <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {Object.entries(scrapeData.scoreResult.categoryScores).map(([key, val]) => {
                const catColor = val >= 80 ? "text-green-600" : val >= 60 ? "text-blue-600" : val >= 40 ? "text-yellow-600" : "text-red-500";
                const barColor = val >= 80 ? "bg-green-500" : val >= 60 ? "bg-blue-500" : val >= 40 ? "bg-yellow-500" : "bg-red-500";
                return (
                  <div key={key} className="rounded-lg bg-white/80 p-3">
                    <p className="text-xs font-medium text-slate-500">{lpsCategoryLabels[key as keyof typeof lpsCategoryLabels]}</p>
                    <p className={`mt-0.5 text-xl font-bold ${catColor}`}>{val}</p>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100">
                      <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${val}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* LPS Checks */}
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-slate-700">Local Pack Visibility Checks</h2>
            {scrapeData.scoreResult.checks.map((check) => {
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

          {/* Findings */}
          {scrapeData.findings.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700">GMB Findings ({scrapeData.findings.length})</h2>
              {scrapeData.findings.map((finding) => {
                const fc = findingTypeConfig[finding.type];
                return (
                  <div key={finding.id} className={`rounded-xl border ${fc.border} ${fc.bg} p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${fc.color} ${fc.bg} border ${fc.border}`}>
                            {fc.label}
                          </span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                            finding.impact === "high" ? "bg-red-100 text-red-700" :
                            finding.impact === "medium" ? "bg-yellow-100 text-yellow-700" :
                            "bg-slate-100 text-slate-600"
                          }`}>
                            {finding.impact} impact
                          </span>
                        </div>
                        <p className="mt-1.5 text-sm font-semibold text-slate-800">{finding.title}</p>
                        <p className="mt-1 text-xs text-slate-600">{finding.description}</p>
                        {finding.competitorBenchmark && (
                          <p className="mt-1.5 text-xs text-slate-500">
                            <span className="font-medium">Benchmark:</span> {finding.competitorBenchmark}
                          </p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-[10px] text-slate-400">Metric</p>
                        <p className="text-sm font-bold text-slate-700">{finding.metric}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Recommendations / Action Plans */}
          {scrapeData.recommendations.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-slate-700">GMB Action Plans ({scrapeData.recommendations.length})</h2>
              {scrapeData.recommendations.map((rec) => {
                const pc = priorityConfig[rec.priority];
                return (
                  <div key={rec.id} className={`rounded-xl border ${pc.border} ${pc.bg} p-4`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
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
                    <div className="mt-3 rounded-lg bg-white/80 p-3">
                      <p className="mb-2 text-xs font-semibold text-slate-700">Steps:</p>
                      <ol className="space-y-1.5">
                        {rec.steps.map((step, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                            <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                              {i + 1}
                            </span>
                            {step}
                          </li>
                        ))}
                      </ol>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

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

      {/* GMB Action Checklist */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Star className="h-5 w-5 text-yellow-500" />
          <h2 className="text-sm font-semibold text-slate-800">GMB Profile Action Checklist</h2>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          These are actions to take directly in your Google My Business dashboard. AIRS can&apos;t check these automatically, but they&apos;re critical for local search visibility.
        </p>
        <div className="space-y-2">
          {[
            "Claim and verify your Google My Business listing",
            "Choose the most specific primary category (e.g., 'Plumber' not 'Contractor')",
            "Add secondary categories for all services you offer",
            "Fill out ALL business attributes (hours, services, accessibility)",
            "Upload 20+ high-quality photos (exterior, interior, team, work samples)",
            "Write a 750+ character business description with keywords",
            "Enable messaging and respond within 24 hours",
            "Post weekly updates (offers, events, or what's new)",
            "Ask every satisfied customer for a review",
            "Respond to every review (positive and negative) within 24 hours",
            "Add Q&A entries for common questions",
            "Keep business hours updated for holidays",
          ].map((action, i) => (
            <div key={i} className="flex items-center gap-2.5 rounded-lg bg-slate-50 px-3 py-2">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
              <span className="text-xs text-slate-700">{action}</span>
            </div>
          ))}
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
