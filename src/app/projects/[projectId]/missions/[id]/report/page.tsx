"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ReportShell } from "@/components/report-shell";
import type { Mission, MissionTask } from "@/types";

interface AuditCheck {
  name: string;
  status: "pass" | "warn" | "fail";
  value: string;
  detail: string;
  recommendation: string;
  category: string;
}

interface AuditData {
  url: string;
  checks: AuditCheck[];
  total_score: number;
  summary: { passed: number; warnings: number; failed: number };
}

interface MissionReport extends Mission {
  tasks: MissionTask[];
  site_url: string | null;
  audit_data: AuditData | null;
}

const PHASES = [
  { key: "phase1", label: "Phase 1: Critical Fixes", timeline: "Month 1" },
  { key: "phase2", label: "Phase 2: High-Impact Improvements", timeline: "Month 2-3" },
  { key: "phase3", label: "Phase 3: Build Presence", timeline: "Month 4-6" },
  { key: "phase4", label: "Phase 4: Ongoing Optimization", timeline: "Month 7-12" },
];

export default function MissionReportPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const missionId = params.id as string;
  const [mission, setMission] = useState<MissionReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/missions/${missionId}`)
      .then((r) => r.json())
      .then((d) => {
        setMission(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [missionId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!mission) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-slate-500">Mission not found.</p>
      </div>
    );
  }

  const totalTasks = mission.tasks.length;
  const doneTasks = mission.tasks.filter((t) => t.status === "done").length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const audit = mission.audit_data;
  const auditChecks = audit?.checks || [];
  const passedChecks = auditChecks.filter((c) => c.status === "pass");
  const warnChecks = auditChecks.filter((c) => c.status === "warn");
  const failedChecks = auditChecks.filter((c) => c.status === "fail");


  return (
    <ReportShell
      kind="Mission Execution Plan"
      subject={mission.name}
      backHref={`/projects/${projectId}/missions/${missionId}`}
      backLabel="Back to mission"
      fileStem={`AIRS Mission — ${mission.name}`}
      facts={[
        { label: "Website", value: mission.site_url || "Not specified" },
        { label: "Status", value: mission.status },
        { label: "Progress", value: `${progress}% (${doneTasks} of ${totalTasks})` },
        ...(audit ? [{ label: "Audit score", value: `${audit.total_score}/100` }] : []),
      ]}
    >
        {/* Executive Summary */}
        <section className="mt-8">
          <h2 className="text-lg font-bold text-slate-900">Executive Summary</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">
            This action plan outlines a phased approach to improve your website&apos;s visibility and competitiveness.
            The plan is based on a competitive analysis of your industry and an automated audit of your current website.
            Each task is verified by our system — no manual check-offs, ensuring real progress.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-4">
            <div className="report-block rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Overall Progress</p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{progress}%</p>
              <p className="mt-0.5 text-xs text-slate-500">{doneTasks} of {totalTasks} tasks completed</p>
            </div>
            {audit && (
              <div className="report-block rounded-lg border border-slate-200 p-4">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Audit Score</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{audit.total_score}/100</p>
                <p className="mt-0.5 text-xs text-slate-500">{audit.summary.passed} passed, {audit.summary.warnings} warnings, {audit.summary.failed} failed</p>
              </div>
            )}
            <div className="report-block rounded-lg border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Status</p>
              <p className="mt-1 text-2xl font-bold capitalize text-slate-900">{mission.status}</p>
              <p className="mt-0.5 text-xs text-slate-500">Created {new Date(mission.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </section>

        {/* Audit Results */}
        {audit && auditChecks.length > 0 && (
          <section className="mt-8 break-before-page">
            <h2 className="text-lg font-bold text-slate-900">Website Audit Results</h2>
            <p className="mt-1 text-sm text-slate-500">
              Automated audit of {audit.url} — {audit.summary.passed} passed, {audit.summary.warnings} warnings, {audit.summary.failed} failed
            </p>

            {/* Failed checks */}
            {failedChecks.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-red-700">Failed Checks ({failedChecks.length})</h3>
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                      <th className="pb-2 pr-4 font-medium">Check</th>
                      <th className="pb-2 pr-4 font-medium">Current Value</th>
                      <th className="pb-2 font-medium">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {failedChecks.map((check, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium text-slate-800">{check.name}</td>
                        <td className="py-2 pr-4 text-slate-600">{check.value}</td>
                        <td className="py-2 text-slate-600">{check.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Warning checks */}
            {warnChecks.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-amber-700">Warnings ({warnChecks.length})</h3>
                <table className="mt-2 w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                      <th className="pb-2 pr-4 font-medium">Check</th>
                      <th className="pb-2 pr-4 font-medium">Current Value</th>
                      <th className="pb-2 font-medium">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {warnChecks.map((check, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="py-2 pr-4 font-medium text-slate-800">{check.name}</td>
                        <td className="py-2 pr-4 text-slate-600">{check.value}</td>
                        <td className="py-2 text-slate-600">{check.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Passed checks */}
            {passedChecks.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-bold text-green-700">Passed Checks ({passedChecks.length})</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  {passedChecks.map((check, i) => (
                    <span key={i} className="rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
                      {check.name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Phase breakdown */}
        {PHASES.map((phase) => {
          const phaseTasks = mission.tasks.filter((t) => t.phase === phase.key);
          if (phaseTasks.length === 0) return null;

          const phaseDone = phaseTasks.filter((t) => t.status === "done").length;

          return (
            <section key={phase.key} className="mt-8 break-before-page">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{phase.label}</h2>
                  <p className="text-xs text-slate-500">{phase.timeline}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-900">{phaseDone}/{phaseTasks.length}</p>
                  <p className="text-xs text-slate-500">completed</p>
                </div>
              </div>

              <table className="mt-4 w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-400">
                    <th className="pb-2 pr-4 font-medium" style={{ width: "40px" }}>Status</th>
                    <th className="pb-2 pr-4 font-medium">Task</th>
                    <th className="pb-2 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {phaseTasks.map((task) => (
                    <tr key={task.id} className="border-b border-slate-100 align-top">
                      <td className="py-3 pr-4">
                        {task.status === "done" ? (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-xs font-bold text-green-700">✓</span>
                        ) : (
                          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-xs text-slate-300">○</span>
                        )}
                      </td>
                      <td className="py-3 pr-4">
                        <p className={`font-medium ${task.status === "done" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                          {task.title}
                        </p>
                      </td>
                      <td className="py-3 text-slate-600">
                        {task.description && (
                          <p className="text-xs leading-relaxed">{task.description}</p>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          );
        })}

    </ReportShell>
  );
}
