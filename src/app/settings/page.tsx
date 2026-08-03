"use client";

import { Database, Award, BookOpen } from "lucide-react";

const dimensions = [
  { code: "intent", label: "Intent Alignment", weight: "15%", category: "Structural" },
  { code: "content", label: "Content Excellence", weight: "20%", category: "Content" },
  { code: "trust", label: "Trust & Authority", weight: "15%", category: "Trust" },
  { code: "ux", label: "User Experience", weight: "15%", category: "UX" },
  { code: "technical", label: "Technical Excellence", weight: "15%", category: "Technical" },
  { code: "competitive", label: "Competitive Position", weight: "10%", category: "Competitive" },
  { code: "ecosystem", label: "Ecosystem Presence", weight: "10%", category: "Ecosystem" },
];

const ratings = [
  { name: "Platinum", range: "90–100", color: "bg-purple-100 text-purple-700" },
  { name: "Gold", range: "75–89", color: "bg-yellow-100 text-yellow-700" },
  { name: "Silver", range: "60–74", color: "bg-slate-100 text-slate-700" },
  { name: "Bronze", range: "40–59", color: "bg-orange-100 text-orange-700" },
  { name: "Foundation", range: "0–39", color: "bg-red-100 text-red-700" },
];

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">AIRS scoring configuration and system information</p>
      </div>

      {/* Scoring Weights */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">Scoring Weights</h2>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-500">
            <th className="px-5 py-2.5">Dimension</th><th className="px-5 py-2.5">Category</th><th className="px-5 py-2.5">Weight</th>
          </tr></thead>
          <tbody>
            {dimensions.map((d) => (
              <tr key={d.code} className="border-b border-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{d.label}</td>
                <td className="px-5 py-3 text-slate-600">{d.category}</td>
                <td className="px-5 py-3 font-medium text-slate-800">{d.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Rating Tiers */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3 flex items-center gap-2">
          <Award className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">AIRS Rating Tiers</h2>
        </div>
        <div className="divide-y divide-slate-50">
          {ratings.map((r) => (
            <div key={r.name} className="flex items-center justify-between px-5 py-3">
              <span className={`rounded-lg border px-3 py-1 text-sm font-bold ${r.color}`}>{r.name}</span>
              <span className="text-sm text-slate-500">RRS {r.range}</span>
            </div>
          ))}
        </div>
      </div>

      {/* System Info */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">System Information</h2>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Database</span><span className="font-medium text-slate-700">SQLite (airs.db)</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Framework</span><span className="font-medium text-slate-700">Next.js 16</span></div>
          <div className="flex justify-between"><span className="text-slate-500">AIRS Standard</span><span className="font-medium text-slate-700">v1.0 (Core)</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Crawler</span><span className="font-medium text-slate-700">Cheerio + multi-page</span></div>
        </div>
      </div>

      {/* Knowledge Base */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-2 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">AIRS Standard Reference</h2>
        </div>
        <p className="text-sm text-slate-500">
          The AIRS (AI Recommendation Standard) defines 7 dimensions for evaluating Recommendation Readiness.
          Each dimension is scored 0–100 based on collected evidence, with weighted averages producing an overall RRS score.
        </p>
      </div>
    </div>
  );
}
