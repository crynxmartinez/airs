"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ReportShell, ReportSection } from "@/components/report-shell";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  Radar, ResponsiveContainer, Tooltip as RechartsTooltip,
} from "recharts";
import type { Evaluation, Competitor, Evidence, Finding, Recommendation, DimensionScore } from "@/types";

interface CoverageRow {
  id: string;
  competitor_id: string;
  competitor_label: string;
  question: string;
  answer_type: string;
  level: string;
  score: number;
  specificity: number;
  is_depth_gap: number;
  passage: string | null;
  heading: string | null;
}

interface AiCitation {
  id: string;
  url: string;
  is_self: number;
}

interface ReportData {
  evaluation: Evaluation;
  competitors: Competitor[];
  evidence: Evidence[];
  findings: Finding[];
  recommendations: Recommendation[];
  scores: (DimensionScore & { competitor_name: string | null })[];
  coverage: CoverageRow[];
  aiCitations: AiCitation[];
}

const dimLabels: Record<string, string> = {
  intent: "Intent", content: "Content", trust: "Trust",
  ux: "UX", technical: "Technical", competitive: "Competitive",
  ecosystem: "Ecosystem",
};

const legacyMap: Record<string, string> = {
  D1: "intent", D2: "content", D3: "trust", D4: "ux", D5: "technical", D6: "competitive", D7: "ecosystem",
};

function normalizeDimCode(code: string | null): string {
  if (!code) return "";
  return legacyMap[code] || code;
}

const dimTooltips: Record<string, string> = {
  intent: "Intent Alignment: How well the content matches what users are actually searching for. Measures keyword targeting, query intent matching, and topical relevance.",
  content: "Content Excellence: Quality, depth, and structure of content. Measures comprehensiveness, readability, use of examples, and freshness.",
  trust: "Trust & Authority: Signals that establish credibility — author expertise, citations, reviews, domain age, and external references.",
  ux: "User Experience: How usable and accessible the page is — load speed, mobile responsiveness, navigation clarity, and Core Web Vitals.",
  technical: "Technical Excellence: Under-the-hood factors — structured data, meta tags, crawlability, indexability, and schema markup.",
  competitive: "Competitive Position: How the site stacks up against direct competitors in search results — ranking positions, share of voice, and SERP features.",
  ecosystem: "Ecosystem Presence: Presence across platforms — Google Business Profile, social media, directories, and other ecosystem touchpoints.",
};

const dimKeys = ["intent", "content", "trust", "ux", "technical", "competitive", "ecosystem"];

function scoreColor(score: number | null | undefined): string {
  if (score == null) return "text-slate-400";
  if (score >= 70) return "text-green-600";
  if (score >= 40) return "text-amber-600";
  return "text-red-600";
}

function scoreBg(score: number | null | undefined): string {
  if (score == null) return "bg-slate-50";
  if (score >= 70) return "bg-green-50";
  if (score >= 40) return "bg-amber-50";
  return "bg-red-50";
}

function hostOf(url: string): string {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.replace("www.", "");
  } catch {
    return url;
  }
}

export default function ReportPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const evalId = params.id as string;
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/evaluations/${evalId}/report`).then((r) => r.json()).then((d) => {
      setData(d);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [evalId]);

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (!data) return <p className="text-slate-500">Report not found</p>;

  const { evaluation: ev, competitors, evidence, findings, recommendations: recs, scores, coverage, aiCitations } = data;

  // AI citation check
  const selfCited = aiCitations.some((c) => c.is_self === 1);

  // Self vs field competitors
  const selfCompetitor = competitors.find((c) => c.competitor_type === "self");
  const fieldCompetitors = competitors.filter((c) => c.competitor_type !== "self");
  const selfScores = selfCompetitor ? scores.filter((s) => s.competitor_id === selfCompetitor.id) : [];
  const selfOverall = selfCompetitor?.score ?? null;

  const dimAvgs = dimKeys.map((dim) => {
    const ds = scores.filter((s) => {
      const comp = competitors.find((c) => c.id === s.competitor_id);
      return normalizeDimCode(s.dimension_code) === dim && comp?.competitor_type !== "self";
    });
    const avg = ds.length > 0 ? Math.round(ds.reduce((a, s) => a + s.score, 0) / ds.length) : 0;
    return { key: dim, label: dimLabels[dim], avg };
  });
  const fieldAvg = fieldCompetitors.length > 0
    ? Math.round(fieldCompetitors.reduce((a, c) => a + (c.score ?? 0), 0) / fieldCompetitors.length)
    : 0;
  const opportunityFindings = findings.filter((f) => f.type === "opportunity" || f.type === "weakness");
  const highImpactFindings = findings.filter((f) => f.type === "gap" || f.type === "standard");

  // Coverage questions list
  const coverageQuestions: string[] = [];
  const qSet = new Set<string>();
  for (const r of coverage) {
    if (!qSet.has(r.question)) { qSet.add(r.question); coverageQuestions.push(r.question); }
  }

  // Self radar data for overlay
  const selfRadarData = dimKeys.map((dim) => {
    const ds = selfScores.find((s) => normalizeDimCode(s.dimension_code) === dim);
    return { dimension: dimLabels[dim], score: ds?.score ?? 0, field: dimAvgs.find((d) => d.key === dim)?.avg ?? 0 };
  });

  // Rank of self site among all competitors
  const allRanked = [...competitors].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const selfRank = selfCompetitor ? allRanked.findIndex((c) => c.id === selfCompetitor.id) + 1 : null;

  // Top 3 priorities (highest impact findings)
  const top3 = [...highImpactFindings, ...opportunityFindings].slice(0, 3);

  // Coverage per-question summary
  const coverageSummary = coverageQuestions.map((q) => {
    const qRows = coverage.filter((r) => r.question === q);
    const answered = qRows.filter((r) => r.level === "answered").length;
    const lexical = qRows.filter((r) => r.level === "lexical").length;
    const total = qRows.length;
    const gapRate = total > 0 ? Math.round((1 - answered / total) * 100) : 0;
    const selfCell = qRows.find((r) => r.competitor_id === "self");
    return { question: q, answered, lexical, total, gapRate, selfLevel: selfCell?.level ?? null };
  });

  const host = hostOf(ev.digital_asset_url);

  return (
    <ReportShell
      kind="AI Search Visibility Evaluation"
      subject={ev.primary_query}
      backHref={`/projects/${projectId}/evaluations/${evalId}`}
      backLabel="Back to evaluation"
      fileStem={`AIRS Evaluation — ${ev.primary_query}`}
      evalId={evalId}
      facts={[
        { label: "Your site", value: host },
        { label: "Market", value: ev.target_location || "All regions" },
        { label: "Intent", value: ev.search_intent },
        { label: "Competitors", value: String(fieldCompetitors.length) },
        { label: "Evidence items", value: String(evidence.length) },
        { label: "Field RRS", value: fieldAvg > 0 ? `${fieldAvg}/100` : "—" },
      ]}
    >
      {/* Executive Summary */}
      <ReportSection title="Executive Summary">
        <div className="grid grid-cols-3 gap-4">
          <div className={`report-block rounded-lg border border-slate-200 p-4 ${scoreBg(selfOverall ?? ev.rrs_score)}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{selfCompetitor ? "Your Site Score" : "Overall RRS"}</p>
            <p className={`mt-1 text-3xl font-bold ${scoreColor(selfOverall ?? ev.rrs_score)}`}>{selfOverall ?? ev.rrs_score ?? "—"}<span className="text-lg text-slate-400">/100</span></p>
            {selfCompetitor && fieldAvg > 0 && (
              <p className="mt-0.5 text-xs text-slate-400">Field average: {fieldAvg}/100</p>
            )}
          </div>
          <div className="report-block rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Rating</p>
            <p className="mt-1 text-3xl font-bold capitalize text-slate-800">{ev.rating ?? "—"}</p>
          </div>
          <div className="report-block rounded-lg border border-slate-200 p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Confidence</p>
            <p className="mt-1 text-3xl font-bold text-slate-800">{ev.confidence_score ?? "—"}</p>
            <p className="text-xs text-slate-400">{evidence.length} evidence items</p>
          </div>
        </div>

        {/* Narrative summary */}
        <div className="mt-5 space-y-2.5 text-sm leading-relaxed text-slate-600">
          {selfCompetitor && selfOverall !== null && (
            <p>
              <strong>Your site scores {selfOverall}/100</strong> — {selfOverall >= fieldAvg ? "above" : "below"} the competitor field average of {fieldAvg}/100.
              {selfRank && ` You rank ${selfRank}${selfRank === 1 ? "st" : selfRank === 2 ? "nd" : selfRank === 3 ? "rd" : "th"} of ${allRanked.length} sites evaluated.`}
            </p>
          )}
          {selfCited && (
            <p className="text-green-600"><strong>Your site is cited by AI engines</strong> — a positive signal for visibility.</p>
          )}
          {selfCompetitor && !selfCited && aiCitations.length > 0 && (
            <p className="text-red-600"><strong>Your site is not yet cited by AI engines</strong> — improving your scores will increase citation likelihood.</p>
          )}
        </div>

        {/* Top 3 Priorities */}
        {top3.length > 0 && (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
            <p className="mb-3 text-sm font-semibold text-slate-800">Top 3 Priorities</p>
            <ol className="space-y-2">
              {top3.map((f, i) => {
                const desc = f.description || "";
                const cleanDesc = desc.replace(/\*\*/g, "");
                const isHighImpact = f.type === "gap" || f.type === "standard";
                return (
                  <li key={f.id} className="flex items-start gap-3">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${isHighImpact ? "bg-red-500" : "bg-blue-500"}`}>{i + 1}</span>
                    <div>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${isHighImpact ? "bg-red-100 text-red-700" : "bg-blue-100 text-blue-700"}`}>
                        {isHighImpact ? "Fix" : "Opportunity"}
                      </span>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">{cleanDesc}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        )}
      </ReportSection>

      {/* Your Site Performance */}
      {selfCompetitor && (
        <ReportSection title="Your Site Performance" hint="How your site compares to the competitive field across all dimensions">
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">{selfCompetitor.url}</p>
                <p className="text-xs text-slate-500">{selfCompetitor.competitor_name || hostOf(selfCompetitor.url)}</p>
              </div>
              <div className="text-right">
                <p className={`text-3xl font-bold ${scoreColor(selfOverall)}`}>{selfOverall ?? "—"}<span className="text-lg text-slate-400">/100</span></p>
                <p className="text-xs text-slate-400">Field average: {fieldAvg}/100</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
              {dimKeys.map((dim) => {
                const v = selfScores.find((s) => normalizeDimCode(s.dimension_code) === dim)?.score;
                const fieldAvgForDim = dimAvgs.find((d) => d.key === dim)?.avg ?? 0;
                const diff = v != null ? v - fieldAvgForDim : null;
                return (
                  <div key={dim} className="rounded-lg border border-slate-200 bg-white p-3">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">{dimLabels[dim]}</p>
                    <p className={`mt-1 text-lg font-bold ${scoreColor(v)}`}>{v ?? "—"}</p>
                    {diff !== null && (
                      <p className={`text-[10px] ${diff > 0 ? "text-green-600" : diff < 0 ? "text-red-500" : "text-slate-400"}`}>
                        {diff > 0 ? "+" : ""}{diff} vs field
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </ReportSection>
      )}

      {/* Where You Stand */}
      {scores.length > 0 && (
        <ReportSection title="Where You Stand" hint="Your site vs the competitive field — dimension by dimension" breakBefore>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">Your site vs field average</p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={selfRadarData}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11, fill: "#64748b" }} />
                    <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                    <Radar name="Field Average" dataKey="field" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.15} strokeWidth={1.5} strokeDasharray="4 4" />
                    <Radar name="Your Site" dataKey="score" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} strokeWidth={2} />
                    <RechartsTooltip />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="space-y-3">
              {dimKeys.map((dim) => {
                const selfVal = selfScores.find((s) => normalizeDimCode(s.dimension_code) === dim)?.score;
                const fieldVal = dimAvgs.find((d) => d.key === dim)?.avg ?? 0;
                const diff = selfVal != null ? selfVal - fieldVal : null;
                const label = dimLabels[dim];
                let commentary = "";
                if (diff === null) {
                  commentary = "Not yet scored.";
                } else if (diff > 5) {
                  commentary = `Your ${label} score (${selfVal}) is above the field average (${fieldVal}). This is a strength.`;
                } else if (diff < -5) {
                  commentary = `Your ${label} score (${selfVal}) is below the field average (${fieldVal}). This needs attention.`;
                } else {
                  commentary = `Your ${label} score (${selfVal}) is on par with the field average (${fieldVal}).`;
                }
                return (
                  <div key={dim} className="report-block">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-slate-700">{label}</span>
                      <span className={`font-bold ${scoreColor(selfVal)}`}>{selfVal ?? "—"}<span className="text-slate-400"> / {fieldVal}</span></span>
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{commentary}</p>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className={`h-full rounded-full ${diff != null && diff > 5 ? "bg-green-500" : diff != null && diff < -5 ? "bg-red-500" : "bg-amber-500"}`}
                        style={{ width: `${selfVal ?? 0}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </ReportSection>
      )}

      {/* What's Missing */}
      {findings.length > 0 && (
        <ReportSection title="What's Missing" hint="Gaps your site needs to close, and opportunities the field is leaving open" breakBefore>
          <div className="space-y-5">
            {highImpactFindings.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-red-700">High Impact — Fix These First</h3>
                <div className="space-y-2">
                  {highImpactFindings.map((f) => {
                    const desc = (f.description || "").replace(/\*\*/g, "");
                    return (
                      <div key={f.id} className="report-block rounded-lg border border-red-100 bg-red-50/30 p-3">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 rounded bg-red-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-red-700 shrink-0">Fix</span>
                          <p className="text-sm leading-relaxed text-slate-700">{desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {opportunityFindings.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold text-blue-700">Opportunities — Gain an Edge</h3>
                <div className="space-y-2">
                  {opportunityFindings.map((f) => {
                    const desc = (f.description || "").replace(/\*\*/g, "");
                    return (
                      <div key={f.id} className="report-block rounded-lg border border-blue-100 bg-blue-50/30 p-3">
                        <div className="flex items-start gap-2">
                          <span className="mt-0.5 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-700 shrink-0">Opportunity</span>
                          <p className="text-sm leading-relaxed text-slate-700">{desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </ReportSection>
      )}

      {/* Recommendations */}
      {recs.length > 0 && (
        <ReportSection title="Recommendations" hint="Actionable steps to improve your scores" breakBefore>
          <div className="space-y-3">
            {recs.map((rec, i) => {
              const desc = rec.description || "";
              const stepsIdx = desc.indexOf("Action steps:");
              const summary = stepsIdx >= 0 ? desc.slice(0, stepsIdx).trim() : desc.trim();
              const stepsBlock = stepsIdx >= 0 ? desc.slice(stepsIdx + "Action steps:".length).trim() : "";
              const steps = stepsBlock.split("\n").map(s => s.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
              return (
                <div key={rec.id} className="report-block rounded-lg border border-slate-200 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">{i + 1}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-slate-800">{rec.title}</p>
                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${rec.priority === "high" ? "bg-red-100 text-red-700" : rec.priority === "medium" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          {rec.priority}
                        </span>
                        {rec.effort && (
                          <span className="rounded bg-slate-50 px-2 py-0.5 text-[10px] text-slate-500">{rec.effort} effort</span>
                        )}
                      </div>
                      {summary && <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{summary}</p>}
                      {steps.length > 0 && (
                        <div className="mt-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Action steps</p>
                          <ul className="mt-1 space-y-1">
                            {steps.map((step, si) => (
                              <li key={si} className="flex items-start gap-2 text-sm text-slate-600">
                                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {rec.expected_impact && (
                        <p className="mt-2 text-xs font-medium text-green-600">
                          Expected impact: {rec.expected_impact.replace(/\bD[1-7]\b/g, (m) => dimLabels[legacyMap[m]] || m)}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ReportSection>
      )}

      {/* Coverage Summary */}
      {coverageSummary.length > 0 && (
        <ReportSection title="Coverage Summary" hint="How well the field answers each question — and where your site stands" breakBefore>
          <div className="space-y-4">
            {coverageSummary.map((cs, i) => (
              <div key={i} className="report-block rounded-lg border border-slate-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{cs.question}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {cs.answered} of {cs.total} competitors answer this · {cs.lexical} mention it but don't answer
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-lg font-bold ${cs.gapRate >= 70 ? "text-red-600" : cs.gapRate >= 40 ? "text-amber-600" : "text-green-600"}`}>
                      {cs.gapRate}%
                    </p>
                    <p className="text-[10px] text-slate-400">gap rate</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-3 overflow-hidden rounded-full bg-slate-100 flex">
                    <div className="h-full bg-green-500" style={{ width: `${(cs.answered / cs.total) * 100}%` }} />
                    <div className="h-full bg-amber-400" style={{ width: `${(cs.lexical / cs.total) * 100}%` }} />
                  </div>
                </div>
                {cs.selfLevel && (
                  <p className="mt-2 text-xs">
                    <span className="font-medium text-slate-700">Your site: </span>
                    <span className={`font-semibold ${cs.selfLevel === "answered" ? "text-green-600" : cs.selfLevel === "lexical" ? "text-amber-600" : "text-red-600"}`}>
                      {cs.selfLevel === "answered" ? "Answers this question" : cs.selfLevel === "lexical" ? "Mentions but doesn't answer" : "Does not address this"}
                    </span>
                  </p>
                )}
              </div>
            ))}
          </div>
        </ReportSection>
      )}

      {/* Competitor Index — Proof of Evaluation */}
      {fieldCompetitors.length > 0 && (
        <ReportSection title="Competitor Index" hint="All sites evaluated as part of this analysis" breakBefore>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-slate-300 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">#</th>
                  <th className="px-4 py-3">Website</th>
                  <th className="px-4 py-3">Score</th>
                  <th className="px-4 py-3">Rating</th>
                </tr>
              </thead>
              <tbody>
                {fieldCompetitors.map((comp, i) => {
                  const score = comp.score ?? 0;
                  const rating = score >= 90 ? "Platinum" : score >= 75 ? "Gold" : score >= 60 ? "Silver" : score >= 40 ? "Bronze" : "Foundation";
                  return (
                    <tr key={comp.id} className={`border-b border-slate-100 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}`}>
                      <td className="px-4 py-3 text-slate-400">{i + 1}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{hostOf(comp.url)}</td>
                      <td className={`px-4 py-3 font-bold ${scoreColor(comp.score)}`}>{comp.score ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${
                          rating === "Platinum" ? "bg-purple-100 text-purple-700" :
                          rating === "Gold" ? "bg-yellow-100 text-yellow-700" :
                          rating === "Silver" ? "bg-slate-100 text-slate-700" :
                          rating === "Bronze" ? "bg-orange-100 text-orange-700" :
                          "bg-red-100 text-red-700"
                        }`}>{rating}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </ReportSection>
      )}

      {/* Glossary — Appendix */}
      <ReportSection title="Appendix: Glossary" breakBefore>
        <div className="space-y-4 text-sm">
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Scores & Metrics</h3>
            <dl className="space-y-2">
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Your Site Score</dt>
                <dd className="mt-0.5 text-slate-600">How well your site competes in AI and Google search results. Scored 0–100. 70+ = strong, 40–69 = needs work, below 40 = critical.</dd>
              </div>
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Field Average</dt>
                <dd className="mt-0.5 text-slate-600">The average score of all competitors evaluated, excluding your own site. Shown alongside your score for comparison.</dd>
              </div>
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Rating</dt>
                <dd className="mt-0.5 text-slate-600">Classifies your site's performance into bands: Platinum (90+), Gold (75–89), Silver (60–74), Bronze (40–59), Foundation (below 40).</dd>
              </div>
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Confidence</dt>
                <dd className="mt-0.5 text-slate-600">Reflects how reliable the evaluation is, based on evidence collected and competitors analyzed. Higher means more data backs the scores.</dd>
              </div>
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Rank</dt>
                <dd className="mt-0.5 text-slate-600">Where your site places among all sites evaluated (e.g. 8th of 14). Includes both your site and competitors.</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Dimensions</h3>
            <dl className="space-y-2">
              {Object.entries(dimTooltips).map(([key, desc]) => (
                <div key={key} className="report-block border-b border-slate-100 pb-2">
                  <dt className="font-medium text-slate-800">{dimLabels[key]}</dt>
                  <dd className="mt-0.5 text-slate-600">{desc}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Report Sections</h3>
            <dl className="space-y-2">
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Top 3 Priorities</dt>
                <dd className="mt-0.5 text-slate-600">The most urgent findings from the evaluation — things your site is missing that competitors have (Fix), or gaps in the field you can exploit (Opportunity). Start here.</dd>
              </div>
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Where You Stand</dt>
                <dd className="mt-0.5 text-slate-600">A dimension-by-dimension comparison of your site vs the field average. Each dimension includes plain-English commentary on whether it's a strength, on par, or needs attention.</dd>
              </div>
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">What's Missing</dt>
                <dd className="mt-0.5 text-slate-600">Findings split into two groups: High Impact (things competitors have that your site doesn't — fix these first) and Opportunities (gaps most competitors miss — fixing these gives you an edge).</dd>
              </div>
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Coverage Summary</dt>
                <dd className="mt-0.5 text-slate-600">For each question evaluated, shows how many competitors answer it, the gap rate, and whether your site answers it. High gap rates indicate a field-wide opportunity.</dd>
              </div>
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">AI Citation Status</dt>
                <dd className="mt-0.5 text-slate-600">Whether AI engines (e.g. ChatGPT, Claude) currently cite your site when answering relevant queries. Being cited improves your visibility in AI-powered search.</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Finding Types</h3>
            <dl className="space-y-2">
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">High Impact (Fix)</dt>
                <dd className="mt-0.5 text-slate-600">Most competitors have this and your site does not. You are the outlier — fixing this is critical to reach parity with the field.</dd>
              </div>
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Opportunity</dt>
                <dd className="mt-0.5 text-slate-600">A gap most competitors miss. Fixing this differentiates you and gives you an edge over the field.</dd>
              </div>
            </dl>
          </div>

          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Coverage Levels</h3>
            <dl className="space-y-2">
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Answered</dt>
                <dd className="mt-0.5 text-slate-600">The page directly and substantively answers the question being asked.</dd>
              </div>
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Lexical</dt>
                <dd className="mt-0.5 text-slate-600">The page mentions relevant terms but does not actually answer the question.</dd>
              </div>
              <div className="report-block border-b border-slate-100 pb-2">
                <dt className="font-medium text-slate-800">Gap Rate</dt>
                <dd className="mt-0.5 text-slate-600">The percentage of competitors that fail to answer a given question. High gap rates indicate a field-wide opportunity.</dd>
              </div>
            </dl>
          </div>
        </div>
      </ReportSection>

    </ReportShell>
  );
}
