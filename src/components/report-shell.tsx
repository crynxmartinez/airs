"use client";

import Link from "next/link";
import { ArrowLeft, Printer, Download } from "lucide-react";

interface ReportShellProps {
  /** Report type, e.g. "AI Search Visibility Report". */
  kind: string;
  /** The subject: the query evaluated, or the mission name. */
  subject: string;
  /** Short facts printed under the title — site, scope, counts. */
  facts?: { label: string; value: string }[];
  /** Where the "Back" control returns to on screen. */
  backHref: string;
  backLabel: string;
  /** Suggested filename stem, used as the document title so the PDF is named sensibly. */
  fileStem: string;
  /** Eval ID for download links. */
  evalId?: string;
  children: React.ReactNode;
}

export function ReportShell({
  kind,
  subject,
  facts = [],
  backHref,
  backLabel,
  fileStem,
  evalId,
  children,
}: ReportShellProps) {
  const generated = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function saveAsPdf() {
    const previous = document.title;
    document.title = `AIRS — ${fileStem}`;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  return (
    <>
      {/* Screen-only toolbar */}
      <div className="no-print sticky top-0 z-20 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <div className="flex items-center gap-2">
          {evalId && (
            <>
              <a
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                href={`/api/evaluations/${evalId}/export?tier=1&download=1`}
              >
                <Download className="h-3.5 w-3.5" />
                Tier 1
              </a>
              <a
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                href={`/api/evaluations/${evalId}/export?tier=2&download=1`}
              >
                <Download className="h-3.5 w-3.5" />
                Tier 2
              </a>
              <div className="mx-1 h-5 w-px bg-slate-200" />
            </>
          )}
          <button
            onClick={saveAsPdf}
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            <Printer className="h-4 w-4" />
            Save as PDF
          </button>
        </div>
      </div>

      <article className="report-page">
        {/* Cover page */}
        <div className="report-block report-cover">
          <div>
            <div className="mb-10 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">A</div>
              <span className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-400">AIRS Report</span>
            </div>

            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{kind}</p>
            <h1 className="mt-2 text-[32px] font-bold leading-tight text-slate-900">{subject}</h1>

            {facts.length > 0 && (
              <dl className="mt-8 grid grid-cols-2 gap-x-8 gap-y-3 text-[13px]">
                {facts.map((f) => (
                  <div key={f.label} className="border-b border-slate-100 pb-2">
                    <dt className="text-[11px] uppercase tracking-wide text-slate-400">{f.label}</dt>
                    <dd className="mt-0.5 font-medium text-slate-800">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-8 border-t border-slate-200 pt-4">
              <p className="text-[11px] text-slate-400">Generated {generated} · Produced by AIRS</p>
              <p className="mt-1 text-[10px] text-slate-300">Confidential — for client delivery</p>
            </div>
          </div>
        </div>

        {/* Report body */}
        <div className="report-body">
          {children}
        </div>

        <footer className="report-block mt-10 border-t border-slate-200 pt-4 text-[10px] leading-relaxed text-slate-400">
          <p>
            {kind} — {subject}. Produced by AIRS from a deterministic analysis of crawled
            competitor content and AI search citations; every score traces to the passage that produced it.
          </p>
        </footer>
      </article>
    </>
  );
}

/** A titled report section with page-break behaviour already handled. */
export function ReportSection({
  title,
  hint,
  children,
  breakBefore = false,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
  breakBefore?: boolean;
}) {
  return (
    <section className={`report-section mb-8 ${breakBefore ? "report-page-break" : ""}`}>
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-[15px] font-bold uppercase tracking-wide text-slate-900">{title}</h2>
        <div className="h-px flex-1 bg-slate-200" />
      </div>
      {hint && <p className="mb-3 text-[12px] text-slate-500">{hint}</p>}
      {children}
    </section>
  );
}
