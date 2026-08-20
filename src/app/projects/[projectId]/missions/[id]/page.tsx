"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, Loader2, AlertCircle, CheckCircle2, Circle, Trash2, Target,
  Search, Globe, AlertTriangle, ChevronDown, ChevronRight, RefreshCw,
  FileText, TrendingUp, ArrowRight, Edit2, Check, X, Download, Sparkles,
  ExternalLink, BarChart3, Award, Ship,
} from "lucide-react";
import type { Mission, MissionTask, ContentBrief, CitationDashboard } from "@/types";
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

interface MissionTaskWithBrief extends MissionTask {
  content_brief: ContentBrief | null;
}

interface MissionDetail extends Mission {
  tasks: MissionTaskWithBrief[];
  site_url: string | null;
  audit_data: { url: string; checks: AuditCheck[]; summary: { passed: number; warned: number; failed: number } } | null;
}

const PHASES = [
  { key: "phase1", label: "Foundation & Quick Wins", timeline: "Month 1", description: "Fix technical fundamentals from your site audit. These are quick wins — HTTPS, meta tags, heading structure, page speed, Schema.org. Fast to implement, high impact." },
  { key: "phase2", label: "Content & On-Page Optimization", timeline: "Month 2-3", description: "Build content that ranks. Create FAQ pages, expand thin content, add pricing transparency, and optimize on-page elements. This is where you start gaining ground on competitors." },
  { key: "phase3", label: "Authority & Trust Building", timeline: "Month 4-6", description: "Establish credibility signals that AI systems and search engines reward. Add author bios, display licenses, collect reviews, build social media presence, and earn third-party citations." },
  { key: "phase4", label: "Scale & AI Visibility", timeline: "Month 7-12", description: "Long-term strategic work — topic clusters, digital PR, Answer Engine Optimization (AEO) for ChatGPT/Perplexity, content refresh cycles, and competitive positioning. This is where compounding growth happens." },
];

const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  coverage_gap: { label: "Gap", color: "bg-orange-100 text-orange-700" },
  content_brief: { label: "Brief", color: "bg-purple-100 text-purple-700" },
  finding: { label: "Finding", color: "bg-blue-100 text-blue-700" },
  self_audit: { label: "Audit", color: "bg-teal-100 text-teal-700" },
  strategic: { label: "Strategic", color: "bg-slate-100 text-slate-600" },
};

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
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [citation, setCitation] = useState<CitationDashboard | null>(null);
  const [citationLoading, setCitationLoading] = useState(false);
  const [citationChecking, setCitationChecking] = useState(false);
  const [generatingTaskId, setGeneratingTaskId] = useState<string | null>(null);
  const [generateResults, setGenerateResults] = useState<Record<string, { content: string; wordCount: number; style: string; sources: { title: string; url: string }[]; selfCitations: number }>>({});
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [expandedDrafts, setExpandedDrafts] = useState<Set<string>>(new Set());
  const [shippingTaskId, setShippingTaskId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    fetch(`/api/missions/${missionId}`).then((r) => r.json()).then((d) => {
      setMission(d);
      if (d.site_url && !auditUrl) setAuditUrl(d.site_url);
      if (d.audit_data && !auditResult) setAuditResult(d.audit_data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [missionId, auditUrl, auditResult]);

  const loadCitation = useCallback(() => {
    setCitationLoading(true);
    fetch(`/api/missions/${missionId}/citation`).then((r) => r.json()).then((d) => {
      if (!d.error) setCitation(d);
      setCitationLoading(false);
    }).catch(() => setCitationLoading(false));
  }, [missionId]);

  useEffect(() => { loadData(); loadCitation(); }, [loadData, loadCitation]);

  function togglePhase(phaseKey: string) {
    setCollapsedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phaseKey)) next.delete(phaseKey);
      else next.add(phaseKey);
      return next;
    });
  }

  function toggleDraft(taskId: string) {
    setExpandedDrafts((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  async function saveName() {
    if (!nameValue.trim() || !mission) return;
    setSavingName(true);
    try {
      await fetch(`/api/missions/${missionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nameValue.trim() }),
      });
      setMission({ ...mission, name: nameValue.trim() });
      setEditingName(false);
    } catch (err) { console.error("[page.tsx]", err); }
    setSavingName(false);
  }

  async function deleteMission() {
    await fetch(`/api/missions/${missionId}`, { method: "DELETE" });
    window.location.href = `/projects/${projectId}/missions`;
  }

  async function verifyTask(taskId: string) {
    setVerifyingTaskId(taskId);
    try {
      const res = await fetch(`/api/missions/${missionId}/tasks/${taskId}/verify`, { method: "POST" });
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

  async function runCitationCheck() {
    setCitationChecking(true);
    try {
      const res = await fetch(`/api/missions/${missionId}/citation`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Citation check failed");
      loadCitation();
    } catch (err) {
      console.error("[citation check]", err);
    }
    setCitationChecking(false);
  }

  async function generateContent(taskId: string) {
    setGeneratingTaskId(taskId);
    setGenerateError(null);
    try {
      const res = await fetch(`/api/missions/${missionId}/tasks/${taskId}/generate`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed");
      setGenerateResults((prev) => ({
        ...prev,
        [taskId]: {
          content: data.content,
          wordCount: data.wordCount,
          style: data.style,
          sources: data.sources,
          selfCitations: data.selfCitations,
        },
      }));
      setExpandedDrafts((prev) => new Set(prev).add(taskId));
      loadData();
    } catch (err) {
      setGenerateError(err instanceof Error ? err.message : "Generation failed");
    }
    setGeneratingTaskId(null);
  }

  async function shipBrief(taskId: string) {
    setShippingTaskId(taskId);
    try {
      const res = await fetch(`/api/missions/${missionId}/tasks/${taskId}/ship`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to ship");
      loadData();
    } catch (err) {
      console.error("[ship]", err);
    }
    setShippingTaskId(null);
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
            {editingName ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={nameValue}
                  onChange={(e) => setNameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveName();
                    if (e.key === "Escape") setEditingName(false);
                  }}
                  autoFocus
                  className="rounded-lg border border-blue-400 px-3 py-1.5 text-2xl font-bold text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button onClick={saveName} disabled={savingName} className="rounded-lg p-2 text-green-600 hover:bg-green-50">
                  {savingName ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" />}
                </button>
                <button onClick={() => setEditingName(false)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100">
                  <X className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold text-slate-900">{mission.name}</h1>
                <button
                  onClick={() => { setNameValue(mission.name); setEditingName(true); }}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                  title="Rename mission"
                >
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
            )}
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

      {/* Citation Dashboard */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Award className="h-5 w-5 text-blue-500" />
            <h2 className="text-sm font-semibold text-slate-800">Citation Dashboard</h2>
          </div>
          <Button
            variant="outline"
            onClick={runCitationCheck}
            disabled={citationChecking || !mission.site_url}
            className="text-xs"
          >
            {citationChecking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
            Check Citations
          </Button>
        </div>

        {citationLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-slate-300" /></div>
        ) : citation ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-purple-500" />
                <h3 className="text-sm font-semibold text-slate-700">AI Engines</h3>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-purple-600">{Math.round(citation.ai.citationShare * 100)}%</span>
                <span className="text-xs text-slate-400">cited</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{citation.ai.citedQueries}/{citation.ai.totalQueries} queries</p>
              {citation.ai.perEngine.length > 0 && (
                <div className="mt-3 space-y-1">
                  {citation.ai.perEngine.map((e) => (
                    <div key={e.engine} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 capitalize">{e.engine}</span>
                      <span className="text-slate-400">{e.cited}/{e.total} ({Math.round(e.share * 100)}%)</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-slate-200 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-slate-700">Google Top 5</h3>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-blue-600">{citation.google.overallCited}</span>
                <span className="text-xs text-slate-400">/ {citation.google.overallTotal} pages</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">across {citation.google.questions.length} questions</p>
              {citation.google.questions.length > 0 && (
                <div className="mt-3 space-y-1">
                  {citation.google.questions.slice(0, 3).map((q) => (
                    <div key={q.query} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600 truncate max-w-[180px]">{q.query}</span>
                      <span className="text-slate-400">{q.cited}/{q.total}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-4">No citation data yet. Run a citation check to see your visibility.</p>
        )}
      </div>

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
                  {isCollapsed ? <ChevronRight className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" /> : <ChevronDown className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />}
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
            {phase.key === "phase1" && (
              <div className="border-b border-slate-100 bg-blue-50/30 px-5 py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Search className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-slate-800">Self-Audit Your Website</h3>
                </div>
                <p className="text-xs text-slate-500 mb-3">Audit your site to automatically populate Phase 1 with critical fixes.</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input type="url" placeholder="https://yourwebsite.com" value={auditUrl} onChange={(e) => setAuditUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && runSelfAudit()} className="w-full rounded-lg border border-slate-200 py-2 pl-10 pr-3 text-sm focus:border-blue-400 focus:outline-none" />
                  </div>
                  <Button onClick={runSelfAudit} disabled={auditing || !auditUrl}>
                    {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                    Run Audit
                  </Button>
                </div>
                {auditError && <p className="mt-2 text-sm text-red-600">{auditError}</p>}
                {auditResult && (
                  <div className="mt-4 space-y-3">
                    <div className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white p-3">
                      <div className="text-center">
                        <p className={`text-3xl font-bold ${auditResult.total_score >= 80 ? "text-green-600" : auditResult.total_score >= 60 ? "text-yellow-600" : auditResult.total_score >= 40 ? "text-orange-600" : "text-red-600"}`}>{auditResult.total_score}</p>
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
                    {[
                      { key: "failed", label: "Failed", icon: AlertCircle, color: "red", checks: auditResult.checks.filter((c) => c.status === "fail") },
                      { key: "warnings", label: "Warnings", icon: AlertTriangle, color: "yellow", checks: auditResult.checks.filter((c) => c.status === "warn") },
                      { key: "passed", label: "Passed", icon: CheckCircle2, color: "green", checks: auditResult.checks.filter((c) => c.status === "pass") },
                    ].map((section) => {
                      const Icon = section.icon;
                      const colorMap: Record<string, string> = { red: "text-red-500 bg-red-50 border-red-200", yellow: "text-yellow-500 bg-yellow-50 border-yellow-200", green: "text-green-500 bg-green-50 border-green-200" };
                      const isOpen = expandedSection === section.key;
                      return (
                        <div key={section.key} className={`rounded-lg border ${colorMap[section.color]} overflow-hidden`}>
                          <button onClick={() => setExpandedSection(isOpen ? null : section.key)} className="flex w-full items-center justify-between px-3 py-2.5">
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
                                  {check.recommendation && <p className="mt-1 text-xs text-slate-400"><span className="font-semibold">Fix: </span>{check.recommendation}</p>}
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

            {phaseTasks.length > 0 ? (
              <div className="divide-y divide-slate-50">
                {phaseTasks.map((task) => {
                  const verifyResult = verifyResults[task.id];
                  const isVerifying = verifyingTaskId === task.id;
                  const isGenerating = generatingTaskId === task.id;
                  const isShipping = shippingTaskId === task.id;
                  const genResult = generateResults[task.id];
                  const draftExpanded = expandedDrafts.has(task.id);
                  const sourceInfo = SOURCE_LABELS[task.source] || SOURCE_LABELS.strategic;
                  const hasBrief = !!task.content_brief;
                  const briefDraft = task.content_brief?.draft_content;
                  const hasGeneratedContent = !!genResult || (briefDraft && briefDraft.length > 200);

                  return (
                    <div key={task.id} className="px-5 py-4">
                      <div className="flex items-start gap-3">
                        {task.status === "done" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-sm font-medium ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</span>
                            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${sourceInfo.color}`}>{sourceInfo.label}</span>
                          </div>
                          {task.description && <p className={`mt-1 text-xs ${task.status === "done" ? "text-slate-300" : "text-slate-500"}`}>{task.description}</p>}

                          {hasBrief && task.content_brief && (
                            <div className="mt-2 rounded-lg border border-purple-100 bg-purple-50/50 p-3">
                              <div className="flex items-center gap-2 mb-2">
                                <FileText className="h-3.5 w-3.5 text-purple-500" />
                                <span className="text-xs font-semibold text-purple-700">Content Brief</span>
                                <span className="text-xs text-slate-400">·</span>
                                <span className="text-xs text-slate-500 capitalize">{task.content_brief.answer_type}</span>
                                <span className="text-xs text-slate-400">·</span>
                                <span className="text-xs text-slate-500">Effort: {task.content_brief.effort}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-wrap">
                                {task.status !== "done" && (
                                  <>
                                    <Button variant="outline" onClick={() => generateContent(task.id)} disabled={isGenerating} className="text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50">
                                      {isGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                                      {isGenerating ? "Generating..." : "Generate with AI"}
                                    </Button>
                                    {hasGeneratedContent && (
                                      <Button variant="outline" onClick={() => toggleDraft(task.id)} className="text-xs text-slate-600 hover:text-slate-700">
                                        {draftExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                        {draftExpanded ? "Hide" : "View"} Draft
                                      </Button>
                                    )}
                                    {hasGeneratedContent && (
                                      <a href={`/api/missions/${missionId}/tasks/${task.id}/pdf`} target="_blank" rel="noopener noreferrer">
                                        <Button variant="outline" className="text-xs text-slate-600 hover:text-slate-700">
                                          <Download className="h-3.5 w-3.5" /> PDF
                                        </Button>
                                      </a>
                                    )}
                                    {hasGeneratedContent && (
                                      <Button variant="outline" onClick={() => shipBrief(task.id)} disabled={isShipping} className="text-xs text-green-600 hover:text-green-700 hover:bg-green-50">
                                        {isShipping ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ship className="h-3.5 w-3.5" />}
                                        Mark Shipped
                                      </Button>
                                    )}
                                  </>
                                )}
                              </div>
                              {generateError && generatingTaskId === task.id && <p className="mt-2 text-xs text-red-600">{generateError}</p>}
                              {draftExpanded && (genResult?.content || briefDraft) && (
                                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-4 max-h-96 overflow-y-auto">
                                  {genResult && (
                                    <div className="mb-3 flex items-center gap-3 text-xs">
                                      <span className="font-medium text-slate-600">{genResult.wordCount} words</span>
                                      <span className="text-slate-400">·</span>
                                      <span className="capitalize text-slate-600">{genResult.style.replace("_", " ")}</span>
                                      <span className="text-slate-400">·</span>
                                      <span className="text-slate-600">{genResult.selfCitations} self-citations</span>
                                      <span className="text-slate-400">·</span>
                                      <span className="text-slate-600">{genResult.sources.length} sources</span>
                                    </div>
                                  )}
                                  <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap text-xs">
                                    {(genResult?.content || briefDraft)?.substring(0, 2000)}
                                    {((genResult?.content || briefDraft)?.length ?? 0) > 2000 && (
                                      <span className="text-slate-400">... ({Math.round(((genResult?.content || briefDraft)?.length ?? 0) / 1000)}k chars total)</span>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                          {verifyResult && (
                            <div className={`mt-2 rounded-lg border p-2.5 text-xs ${verifyResult.passed ? "border-green-200 bg-green-50 text-green-700" : "border-orange-200 bg-orange-50 text-orange-700"}`}>
                              <div className="flex items-center gap-1.5">
                                {verifyResult.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                                <span className="font-medium">{verifyResult.passed ? "Verified — issue resolved!" : "Not yet fixed"}</span>
                              </div>
                              <p className="mt-1">{verifyResult.detail}</p>
                              {verifyResult.currentValue && <p className="mt-0.5 text-slate-500">Current: {verifyResult.currentValue}</p>}
                            </div>
                          )}
                        </div>
                        {task.status !== "done" && (
                          <Button variant="outline" onClick={() => verifyTask(task.id)} disabled={isVerifying} className="shrink-0 px-3 py-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50">
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
              <div className="px-5 py-6 text-center"><p className="text-sm text-slate-400">No critical fixes yet. Run the self-audit above to populate this phase.</p></div>
            )}
            </>
            )}
          </div>
        );
      })}

      {mission.tasks.filter((t) => !t.phase).length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="border-b border-slate-200 px-5 py-3"><h2 className="text-sm font-semibold text-slate-800">Other Tasks</h2></div>
          <div className="divide-y divide-slate-50">
            {mission.tasks.filter((t) => !t.phase).map((task) => {
              const verifyResult = verifyResults[task.id];
              const isVerifying = verifyingTaskId === task.id;
              return (
                <div key={task.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    {task.status === "done" ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-500" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-slate-300" />}
                    <div className="flex-1">
                      <span className={`text-sm font-medium ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}>{task.title}</span>
                      {task.description && <p className={`mt-1 text-xs ${task.status === "done" ? "text-slate-300" : "text-slate-500"}`}>{task.description}</p>}
                      {verifyResult && (
                        <div className={`mt-2 rounded-lg border p-2.5 text-xs ${verifyResult.passed ? "border-green-200 bg-green-50 text-green-700" : "border-orange-200 bg-orange-50 text-orange-700"}`}>
                          <span className="font-medium">{verifyResult.passed ? "Verified — issue resolved!" : "Not yet fixed"}</span>
                          <p className="mt-1">{verifyResult.detail}</p>
                        </div>
                      )}
                    </div>
                    {task.status !== "done" && (
                      <Button variant="outline" onClick={() => verifyTask(task.id)} disabled={isVerifying} className="shrink-0 px-3 py-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50">
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