"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Loader2, History, AlertTriangle, ArrowRight } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { DeltaStat, LedgerEntry, type LedgerRow } from "@/components/progress-ledger";

/**
 * Benchmarks — progress, not position.
 *
 * The division of labour across the three overview pages:
 *   Dashboard        state    — where do we stand overall?
 *   Coverage Matrix  position — where do we stand, question by question?
 *   Benchmarks       change   — what moved, did we cause it, where does it land?
 *
 * This page previously plotted the project's own scores over time against a
 * hand-typed target, which is a dashboard's job, and it never read the coverage
 * table where the actual standard — the field — lives. Every figure here is a delta
 * between two coverage runs; no absolute score appears anywhere.
 */

interface GapMovement {
  question: string;
  answerType: string;
  fieldBestBefore: number;
  fieldBestAfter: number;
  selfBefore: number;
  selfAfter: number;
  gapBefore: number;
  gapAfter: number;
  earned: number;
  drift: number;
  verdict: "earned" | "drift" | "losing_while_improving" | "lost" | "flat";
  evaluationQuery?: string;
}

interface ProgressData {
  project: string;
  has_baseline: boolean;
  evaluations_tracked: number;
  evaluations_total: number;
  runs_total: number;
  comparable: boolean;
  window_days: number;
  headline: {
    gaps_closed: number;
    regressions: number;
    rivals_moved: number;
    openings: number;
    earned: number;
    drift: number;
  };
  position: { before: number; after: number; of: number } | null;
  transitions: LedgerRow[];
  movements: GapMovement[];
  periods: {
    evaluation_id: string;
    query: string;
    from: string;
    to: string;
    comparable: boolean;
    engine_before: string | null;
    engine_after: string | null;
  }[];
}

const WINDOWS = [
  { days: 0, label: "Since last run" },
  { days: 7, label: "This week" },
  { days: 30, label: "This month" },
  { days: 365, label: "Since baseline" },
];

const VERDICT: Record<GapMovement["verdict"], { label: string; tone: string }> = {
  earned: { label: "Earned", tone: "text-emerald-700 bg-emerald-50" },
  losing_while_improving: { label: "Losing while improving", tone: "text-amber-800 bg-amber-50" },
  drift: { label: "Drift", tone: "text-slate-600 bg-slate-100" },
  lost: { label: "Lost ground", tone: "text-red-700 bg-red-50" },
  flat: { label: "Flat", tone: "text-slate-500 bg-slate-50" },
};

export default function ProjectBenchmarksPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [data, setData] = useState<ProgressData | null>(null);
  const [failed, setFailed] = useState(false);
  const [days, setDays] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/projects/${projectId}/progress?days=${days}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, days]);

  // Loading is derived from whether the held data matches the selected period, rather
  // than tracked in its own state. The response carries the window it answered for, so
  // switching period shows the spinner without a setState inside the effect body.
  const loading = !failed && (!data || data.window_days !== days);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const header = (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Progress</h1>
        <p className="mt-1 text-sm text-slate-500">
          What moved since the last analysis — and whether your work caused it
        </p>
      </div>

      {/* A period selector is the signature of a progress page; dashboards never
          have one. It is deliberately the first control on the page. */}
      <div className="flex rounded-lg border border-slate-200 bg-white p-0.5">
        {WINDOWS.map((w) => (
          <button
            key={w.days}
            onClick={() => setDays(w.days)}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition ${
              days === w.days ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {w.label}
          </button>
        ))}
      </div>
    </div>
  );

  // "No history" and "nothing changed" are different states and must not look alike:
  // the first needs a second analysis run, the second is a real reportable result.
  if (!data || !data.has_baseline) {
    return (
      <div className="space-y-6">
        {header}
        <EmptyState
          icon={<History className="h-7 w-7" />}
          title={data?.runs_total ? "Only one analysis run so far" : "No baseline recorded yet"}
          description={
            data?.runs_total
              ? "Progress is a diff between two coverage runs. Run the analysis again to record a second snapshot, and every verdict that moves will appear here with the passage on both sides."
              : "Run an AIRS analysis on an evaluation to record a baseline. A second run then produces the movement ledger — gaps closed, regressions, and rivals closing in."
          }
        />
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
          <p className="font-medium text-slate-800">What this page will show</p>
          <ul className="mt-2 space-y-1.5 text-slate-600">
            <li>· Gaps closed — a question that went from hedged to answered, with the new passage</li>
            <li>· Regressions — an answer you had that has since been removed</li>
            <li>· Rivals closing in — a competitor answering something you led on</li>
            <li>· Earned vs drift — how much of the movement was your work rather than the field&apos;s</li>
          </ul>
          <Link
            href={`/projects/${projectId}/evaluations`}
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 hover:underline"
          >
            Go to evaluations
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  const h = data.headline;
  const positionLabel = data.position
    ? `${ordinal(data.position.before)} → ${ordinal(data.position.after)}`
    : "—";

  // Newly-measured and dropped pairs are not movement — there was nothing to compare
  // against. Listing them in the ledger buried the real changes 96 rows deep after the
  // question set widened, so they are collapsed into a footnote instead.
  const moved = data.transitions.filter((t) => t.kind !== "entered" && t.kind !== "left");
  const unbaselined = data.transitions.filter((t) => t.kind === "entered");
  const dropped = data.transitions.filter((t) => t.kind === "left");

  return (
    <div className="space-y-6">
      {header}

      {/* An engine change shifts verdicts on unchanged content. Presenting that as
          client progress would credit them for our code change. */}
      {!data.comparable && (
        <div className="flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="text-sm text-amber-900">
            <p className="font-medium">Re-baseline, not a result</p>
            <p className="mt-0.5 text-amber-800">
              The coverage engine changed between these runs, so verdicts moved for reasons
              unrelated to the content. Movement below is shown for inspection but must not be
              reported as progress. The next run-to-run comparison will be clean.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <DeltaStat
          label="Gaps closed"
          value={h.gaps_closed > 0 ? `+${h.gaps_closed}` : "0"}
          hint="hedged → answered"
          tone={h.gaps_closed > 0 ? "good" : "neutral"}
        />
        <DeltaStat
          label="Regressions"
          value={h.regressions > 0 ? `−${h.regressions}` : "0"}
          hint="answers you lost"
          tone={h.regressions > 0 ? "bad" : "neutral"}
        />
        <DeltaStat
          label="Rivals closed in"
          value={h.rivals_moved > 0 ? String(h.rivals_moved) : "0"}
          hint="opportunities expiring"
          tone={h.rivals_moved > 0 ? "warn" : "neutral"}
        />
        <DeltaStat
          label="Earned / drift"
          value={`${h.earned} / ${h.drift}`}
          hint="your work vs the field's"
          tone={h.earned > h.drift ? "good" : "neutral"}
        />
        <DeltaStat
          label="Field position"
          value={positionLabel}
          hint={data.position ? `of ${data.position.of}` : "your site is not crawled yet"}
        />
      </div>

      {/* The ledger. Reverse chronological, most actionable first. */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-slate-800">Movement ledger</h2>
          <span className="text-xs text-slate-400">
            {moved.length > 0
              ? `${moved.length} verdict${moved.length === 1 ? "" : "s"} moved`
              : "no verdicts moved in this period"}
          </span>
        </div>

        {moved.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            Nothing moved between these runs. That is a real result, not missing data — the
            field and your site said the same thing on both dates.
          </p>
        ) : (
          <ul className="px-5">
            {moved.slice(0, 60).map((t, i) => (
              <LedgerEntry key={`${t.competitorLabel}-${t.question}-${i}`} row={t} />
            ))}
          </ul>
        )}

        {moved.length > 60 && (
          <p className="border-t border-slate-100 px-5 py-3 text-xs text-slate-400">
            Showing the 60 most actionable of {moved.length} movements.
          </p>
        )}

        {(unbaselined.length > 0 || dropped.length > 0) && (
          <details className="border-t border-slate-100 px-5 py-3">
            <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-800">
              {unbaselined.length > 0 && `${unbaselined.length} newly measured`}
              {unbaselined.length > 0 && dropped.length > 0 && " · "}
              {dropped.length > 0 && `${dropped.length} no longer measured`}
              {" — no baseline, not counted as progress"}
            </summary>
            <ul className="mt-2">
              {[...unbaselined, ...dropped].slice(0, 40).map((t, i) => (
                <LedgerEntry key={`new-${t.competitorLabel}-${t.question}-${i}`} row={t} />
              ))}
            </ul>
          </details>
        )}
      </div>

      {/* Gap to the field, decomposed. The honesty panel. */}
      {data.movements.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-3.5">
            <h2 className="text-sm font-semibold text-slate-800">Gap to field best</h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Negative means behind. Earned is your own movement; drift is the field moving.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-2 font-medium">Question</th>
                  <th className="px-3 py-2 font-medium">Field best</th>
                  <th className="px-3 py-2 font-medium">You</th>
                  <th className="px-3 py-2 font-medium">Gap</th>
                  <th className="px-3 py-2 font-medium">Earned</th>
                  <th className="px-5 py-2 font-medium">Verdict</th>
                </tr>
              </thead>
              <tbody>
                {data.movements.slice(0, 30).map((m, i) => (
                  <tr key={`${m.question}-${i}`} className="border-b border-slate-50 last:border-0">
                    <td className="max-w-[24rem] px-5 py-2.5 text-slate-700">{m.question}</td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-500">
                      {m.fieldBestBefore} → {m.fieldBestAfter}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums text-slate-500">
                      {m.selfBefore} → {m.selfAfter}
                    </td>
                    <td className="px-3 py-2.5 tabular-nums font-medium text-slate-800">
                      {m.gapBefore} → {m.gapAfter}
                    </td>
                    <td
                      className={`px-3 py-2.5 tabular-nums font-medium ${
                        m.earned > 0 ? "text-emerald-600" : m.earned < 0 ? "text-red-600" : "text-slate-400"
                      }`}
                    >
                      {m.earned > 0 ? "+" : ""}
                      {m.earned}
                    </td>
                    <td className="px-5 py-2.5">
                      <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${VERDICT[m.verdict].tone}`}>
                        {VERDICT[m.verdict].label}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Provenance: which runs were compared. Any progress claim should be auditable. */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <h2 className="text-sm font-semibold text-slate-800">Compared runs</h2>
        <ul className="mt-2 space-y-1.5 text-xs text-slate-500">
          {data.periods.map((p) => (
            <li key={p.evaluation_id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-slate-700">{p.query}</span>
              <span className="tabular-nums">
                {p.from} → {p.to}
              </span>
              {!p.comparable && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                  engine changed
                </span>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-[11px] text-slate-400">
          {data.evaluations_tracked} of {data.evaluations_total} evaluation
          {data.evaluations_total === 1 ? " has" : "s have"} enough history to diff ·{" "}
          {data.runs_total} run{data.runs_total === 1 ? "" : "s"} recorded
        </p>
      </div>
    </div>
  );
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
}
