"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Trash2, Loader2, ChevronRight, ChevronLeft, Check, Globe, ScanLine, Sparkles, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Competitor {
  url: string;
  title: string;
  description: string;
  competitor_type: string;
  competitor_name: string;
  selected: boolean;
  scraped: boolean;
  scraping: boolean;
  pagesCrawled?: number;
  jsRendered?: boolean;
}

interface Suggestion {
  query: string;
  type: string;
}

export function EvaluationWizard({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1 state
  const [primaryQuery, setPrimaryQuery] = useState("");
  const [searchIntent, setSearchIntent] = useState("transactional");
  const [digitalAssetUrl, setDigitalAssetUrl] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [scope, setScope] = useState("");

  // Suggestions state
  const [analyzing, setAnalyzing] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<{ title: string; domain: string; businessName: string } | null>(null);

  // Step 2 state
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [manualUrl, setManualUrl] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Step 3 state
  const [scrapingAll, setScrapingAll] = useState(false);
  const [evidenceCount, setEvidenceCount] = useState(0);

  // Step 4 state
  const [evaluationId, setEvaluationId] = useState<string | null>(null);

  const steps = ["Define", "Competitors", "Evidence", "Review"];

  async function analyzeUrl() {
    if (!digitalAssetUrl) return;
    setAnalyzing(true);
    setSuggestError(null);
    setSuggestions([]);
    setPageInfo(null);
    try {
      const res = await fetch("/api/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: digitalAssetUrl }),
      });
      const data = await res.json();
      if (data.error) {
        setSuggestError(data.error);
      } else {
        setSuggestions(data.suggestions || []);
        setPageInfo({
          title: data.pageTitle || "",
          domain: data.domain || "",
          businessName: data.businessName || "",
        });
        // Auto-select first suggestion if no query set yet
        if (!primaryQuery && data.suggestions?.length > 0) {
          setPrimaryQuery(data.suggestions[0].query);
        }
      }
    } catch {
      setSuggestError("Could not analyze this URL. You can still type a query manually.");
    }
    setAnalyzing(false);
  }

  async function handleSearch() {
    if (!primaryQuery) return;
    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: primaryQuery, excludeUrl: digitalAssetUrl }),
      });
      const data = await res.json();
      if (data.error) {
        setSearchError(data.error);
      } else if (data.results && data.results.length > 0) {
        setCompetitors(
          data.results.map((r: Competitor) => ({
            ...r,
            selected: true,
            scraped: false,
            scraping: false,
          }))
        );
      } else {
        setSearchError("No competitors found. Try adding URLs manually below.");
      }
    } catch {
      setSearchError("Search failed. You can still add competitors manually below.");
    }
    setSearching(false);
  }

  function addManualCompetitor() {
    if (!manualUrl) return;
    let url = manualUrl.trim();
    if (!url.startsWith("http")) url = "https://" + url;
    let name = "";
    try {
      name = new URL(url).hostname.replace("www.", "");
    } catch {
      name = url;
    }
    setCompetitors([
      ...competitors,
      {
        url,
        title: "",
        description: "",
        competitor_type: "direct",
        competitor_name: name,
        selected: true,
        scraped: false,
        scraping: false,
      },
    ]);
    setManualUrl("");
  }

  async function handleNext() {
    if (step === 0) {
      // Create evaluation
      setSaving(true);
      try {
        const res = await fetch("/api/evaluations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            primary_query: primaryQuery,
            search_intent: searchIntent,
            digital_asset_url: digitalAssetUrl,
            target_audience: targetAudience || undefined,
            scope: scope || undefined,
          }),
        });
        const data = await res.json();
        setEvaluationId(data.id);
        setStep(1);
      } catch {
        // ignore
      }
      setSaving(false);
    } else if (step === 1) {
      // Save selected competitors
      if (!evaluationId) return;
      const selected = competitors.filter((c) => c.selected);
      if (selected.length === 0) return;
      await fetch(`/api/evaluations/${evaluationId}/competitors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(selected),
      });
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    } else if (step === 3) {
      // Launch
      if (!evaluationId) return;
      await fetch(`/api/evaluations/${evaluationId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "in_progress" }),
      });
      router.push(`/projects/${projectId}/evaluations/${evaluationId}`);
    }
  }

  async function scrapeCompetitor(index: number) {
    if (!evaluationId) return;
    const comp = competitors[index];
    if (!comp || comp.scraped || comp.scraping) return;

    setCompetitors((prev) =>
      prev.map((c, i) => (i === index ? { ...c, scraping: true } : c))
    );

    try {
      // Get competitor ID from DB
      const compRes = await fetch(`/api/evaluations/${evaluationId}/competitors`);
      const allComps = await compRes.json();
      const dbComp = allComps.find((c: { url: string; id: string }) => c.url === comp.url);

      if (!dbComp) return;

      const res = await fetch(`/api/evaluations/${evaluationId}/crawl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: comp.url,
          evaluation_id: evaluationId,
          competitor_id: dbComp.id,
        }),
      });
      const data = await res.json();
      if (data.evidence_count) {
        setEvidenceCount((prev) => prev + data.evidence_count);
      }

      const jsRendered = data.pages?.some((p: { status: string }) => p.status === "js-rendered");

      setCompetitors((prev) =>
        prev.map((c, i) => (i === index ? { ...c, scraping: false, scraped: true, pagesCrawled: data.pages_crawled, jsRendered } : c))
      );
      return;
    } catch {
      setCompetitors((prev) =>
        prev.map((c, i) => (i === index ? { ...c, scraping: false, scraped: true } : c))
      );
    }
  }

  async function scrapeAll() {
    setScrapingAll(true);
    for (let i = 0; i < competitors.length; i++) {
      if (competitors[i].selected && !competitors[i].scraped) {
        await scrapeCompetitor(i);
      }
    }
    setScrapingAll(false);
  }

  const selectedCompetitors = competitors.filter((c) => c.selected);
  const canProceed =
    step === 0
      ? primaryQuery && digitalAssetUrl
      : step === 1
        ? selectedCompetitors.length > 0
        : step === 2
          ? true
          : true;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Stepper */}
      <div className="mb-8 flex items-center justify-center">
        {steps.map((label, i) => (
          <div key={label} className="flex items-center">
            <div
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium transition-colors",
                i < step && "bg-blue-600 text-white",
                i === step && "bg-blue-600 text-white ring-4 ring-blue-100",
                i > step && "bg-slate-200 text-slate-400"
              )}
            >
              {i < step ? <Check className="h-4 w-4" /> : i + 1}
            </div>
            <span
              className={cn(
                "ml-2 text-sm font-medium",
                i === step ? "text-slate-900" : "text-slate-400"
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div className={cn("mx-3 h-px w-12", i < step ? "bg-blue-600" : "bg-slate-200")} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <div className="rounded-xl border border-slate-200 bg-white p-6">
        {step === 0 && (
          <div className="space-y-5">
            {/* Step 1: URL first */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Your Website URL
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    type="url"
                    value={digitalAssetUrl}
                    onChange={(e) => setDigitalAssetUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && analyzeUrl()}
                    placeholder="https://yoursite.com"
                    className="w-full rounded-lg border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <Button onClick={analyzeUrl} disabled={analyzing || !digitalAssetUrl} variant="secondary">
                  {analyzing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  Analyze
                </Button>
              </div>
              <p className="mt-1.5 text-xs text-slate-400">
                Enter your URL and we&apos;ll suggest search queries based on your page content
              </p>
            </div>

            {/* Page info preview */}
            {pageInfo && (
              <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-2.5">
                <p className="text-xs text-slate-500">Detected: <span className="font-medium text-slate-700">{pageInfo.businessName || pageInfo.domain}</span></p>
                {pageInfo.title && <p className="mt-0.5 truncate text-xs text-slate-400">{pageInfo.title}</p>}
              </div>
            )}

            {/* Error */}
            {suggestError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
                {suggestError}
              </div>
            )}

            {/* Suggestions */}
            {suggestions.length > 0 && (
              <div>
                <div className="mb-2 flex items-center gap-1.5">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  <label className="text-sm font-medium text-slate-700">
                    Suggested Search Queries
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setPrimaryQuery(s.query)}
                      className={cn(
                        "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
                        primaryQuery === s.query
                          ? "border-blue-600 bg-blue-600 text-white"
                          : "border-slate-300 bg-white text-slate-700 hover:border-blue-400 hover:bg-blue-50"
                      )}
                    >
                      {s.query}
                      <span className={cn(
                        "ml-1.5 text-xs",
                        primaryQuery === s.query ? "text-blue-200" : "text-slate-400"
                      )}>
                        {s.type}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Query input (always visible) */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Search Query
              </label>
              <input
                type="text"
                value={primaryQuery}
                onChange={(e) => setPrimaryQuery(e.target.value)}
                placeholder="e.g., emergency plumber chicago"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1.5 text-xs text-slate-400">
                Pick a suggestion above or type your own. This is what we&apos;ll use to find competitors.
              </p>
            </div>

            {/* Search Intent */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Search Intent
              </label>
              <div className="flex gap-3">
                {["transactional", "informational", "navigational"].map((intent) => (
                  <button
                    key={intent}
                    onClick={() => setSearchIntent(intent)}
                    className={cn(
                      "rounded-lg border px-4 py-2 text-sm font-medium capitalize transition-colors",
                      searchIntent === intent
                        ? "border-blue-600 bg-blue-50 text-blue-700"
                        : "border-slate-300 text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    {intent}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional fields */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Target Audience <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={targetAudience}
                  onChange={(e) => setTargetAudience(e.target.value)}
                  placeholder="e.g., homeowners in Chicago"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Evaluation Scope <span className="text-slate-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="e.g., Service page + homepage"
                  className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="flex gap-2">
              <Button onClick={handleSearch} disabled={searching || !primaryQuery} variant="secondary">
                {searching ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Search for Competitors
              </Button>
            </div>

            {searchError && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-700">
                {searchError}
              </div>
            )}

            {/* Manual add */}
            <div className="flex gap-2">
              <input
                type="text"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addManualCompetitor()}
                placeholder="Add competitor URL manually..."
                className="flex-1 rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <Button onClick={addManualCompetitor} variant="secondary">
                <Plus className="h-4 w-4" />
                Add
              </Button>
            </div>

            {/* Competitor list */}
            {competitors.length > 0 ? (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-600">
                  {selectedCompetitors.length} of {competitors.length} selected
                </p>
                {competitors.map((comp, i) => (
                  <div
                    key={i}
                    className={cn(
                      "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                      comp.selected ? "border-blue-200 bg-blue-50/50" : "border-slate-200 bg-white"
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={comp.selected}
                      onChange={() =>
                        setCompetitors((prev) =>
                          prev.map((c, idx) => (idx === i ? { ...c, selected: !c.selected } : c))
                        )
                      }
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 shrink-0 text-slate-400" />
                        <span className="truncate text-sm font-medium text-slate-800">
                          {comp.competitor_name}
                        </span>
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500 capitalize">
                          {comp.competitor_type.replace("_", " ")}
                        </span>
                      </div>
                      {comp.title && (
                        <p className="mt-0.5 truncate text-xs text-slate-500">{comp.title}</p>
                      )}
                      {comp.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{comp.description}</p>
                      )}
                    </div>
                    <button
                      onClick={() =>
                        setCompetitors((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center">
                <Search className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm text-slate-500">
                  Search for competitors or add URLs manually
                </p>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-slate-800">Crawl & Collect Evidence</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Crawls homepage + about, services, contact pages. Falls back to browser rendering for JS-heavy sites.
                </p>
              </div>
              <Button onClick={scrapeAll} disabled={scrapingAll || selectedCompetitors.length === 0}>
                {scrapingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ScanLine className="h-4 w-4" />
                )}
                Crawl All
              </Button>
            </div>

            {evidenceCount > 0 && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                <p className="text-sm font-medium text-green-700">
                  {evidenceCount} evidence items collected so far
                </p>
              </div>
            )}

            <div className="space-y-2">
              {selectedCompetitors.map((comp, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <Globe className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="flex-1 truncate text-sm text-slate-700">
                    {comp.competitor_name}
                  </span>
                  {comp.scraping ? (
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                      <span className="text-xs text-slate-400">crawling...</span>
                    </div>
                  ) : comp.scraped ? (
                    <div className="flex items-center gap-2">
                      <span className="flex items-center gap-1 text-xs font-medium text-green-600">
                        <Check className="h-3.5 w-3.5" />
                        {comp.pagesCrawled ? `${comp.pagesCrawled} pages` : "Done"}
                      </span>
                      {comp.jsRendered && (
                        <span className="rounded bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-600">
                          JS
                        </span>
                      )}
                    </div>
                  ) : (
                    <Button
                      onClick={() => scrapeCompetitor(i)}
                      variant="outline"
                      className="text-xs"
                    >
                      Crawl
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-slate-800">Review & Launch</h3>

            <div className="space-y-2 rounded-lg bg-slate-50 p-4">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Query</span>
                <span className="font-medium text-slate-800">{primaryQuery}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Intent</span>
                <span className="font-medium capitalize text-slate-800">{searchIntent}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Your URL</span>
                <span className="font-medium text-slate-800 truncate max-w-[200px]">{digitalAssetUrl}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Competitors</span>
                <span className="font-medium text-slate-800">{selectedCompetitors.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Evidence collected</span>
                <span className="font-medium text-slate-800">{evidenceCount} items</span>
              </div>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <p className="text-sm text-blue-700">
                Click <strong>Launch</strong> to start the evaluation. You can view results and add more evidence after launch.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="mt-6 flex items-center justify-between">
        <Button
          variant="outline"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>

        <span className="text-xs text-slate-400">Step {step + 1} of {steps.length}</span>

        <Button onClick={handleNext} disabled={!canProceed || saving || scrapingAll}>
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          {step === 3 ? "Launch Evaluation" : "Next"}
          {step < 3 && <ChevronRight className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
