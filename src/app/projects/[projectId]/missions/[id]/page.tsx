"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Loader2, AlertCircle, CheckCircle2, Circle, Trash2, Target, Search, Globe, AlertTriangle, ChevronDown, ChevronRight, RefreshCw, FileText, TrendingUp, ArrowRight } from "lucide-react";
import type { Mission, MissionTask } from "@/types";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/confirm-dialog";

interface AuditCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  value: string;
  detail: string;
  recommendation: string;
  category: string;
}

interface AuditResult {
  url: string;
  checks: AuditCheck[];
  summary: { passed: number; warnings: number; failed: number };
  total_score: number;
  tasks_created: number;
}

interface MissionDetail extends Mission {
  tasks: MissionTask[];
  site_url: string | null;
  audit_data: { url: string; checks: AuditCheck[]; summary: { passed: number; warned: number; failed: number } } | null;
}

const PHASES = [
  { key: "phase1", label: "Foundation & Quick Wins", timeline: "Month 1", description: "Fix technical fundamentals from your site audit. These are quick wins — HTTPS, meta tags, heading structure, page speed, Schema.org. Fast to implement, high impact." },
  { key: "phase2", label: "Content & On-Page Optimization", timeline: "Month 2-3", description: "Build content that ranks. Create FAQ pages, expand thin content, add pricing transparency, and optimize on-page elements. This is where you start gaining ground on competitors." },
  { key: "phase3", label: "Authority & Trust Building", timeline: "Month 4-6", description: "Establish credibility signals that AI systems and search engines reward. Add author bios, display licenses, collect reviews, build social media presence, and earn third-party citations." },
  { key: "phase4", label: "Scale & AI Visibility", timeline: "Month 7-12", description: "Long-term strategic work — topic clusters, digital PR, Answer Engine Optimization (AEO) for ChatGPT/Perplexity, content refresh cycles, and competitive positioning. This is where compounding growth happens." },
];

export default function MissionDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const missionId = params.id as string;
  const [mission, setMission] = useState<MissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [auditUrl, setAuditUrl] = useState("");
  const [auditing, setAuditing] = useState(false);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [auditError, setAuditError] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>("failed");
  const [verifyingTaskId, setVerifyingTaskId] = useState<string | null>(null);
  const [verifyResults, setVerifyResults] = useState<Record<string, { passed: boolean; detail: string; currentValue: string }>>({});
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(new Set());

  const loadData = useCallback(() => {
    fetch(`/api/missions/${missionId}`).then((r) => r.json()).then((d) => {
      setMission(d);
      if (d.site_url && !auditUrl) setAuditUrl(d.site_url);
      if (d.audit_data && !auditResult) setAuditResult(d.audit_data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [missionId, auditUrl, auditResult]);

  useEffect(() => { loadData(); }, [loadData]);

  function togglePhase(phaseKey: string) {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseKey)) next.delete(phaseKey);
      else next.add(phaseKey);
      return next;
    });
  }

  async function deleteMission() {
    await fetch(`/api/missions/${missionId}`, { method: "DELETE" });
    window.location.href = `/projects/${projectId}/missions`;
  }

  async function verifyTask(taskId: string) {
    setVerifyingTaskId(taskId);
    try {
      const res = await fetch(`/api/missions/${missionId}/tasks/${taskId}/verify`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Verification failed");
      setVerifyResults((prev) => ({
        ...prev,
        [taskId]: { passed: data.passed, detail: data.detail, currentValue: data.currentValue },
      }));
      if (data.passed) loadData();
    } catch (err) {
      setVerifyResults((prev) => ({
        ...prev,
        [taskId]: { passed: false, detail: err instanceof Error ? err.message : "Verification failed", currentValue: "" },
      }));
    }
    setVerifyingTaskId(null);
  }

  async function runSelfAudit() {
    if (!auditUrl) return;
    setAuditing(true);
    setAuditError(null);
    setAuditResult(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/self-audit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: auditUrl }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Self-audit failed");
      setAuditResult(data);
      loadData();
    } catch (err) {
      setAuditError(err instanceof Error ? err.message : "Self-audit failed");
    }
    setAuditing(false);
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>;
  if (!mission) return (
    <div className="py-20 text-center">
      <AlertCircle className="mx-auto mb-3 h-10 w-10 text-slate-300" />
      <p className="text-slate-500">Mission not found</p>
    </div>
  );

  const done = mission.tasks.filter((t) => t.status === "done").length;
  const progress = mission.tasks.length > 0 ? Math.round((done / mission.tasks.length) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/projects/${projectId}/missions`} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{mission.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{done}/{mission.tasks.length} tasks · {progress}% complete</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/projects/${projectId}/missions/${missionId}/report`}>
            <Button variant="outline"><FileText className="h-4 w-4" />Report</Button>
          </Link>
          <Button variant="outline" onClick={() => setShowDeleteDialog(true)}><Trash2 className="h-4 w-4" />Delete</Button>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold text-slate-800">Overall Progress</h2>
          <span className="text-sm font-bold text-blue-600">{progress}%</span>
        </div>
        <div className="h-3 rounded-full bg-slate-100">
          <div className="h-3 rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Next Step Banner */}
      {progress > 0 && (
        <div className={`rounded-xl border p-4 ${progress === 100 ? "border-green-200 bg-green-50" : "border-blue-200 bg-blue-50"}`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-8 w-8 items-center justify-center rounded-full text-white ${progress === 100 ? "bg-green-600" : "bg-blue-600"}`}>
                {progress === 100 ? <CheckCircle2 className="h-4 w-4" /> : <Target className="h-4 w-4" />}
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  {progress === 100
                    ? "All tasks complete! Time to re-score"
                    : `${done} of ${mission.tasks.length} tasks done`}
                </p>
                <p className="text-xs text-slate-500">
                  {progress === 100
                    ? "Re-score your evaluation to see improvements, then check Benchmarks"
                    : "Keep completing tasks and verifying them with Check Website"}
                </p>
              </div>
            </div>
            {progress === 100 && mission.evaluation_id && (
              <div className="flex items-center gap-2">
                <Link href={`/projects/${projectId}/evaluations/${mission.evaluation_id}`}>
                  <Button variant="outline" className="px-3 py-1.5 text-xs">
                    <RefreshCw className="h-3.5 w-3.5" />
                    Re-score
                  </Button>
                </Link>
                <Link href={`/projects/${projectId}/benchmarks`}>
                  <Button className="px-3 py-1.5 text-xs">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Benchmarks
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Phase Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {PHASES.map((phase) => {
          const phaseTasks = mission.tasks.filter((t) => t.phase === phase.key);
          const phaseDone = phaseTasks.filter((t) => t.status === "done").length;
          const phaseProgress = phaseTasks.length > 0 ? Math.round((phaseDone / phaseTasks.length) * 100) : 0;
          return (
            <div key={phase.key} className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-2 mb-1">
                <Target className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-slate-800">{phase.label}</h3>
              </div>
              <p className="text-xs text-slate-400 mb-2">{phase.timeline}</p>
              <p className="text-xs text-slate-500 mb-3">{phaseTasks.length} task{phaseTasks.length !== 1 ? "s" : ""}</p>
              <div className="h-2 rounded-full bg-slate-100">
                <div className={`h-2 rounded-full transition-all ${phaseProgress === 100 ? "bg-green-500" : "bg-blue-500"}`} style={{ width: `${phaseProgress}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-400">{phaseDone}/{phaseTasks.length} done</p>
            </div>
          );
        })}
      </div>

      {/* Tasks by Phase */}
      {PHASES.map((phase) => {
        const phaseTasks = mission.tasks.filter((t) => t.phase === phase.key);
        const phaseDone = phaseTasks.filter((t) => t.status === "done").length;
        const isCollapsed = collapsedPhases.has(phase.key);
        return (
          <div key={phase.key} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
            <button
              onClick={() => togglePhase(phase.key)}
              className="w-full border-b border-slate-200 px-5 py-4 bg-slate-50/50 text-left hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-start gap-3">
                  {isCollapsed ? (
                    <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  ) : (
                    <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                  )}
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800">{phase.label}</h2>
                    <p className="mt-0.5 text-xs text-slate-500">{phase.timeline} · {phase.description}</p>
                  </div>
                </div>
                {phaseTasks.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 shrink-0">{phaseDone}/{phaseTasks.length} done</span>
                )}
              </div>
            </button>

            {!isCollapsed && (
            <>
            {/* Self-Audit Panel — only in Phase 1 */}
            {phase.key === "phase1" && (
              <div className="border-b border-slate-100 bg-blue-50/30 px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Self-Audit Your Website</h3>
                </div>
                <p className="text-xs text-slate-500 mb-3">Audit your site to automatically populate Phase 1 with critical fixes. Each failed check becomes an actionable task.</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="url"
                      placeholder="https://yourwebsite.com"
                      value={auditUrl}
                      onChange={(e) => setAuditUrl(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && runSelfAudit()}
                      className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  <Button onClick={runSelfAudit} disabled={auditing || !auditUrl}>
                    {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Run Audit
                  </Button>
                </div>

                {auditError && (
                  <p className="mt-2 text-sm text-red-600">{auditError}</p>
                )}

                {auditResult && (
                  <div className="mt-4 space-y-3">
                    {/* Audit Score */}
                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-center">
                        <p className={`text-3xl font-bold ${auditResult.total_score >= 80 ? "text-green-600" : auditResult.total_score >= 60 ? "text-yellow-600" : auditResult.total_score >= 40 ? "text-orange-600" : "text-red-600"}`}>
                          {auditResult.total_score}
                        </p>
                        <p className="text-xs text-slate-400">/ 100</p>
                      </div>
                      <div className="flex-1">
                        <div className="h-2 rounded-full bg-slate-100">
                          <div className={`h-2 rounded-full transition-all ${auditResult.total_score >= 80 ? "bg-green-500" : auditResult.total_score >= 60 ? "bg-yellow-500" : auditResult.total_score >= 40 ? "bg-orange-500" : "bg-red-500"}`} style={{ width: `${auditResult.total_score}%` }} />
                        </div>
                        <div className="mt-2 flex gap-3 text-xs">
                          <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-green-500" /> {auditResult.summary.passed} passed</span>
                          <span className="flex items-center gap-1"><AlertTriangle className="h-3 w-3 text-yellow-500" /> {auditResult.summary.warnings} warnings</span>
                          <span className="flex items-center gap-1"><AlertCircle className="h-3 w-3 text-red-500" /> {auditResult.summary.failed} failed</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-blue-600">{auditResult.tasks_created}</p>
                        <p className="text-xs text-slate-400">tasks added</p>
                      </div>
                    </div>

                    {/* Collapsible audit details */}
                    {[
                      { key: "failed", label: "Failed", icon: AlertCircle, color: "red", checks: auditResult.checks.filter((c) => c.status === "fail") },
                      { key: "warnings", label: "Warnings", icon: AlertTriangle, color: "yellow", checks: auditResult.checks.filter((c) => c.status === "warn") },
                      { key: "passed", label: "Passed", icon: CheckCircle2, color: "green", checks: auditResult.checks.filter((c) => c.status === "pass") },
                    ].map((section) => {
                      const Icon = section.icon;
                      const colorMap: Record<string, string> = {
                        red: "text-red-500 bg-red-50 border-red-200",
                        yellow: "text-yellow-500 bg-yellow-50 border-yellow-200",
                        green: "text-green-500 bg-green-50 border-green-200",
                      };
                      const isOpen = expandedSection === section.key;
                      return (
                        <div key={section.key} className={`rounded-lg border ${colorMap[section.color]} overflow-hidden`}>
                          <button
                            onClick={() => setExpandedSection(isOpen ? null : section.key)}
                            className="flex w-full items-center justify-between px-3 py-2.5"
                          >
                            <div className="flex items-center gap-2">
                              <Icon className="h-4 w-4" />
                              <span className="text-sm font-semibold text-slate-700">{section.label}</span>
                              <span className="rounded-full bg-white/80 px-2 py-0.5 text-xs font-medium text-slate-600">{section.checks.length}</span>
                            </div>
                            {isOpen ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                          </button>
                          {isOpen && (
                            <div className="border-t border-slate-200/50 bg-white/60 divide-y divide-slate-100">
                              {section.checks.map((check, i) => (
                                <div key={i} className="px-3 py-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-slate-700">{check.name}</span>
                                    <span className="text-xs font-medium text-slate-400">{check.value}</span>
                                  </div>
                                  <p className="mt-0.5 text-xs text-slate-500">{check.detail}</p>
                                  {check.recommendation && (
                                    <p className="mt-1 text-xs text-slate-400">
                                      <span className="font-semibold">Fix: </span>{check.recommendation}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Phase tasks */}
            {phaseTasks.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {phaseTasks.map((task) => {
                  const verifyResult = verifyResults[task.id];
                  const isVerifying = verifyingTaskId === task.id;

                  return (
                    <div key={task.id} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        {task.status === "done" ? (
                          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                        ) : (
                          <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
                        )}
                        <div className="flex-1">
                          <span className={`text-sm font-medium ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                            {task.title}
                          </span>
                          {task.description && (
                            <p className={`mt-1 text-xs ${task.status === "done" ? "text-slate-300" : "text-slate-500"}`}>{task.description}</p>
                          )}

                          {/* Verify result */}
                          {verifyResult && (
                            <div className={`mt-2 rounded-lg border p-2.5 text-xs ${
                              verifyResult.passed
                                ? "border-green-200 bg-green-50 text-green-700"
                                : "border-orange-200 bg-orange-50 text-orange-700"
                            }`}>
                              <div className="flex items-center gap-1.5">
                                {verifyResult.passed ? (
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                ) : (
                                  <AlertCircle className="h-3.5 w-3.5" />
                                )}
                                <span className="font-medium">{verifyResult.passed ? "Verified — issue resolved!" : "Not yet fixed"}</span>
                              </div>
                              <p className="mt-1">{verifyResult.detail}</p>
                              {verifyResult.currentValue && (
                                <p className="mt-0.5 text-slate-500">Current: {verifyResult.currentValue}</p>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Check Website button — always shown for undone tasks */}
                        {task.status !== "done" && (
                          <Button
                            variant="outline"
                            onClick={() => verifyTask(task.id)}
                            disabled={isVerifying}
                            className="shrink-0 px-3 py-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                          >
                            {isVerifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                            Check Website
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : phase.key !== "phase1" ? null : (
              <div className="px-5 py-6 text-center">
                <p className="text-sm text-slate-400">No critical fixes yet. Run the self-audit above to populate this phase.</p>
              </div>
            )}
            </>
            )}
          </div>
        );
      })}

      {/* Tasks without a phase (legacy) */}
      {mission.tasks.filter((t) => !t.phase).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Other Tasks</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {mission.tasks.filter((t) => !t.phase).map((task) => {
              const verifyResult = verifyResults[task.id];
              const isVerifying = verifyingTaskId === task.id;
              return (
                <div key={task.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    {task.status === "done" ? (
                      <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                    ) : (
                      <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />
                    )}
                    <div className="flex-1">
                      <span className={`text-sm font-medium ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                        {task.title}
                      </span>
                      {task.description && (
                        <p className={`mt-1 text-xs ${task.status === "done" ? "text-slate-300" : "text-slate-500"}`}>{task.description}</p>
                      )}
                      {verifyResult && (
                        <div className={`mt-2 rounded-lg border p-2.5 text-xs ${
                          verifyResult.passed ? "border-green-200 bg-green-50 text-green-700" : "border-orange-200 bg-orange-50 text-orange-700"
                        }`}>
                          <span className="font-medium">{verifyResult.passed ? "Verified — issue resolved!" : "Not yet fixed"}</span>
                          <p className="mt-1">{verifyResult.detail}</p>
                        </div>
                      )}
                    </div>
                    {task.status !== "done" && (
                      <Button
                        variant="outline"
                        onClick={() => verifyTask(task.id)}
                        disabled={isVerifying}
                        className="shrink-0 px-3 py-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      >
                        {isVerifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        Check Website
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={showDeleteDialog}
        title="Delete mission?"
        message="This mission and all its tasks will be permanently deleted. The evaluation data will remain. This cannot be undone."
        onConfirm={deleteMission}
        onCancel={() => setShowDeleteDialog(false)}
      />
    </div>
  );
}
