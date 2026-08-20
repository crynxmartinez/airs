"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

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
  children: React.ReactNode;
}

/**
 * Document shell shared by the evaluation and mission reports.
 *
 * Two things it exists to guarantee. The page is measured in A4 so what you see is
 * what the PDF contains, and the browser's own document title becomes the default PDF
 * filename — printing used to produce "localhost" or the app title rather than
 * anything identifying the report.
 *
 * The controls carry `no-print` and sit outside `.report-page`, so they never occupy
 * space in the output.
 */
export function ReportShell({
  kind,
  subject,
  facts = [],
  backHref,
  backLabel,
  fileStem,
  children,
}: ReportShellProps) {
  const generated = new Date().toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  function saveAsPdf() {
    // The print dialog seeds the filename from document.title. Restore it afterwards
    // so the tab does not keep the export name.
    const previous = document.title;
    document.title = fileStem;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
    };
    window.addEventListener("afterprint", restore);
    window.print();
  }

  return (
    <>
      <div className="no-print sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <Link
          href={backHref}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>
        <button
          onClick={saveAsPdf}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
        >
          <Printer className="h-4 w-4" />
          Save as PDF
        </button>
      </div>

      <article className="report-page">
        <header className="report-block mb-8 border-b-2 border-slate-900 pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{kind}</p>
          <h1 className="mt-1.5 text-[26px] font-bold leading-tight text-slate-900">{subject}</h1>

          {facts.length > 0 && (
            <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-1.5 text-[12px] sm:grid-cols-3">
              {facts.map((f) => (
                <div key={f.label} className="flex gap-1.5">
                  <dt className="shrink-0 text-slate-500">{f.label}:</dt>
                  <dd className="font-medium text-slate-800">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          <p className="mt-4 text-[11px] text-slate-400">Generated {generated} · AIRS</p>
        </header>

        {children}

        <footer className="report-block mt-10 border-t border-slate-200 pt-4 text-[10px] leading-relaxed text-slate-400">
          <p>
            {kind} — {subject}. Produced by AIRS from a deterministic analysis of crawled
            competitor content; every score traces to the passage that produced it.
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
      <h2 className="mb-1 text-[15px] font-bold uppercase tracking-wide text-slate-900">{title}</h2>
      {hint && <p className="mb-3 text-[11px] text-slate-500">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}
