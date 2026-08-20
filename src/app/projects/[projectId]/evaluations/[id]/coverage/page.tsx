"use client";

import { Fragment, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Loader2, AlertCircle, Grid3x3, Filter,
  CheckCircle2, AlertTriangle, XCircle, ChevronDown, ChevronRight,
} from "lucide-react";

interface CoverageCell {
  id: string;
  competitor_id: string;
  competitor_label: string;
  question: string;
  answer_type: string;
  level: "none" | "lexical" | "answered";
  score: number;
  term_coverage: number;
  specificity: number;
  is_depth_gap: number;
  passage: string | null;
  heading: string | null;
  gap_evidence: string | null;
  scored_at: string;
}

interface FieldSummary {
  question: string;
  answer_type: string;
  total: number;
  answered: number;
  lexical: number;
  none: number;
  gap_rate: number;
  self_level: string | null;
  self_specificity: number | null;
}

interface CoverageData {
  evaluation_id: string;
  questions: string[];
  competitors: { id: string; label: string }[];
  cells: Record<string, Record<string, CoverageCell>>;
  field_summary: FieldSummary[];
  scored_at: string | null;
}

const levelConfig = {
  answered: { color: "bg-green-100 text-green-700 border-green-300", icon: CheckCircle2, label: "Answered" },
  lexical: { color: "bg-yellow-100 text-yellow-700 border-yellow-300", icon: AlertTriangle, label: "Lexical" },
  none: { color: "bg-red-100 text-red-700 border-red-300", icon: XCircle, label: "None" },
};

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

export default function CoverageMatrixPage() {
  const params = useParams<{ projectId: string; id: string }>();
  const [data, setData] = useState<CoverageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  useEffect(() => {
    fetch(`/api/evaluations/${params.id}/coverage`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json();
          throw new Error(body.error || "Failed to load coverage");
        }
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

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
              Run the AIRS analysis first to generate coverage data.
            </p>
            <Link
              href={`/projects/${params.projectId}/evaluations/${params.id}`}
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-amber-900 hover:underline"
            >
              Go to evaluation <ArrowLeft className="h-3 w-3 rotate-180" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const filteredQuestions = data.questions.filter((q) => {
    const summary = data.field_summary.find((s) => s.question === q);
    if (!summary) return true;
    if (filterType !== "all" && summary.answer_type !== filterType) return false;
    if (filterLevel === "gaps" && summary.answered === summary.total) return false;
    if (filterLevel === "answered" && summary.answered === 0) return false;
    if (filterLevel === "depth" && summary.lexical === 0) return false;
    return true;
  });

  const sortedCompetitors = [...data.competitors].sort((a, b) => {
    if (a.id === "self") return -1;
    if (b.id === "self") return 1;
    return a.label.localeCompare(b.label);
  });

  return (
    <div className="max-w-[1400px] mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link
            href={`/projects/${params.projectId}/evaluations/${params.id}`}
            className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900 mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to evaluation
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-3">
            <Grid3x3 className="h-6 w-6 text-slate-400" />
            Coverage Matrix
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {data.questions.length} questions × {data.competitors.length} sites
            {data.scored_at && ` · last scored ${new Date(data.scored_at).toLocaleString()}`}
          </p>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-slate-400" />
            <select
              value={filterLevel}
              onChange={(e) => setFilterLevel(e.target.value)}
              className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="all">All questions</option>
              <option value="gaps">Gaps only</option>
              <option value="depth">Depth gaps</option>
              <option value="answered">Fully answered</option>
            </select>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="text-sm border border-slate-200 rounded-md px-2 py-1.5 bg-white"
            >
              <option value="all">All types</option>
              <option value="money">Money</option>
              <option value="duration">Duration</option>
              <option value="count">Count</option>
              <option value="steps">Steps</option>
              <option value="comparison">Comparison</option>
              <option value="entity">Entity</option>
              <option value="boolean">Boolean</option>
              <option value="definition">Definition</option>
            </select>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs">
        {Object.entries(levelConfig).map(([key, cfg]) => {
          const Icon = cfg.icon;
          return (
            <div key={key} className="flex items-center gap-1.5">
              <div className={`w-4 h-4 rounded border ${cfg.color} flex items-center justify-center`}>
                <Icon className="h-2.5 w-2.5" />
              </div>
              <span className="text-slate-600">{cfg.label}</span>
            </div>
          );
        })}
        <div className="ml-auto text-slate-400">
          Click a row to see evidence passages
        </div>
      </div>

      {/* Matrix */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="text-left px-3 py-2.5 font-medium text-slate-600 sticky left-0 bg-slate-50 z-10 min-w-[280px]">
                Question
              </th>
              <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-20">Gap%</th>
              <th className="text-center px-2 py-2.5 font-medium text-slate-600 w-16">Self</th>
              {sortedCompetitors.filter((c) => c.id !== "self").map((c) => (
                <th key={c.id} className="text-center px-2 py-2.5 font-medium text-slate-600 min-w-[100px] max-w-[140px]">
                  <div className="truncate" title={c.label}>{c.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredQuestions.map((q) => {
              const summary = data.field_summary.find((s) => s.question === q);
              const isExpanded = expandedQuestion === q;
              const gapPct = summary ? Math.round(summary.gap_rate * 100) : 0;
              const gapColor =
                gapPct >= 80 ? "text-red-600 font-semibold" :
                gapPct >= 60 ? "text-orange-600 font-medium" :
                gapPct >= 20 ? "text-slate-500" : "text-green-600";

              return (
                // Keyed on the Fragment, not the <tr>: a map's key belongs on the outermost
                // element returned, and a bare <>…</> cannot carry one.
                <Fragment key={q}>
                  <tr
                    className={`border-b border-slate-100 cursor-pointer hover:bg-slate-50 ${isExpanded ? "bg-slate-50" : ""}`}
                    onClick={() => setExpandedQuestion(isExpanded ? null : q)}
                  >
                    <td className="px-3 py-2.5 sticky left-0 bg-inherit z-10">
                      <div className="flex items-start gap-2">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-slate-900 truncate" title={q}>{q}</div>
                          {summary && (
                            <span className={`inline-block mt-0.5 text-[10px] px-1.5 py-0.5 rounded border ${answerTypeColors[summary.answer_type] || answerTypeColors.definition}`}>
                              {summary.answer_type}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="text-center px-2 py-2.5">
                      <span className={gapColor}>{gapPct}%</span>
                    </td>
                    <td className="text-center px-2 py-2.5">
                      {summary?.self_level ? (
                        <span className={`inline-block w-5 h-5 rounded border ${levelConfig[summary.self_level as keyof typeof levelConfig]?.color}`}>
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    {sortedCompetitors.filter((c) => c.id !== "self").map((c) => {
                      const cell = data.cells[q]?.[c.id];
                      if (!cell) {
                        return (
                          <td key={c.id} className="text-center px-2 py-2.5">
                            <span className="text-slate-300">—</span>
                          </td>
                        );
                      }
                      const cfg = levelConfig[cell.level];
                      const Icon = cfg.icon;
                      return (
                        <td key={c.id} className="text-center px-2 py-2.5">
                          <div
                            className={`inline-flex items-center justify-center w-7 h-7 rounded border ${cfg.color}`}
                            title={`${cfg.label} · specificity ${cell.specificity} · coverage ${(cell.term_coverage * 100).toFixed(0)}%`}
                          >
                            <Icon className="h-3.5 w-3.5" />
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                  {isExpanded && (
                    <tr key={`${q}-detail`} className="border-b border-slate-200 bg-slate-50/50">
                      <td colSpan={sortedCompetitors.length + 3} className="px-6 py-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                          {sortedCompetitors.map((c) => {
                            const cell = data.cells[q]?.[c.id];
                            if (!cell) return null;
                            const cfg = levelConfig[cell.level];
                            return (
                              <div key={c.id} className="rounded-md border border-slate-200 bg-white p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className={`w-3 h-3 rounded border ${cfg.color}`} />
                                  <span className="font-medium text-sm text-slate-700">{c.label}</span>
                                  <span className="ml-auto text-xs text-slate-400">
                                    spec {cell.specificity} · cov {(cell.term_coverage * 100).toFixed(0)}%
                                  </span>
                                </div>
                                {cell.heading && (
                                  <div className="text-xs font-medium text-slate-500 mb-1">
                                    H: {cell.heading}
                                  </div>
                                )}
                                {cell.passage ? (
                                  <p className="text-xs text-slate-600 line-clamp-4">
                                    &ldquo;{cell.passage}&rdquo;
                                  </p>
                                ) : (
                                  <p className="text-xs text-slate-400 italic">No passage matched</p>
                                )}
                                {cell.gap_evidence && cell.level === "lexical" && (
                                  <div className="mt-2 pt-2 border-t border-slate-100">
                                    <p className="text-[10px] font-medium text-amber-600 mb-0.5">Gap evidence:</p>
                                    <p className="text-xs text-slate-500 line-clamp-3">
                                      &ldquo;{cell.gap_evidence}&rdquo;
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {filteredQuestions.length === 0 && (
        <div className="text-center py-12 text-slate-400">
          No questions match the current filter.
        </div>
      )}

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-2xl font-bold text-slate-900">{data.questions.length}</div>
          <div className="text-xs text-slate-500">Questions analysed</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-2xl font-bold text-green-600">
            {data.field_summary.filter((s) => s.answered === s.total).length}
          </div>
          <div className="text-xs text-slate-500">Fully answered by field</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-2xl font-bold text-red-600">
            {data.field_summary.filter((s) => s.answered === 0).length}
          </div>
          <div className="text-xs text-slate-500">Coverage gaps (nobody answers)</div>
        </div>
        <div className="rounded-lg border border-slate-200 p-4">
          <div className="text-2xl font-bold text-yellow-600">
            {data.field_summary.filter((s) => s.lexical > 0 && s.answered === 0).length}
          </div>
          <div className="text-xs text-slate-500">Depth gaps (discussed but not answered)</div>
        </div>
      </div>
    </div>
  );
}
