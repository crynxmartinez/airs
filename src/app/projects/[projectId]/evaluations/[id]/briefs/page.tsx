"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, AlertCircle, FileText,
  Copy, Check, ChevronDown, ChevronRight, Target,
  TrendingUp, Zap, Clock, Shield, Rocket, FlaskConical, Award,
} from "lucide-react";

interface Brief {
  id: string;
  evaluation_id: string;
  question: string;
  answer_type: string;
  weakness_score: number;
  severity: number;
  demand: number;
  winnability: number;
  effort: string;
  rationale: string;
  evidence: string | null;
  target_heading: string | null;
  required_format: string | null;
  extractability_notes: string | null;
  draft_content: string | null;
  status: string;
  created_at: string;
}

const answerTypeColors: Record<string, string> = {
  money: "bg-emerald-50 text-emerald-700 border-emerald-200",
  duration: "bg-blue-50 text-blue-700 border-blue-200",
  count: "bg-cyan-50 text-cyan-700 border-cyan-200",
  steps: "bg-purple-50 text-purple-700 border-purple-200",
  comparison: "bg-orange-50 text-orange-700 border-orange-200",
  entity: "bg-pink-50 text-pink-700 border-pink-200",
  boolean: "bg-indigo-50 text-indigo-700 border-indigo-200",
  definition: "bg-slate-50 text-slate-700 border-slate-200",
};

const effortConfig = {
  low: { icon: Zap, color: "text-green-600", label: "Low effort" },
  medium: { icon: Clock, color: "text-yellow-600", label: "Medium effort" },
  high: { icon: Shield, color: "text-red-600", label: "High effort" },
};

export default function ContentBriefsPage() {
  const params = useParams<{ projectId: string; id: string }>();
  const [briefs, setBriefs] = useState<Brief[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [shipping, setShipping] = useState<string | null>(null);
  const [shipResults, setShipResults] = useState<Record<string, { shipped: boolean; message: string }>>({});

  useEffect(() => {
    fetch(`/api/evaluations/${params.id}/briefs`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json();
          throw new Error(body.error || "Failed to load briefs");
        }
        return r.json();
      })
      .then(setBriefs)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  function copyDraft(id: string, content: string) {
    navigator.clipboard.writeText(content);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleShip(briefId: string) {
    setShipping(briefId);
    try {
      const res = await fetch(`/api/evaluations/${params.id}/outcomes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ship", briefId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark as shipped");
      setShipResults((prev) => ({
        ...prev,
        [briefId]: { shipped: true, message: `Marked as shipped. Citation baseline: ${data.citation_before}` },
      }));
      setBriefs((prev) => prev.map((b) => b.id === briefId ? { ...b, status: "shipped" } : b));
    } catch (e) {
      setShipResults((prev) => ({
        ...prev,
        [briefId]: { shipped: false, message: e instanceof Error ? e.message : "Failed" },
      }));
    }
    setShipping(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <Link
          href={`/projects/${params.projectId}/evaluations/${params.id}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-6"
        >
          <ArrowLeft className="h-4 w-4" /> Back to evaluation
        </Link>
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
          <div>
            <p className="font-medium text-amber-900">{error}</p>
            <p className="text-sm text-amber-700 mt-1">
              Run the AIRS analysis first to generate content briefs.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="mb-6">
        <Link
          href={`/projects/${params.projectId}/evaluations/${params.id}`}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-2"
        >
          <ArrowLeft className="h-4 w-4" /> Back to evaluation
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
          <FileText className="h-6 w-6 text-slate-400" />
          Content Briefs
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {briefs.length} briefs ranked by exploitability. Each tells you what to write, in what format, to close a gap the field hasn&apos;t filled.
        </p>
      </div>

      {/* Briefs list */}
      <div className="space-y-3">
        {briefs.map((brief, idx) => {
          const isExpanded = expanded === brief.id;
          const EffortIcon = effortConfig[brief.effort as keyof typeof effortConfig]?.icon ?? Zap;
          const effortColor = effortConfig[brief.effort as keyof typeof effortConfig]?.color ?? "text-slate-500";

          return (
            <div
              key={brief.id}
              className="rounded-lg border border-slate-200 overflow-hidden"
            >
              {/* Collapsed header */}
              <div
                className="flex items-center gap-3 p-4 cursor-pointer hover:bg-slate-50"
                onClick={() => setExpanded(isExpanded ? null : brief.id)}
              >
                {isExpanded ? (
                  <ChevronDown className="h-5 w-5 text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="h-5 w-5 text-slate-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono text-slate-400">#{idx + 1}</span>
                    <span className="font-medium text-slate-900 truncate">{brief.question}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded border ${answerTypeColors[brief.answer_type] || answerTypeColors.definition}`}>
                      {brief.answer_type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-1">{brief.rationale}</p>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <div className="flex items-center gap-1 text-xs">
                    <TrendingUp className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-700">{brief.weakness_score}</span>
                  </div>
                  <div className={`flex items-center gap-1 text-xs ${effortColor}`}>
                    <EffortIcon className="h-3.5 w-3.5" />
                    <span className="capitalize">{brief.effort}</span>
                  </div>
                </div>
              </div>

              {/* Expanded content */}
              {isExpanded && (
                <div className="border-t border-slate-200 p-4 space-y-4 bg-slate-50/50">
                  {/* Score breakdown */}
                  <div className="grid grid-cols-4 gap-3">
                    <div className="rounded-md bg-white border border-slate-200 p-2.5">
                      <div className="text-xs text-slate-500">Score</div>
                      <div className="text-lg font-bold text-slate-900">{brief.weakness_score}</div>
                    </div>
                    <div className="rounded-md bg-white border border-slate-200 p-2.5">
                      <div className="text-xs text-slate-500">Severity</div>
                      <div className="text-lg font-bold text-slate-900">{Math.round(brief.severity * 100)}%</div>
                    </div>
                    <div className="rounded-md bg-white border border-slate-200 p-2.5">
                      <div className="text-xs text-slate-500">Demand</div>
                      <div className="text-lg font-bold text-slate-900">{Math.round(brief.demand * 100)}%</div>
                    </div>
                    <div className="rounded-md bg-white border border-slate-200 p-2.5">
                      <div className="text-xs text-slate-500">Winnability</div>
                      <div className="text-lg font-bold text-slate-900">{Math.round(brief.winnability * 100)}%</div>
                    </div>
                  </div>

                  {/* Rationale */}
                  <div>
                    <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Why this matters</h4>
                    <p className="text-sm text-slate-700">{brief.rationale}</p>
                  </div>

                  {/* Evidence */}
                  {brief.evidence && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Field evidence</h4>
                      <blockquote className="text-sm text-slate-600 italic border-l-2 border-slate-300 pl-3">
                        &ldquo;{brief.evidence}&rdquo;
                      </blockquote>
                    </div>
                  )}

                  {/* Target heading */}
                  {brief.target_heading && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Suggested heading</h4>
                      <code className="text-sm bg-white border border-slate-200 rounded px-2 py-1 block">
                        {brief.target_heading}
                      </code>
                    </div>
                  )}

                  {/* Required format */}
                  {brief.required_format && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Required evidence format</h4>
                      <p className="text-sm text-slate-700">{brief.required_format}</p>
                    </div>
                  )}

                  {/* Extractability notes */}
                  {brief.extractability_notes && (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Extractability notes</h4>
                      <p className="text-sm text-slate-700">{brief.extractability_notes}</p>
                    </div>
                  )}

                  {/* Draft template */}
                  {brief.draft_content && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Draft template</h4>
                        <button
                          onClick={() => copyDraft(brief.id, brief.draft_content!)}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
                        >
                          {copied === brief.id ? (
                            <><Check className="h-3 w-3" /> Copied</>
                          ) : (
                            <><Copy className="h-3 w-3" /> Copy</>
                          )}
                        </button>
                      </div>
                      <pre className="text-sm bg-white border border-slate-200 rounded-md p-3 overflow-x-auto whitespace-pre-wrap text-slate-700">
                        {brief.draft_content}
                      </pre>
                    </div>
                  )}

                  {/* Outcome loop: ship / status */}
                  <div className="pt-3 border-t border-slate-200">
                    <div className="flex items-center gap-3">
                      {brief.status === "pending" && (
                        <button
                          onClick={() => handleShip(brief.id)}
                          disabled={shipping === brief.id}
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                        >
                          {shipping === brief.id ? (
                            <><Loader2 className="h-4 w-4 animate-spin" /> Marking...</>
                          ) : (
                            <><Rocket className="h-4 w-4" /> Mark as shipped</>
                          )}
                        </button>
                      )}
                      {brief.status === "shipped" && (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600">
                          <Rocket className="h-4 w-4" /> Shipped — re-run AI capture to measure
                        </span>
                      )}
                      {brief.status === "verified" && (
                        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-600">
                          <Award className="h-4 w-4" /> Verified — citation gained
                        </span>
                      )}
                      {shipResults[brief.id] && (
                        <span className={`text-xs ${shipResults[brief.id].shipped ? "text-green-600" : "text-red-600"}`}>
                          {shipResults[brief.id].message}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {briefs.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          No content briefs available. Run the AIRS analysis first.
        </div>
      )}
    </div>
  );
}
