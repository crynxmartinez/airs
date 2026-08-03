"use client";

import { BookOpen } from "lucide-react";

const dimensions = [
  { name: "Intent Alignment", category: "structural", description: "Evaluates how well the digital asset aligns with the user's search intent. Includes heading structure, navigation clarity, and schema.org markup." },
  { name: "Content Excellence", category: "content", description: "Evaluates content depth, quality, and completeness. Includes word count, pricing transparency, and FAQ presence." },
  { name: "Trust & Authority", category: "trust", description: "Evaluates trust signals including author bios, contact information, customer reviews, and license/certification mentions." },
  { name: "User Experience", category: "ux", description: "Evaluates mobile readiness, accessibility (image alt text), and internal/external linking structure." },
  { name: "Technical Excellence", category: "technical", description: "Evaluates HTTPS, page load time, canonical tags, and robots meta configuration." },
  { name: "Competitive Position", category: "competitive", description: "Evaluates how the asset compares to competitors in the same search landscape." },
  { name: "Ecosystem Presence", category: "ecosystem", description: "Evaluates social media integration and external link ecosystem." },
];

export default function KnowledgePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Knowledge Base</h1>
        <p className="mt-1 text-sm text-slate-500">AIRS evaluation dimensions, factors, and indicators</p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-slate-400" />
          <h2 className="text-sm font-semibold text-slate-800">AIRS Evaluation Model</h2>
        </div>
        <p className="text-sm text-slate-500">
          The AIRS (AI Recommendation Standard) defines 7 dimensions for evaluating Recommendation Readiness.
          Each dimension is scored 0–100 based on collected evidence from web scraping.
          Scores are weighted to produce an overall RRS (Recommendation Readiness Score).
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {dimensions.map((dim) => (
          <div key={dim.name} className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-800">{dim.name}</h3>
            </div>
            <p className="mt-2 text-sm text-slate-600">{dim.description}</p>
            <p className="mt-2 text-xs text-slate-400">Evidence category: <span className="font-mono">{dim.category}</span></p>
          </div>
        ))}
      </div>
    </div>
  );
}
