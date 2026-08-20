"use client";

import Link from "next/link";
import { ArrowRight, TrendingDown, TrendingUp, AlertTriangle, Unlock, Plus, Minus } from "lucide-react";

/**
 * The movement ledger — the benchmark page's centrepiece.
 *
 * A diff row, not a card. Cards state a value and read as "now"; a diff row states a
 * change and reads as "since". That distinction is the whole reason this page is not
 * the dashboard, so it is enforced here rather than left to each caller.
 */

export type TransitionKind =
  | "self_gained"
  | "self_answered"
  | "self_regressed"
  | "rival_answered"
  | "rival_regressed"
  | "entered"
  | "left";

export interface LedgerRow {
  kind: TransitionKind;
  isSelf: boolean;
  competitorLabel: string;
  question: string;
  answerType: string;
  from: string | null;
  to: string | null;
  specificityDelta: number;
  specificityFrom: number;
  specificityTo: number;
  passageBefore: string | null;
  passageAfter: string | null;
  sourceUrl: string | null;
  evaluationQuery?: string;
  at?: string;
}

/**
 * Presentation per transition kind.
 *
 * Colour encodes *direction*, never sentiment — a rival closing a gap is not "bad
 * performance", it is an opportunity expiring, and conflating the two is how a
 * progress page turns into a scoreboard.
 */
const KIND: Record<
  TransitionKind,
  { label: string; tone: string; dot: string; Icon: typeof TrendingUp; note?: string }
> = {
  self_regressed: {
    label: "You regressed",
    tone: "text-red-700 bg-red-50 border-red-200",
    dot: "bg-red-500",
    Icon: TrendingDown,
    note: "an answer you had is gone",
  },
  rival_answered: {
    label: "Rival closed it",
    tone: "text-amber-800 bg-amber-50 border-amber-200",
    dot: "bg-amber-500",
    Icon: AlertTriangle,
    note: "this opportunity is expiring",
  },
  self_answered: {
    label: "Gap closed",
    tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-500",
    Icon: TrendingUp,
    note: "you committed to a real answer",
  },
  rival_regressed: {
    label: "New opening",
    tone: "text-sky-700 bg-sky-50 border-sky-200",
    dot: "bg-sky-500",
    Icon: Unlock,
    note: "a rival weakened here",
  },
  self_gained: {
    label: "You gained",
    tone: "text-emerald-700 bg-emerald-50 border-emerald-200",
    dot: "bg-emerald-400",
    Icon: TrendingUp,
  },
  entered: {
    label: "Newly measured",
    tone: "text-slate-600 bg-slate-50 border-slate-200",
    dot: "bg-slate-300",
    Icon: Plus,
    note: "no baseline — not counted as progress",
  },
  left: {
    label: "No longer measured",
    tone: "text-slate-500 bg-slate-50 border-slate-200",
    dot: "bg-slate-300",
    Icon: Minus,
  },
};

const LEVEL_LABEL: Record<string, string> = {
  none: "absent",
  lexical: "hedged",
  answered: "answered",
};

export function LedgerEntry({ row }: { row: LedgerRow }) {
  const kind = KIND[row.kind];
  const { Icon } = kind;
  const moved = row.from !== row.to;
  // `entered` and `left` have nothing on one side, so the absent side reads as 0 and
  // the delta reads as a full gain — "0 → 100, +100" next to "no baseline". Suppress
  // the comparison entirely rather than print a change that did not happen.
  const hasBothSides = row.kind !== "entered" && row.kind !== "left";

  return (
    <li className="border-b border-slate-100 py-4 last:border-0">
      <div className="flex gap-3">
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${kind.dot}`} aria-hidden />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${kind.tone}`}>
              <Icon className="h-3 w-3" />
              {kind.label}
            </span>
            <span className="text-sm font-medium text-slate-900">{row.competitorLabel}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {row.answerType}
            </span>
          </div>

          <p className="mt-1.5 text-sm text-slate-700">{row.question}</p>

          {/* The change itself: verdict then, verdict now, and by how much. */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {hasBothSides && moved && row.from && row.to && (
              <span className="inline-flex items-center gap-1.5 font-medium text-slate-600">
                {LEVEL_LABEL[row.from] ?? row.from}
                <ArrowRight className="h-3 w-3 text-slate-400" />
                {LEVEL_LABEL[row.to] ?? row.to}
              </span>
            )}
            {hasBothSides ? (
              <span className="text-slate-400">
                specificity {row.specificityFrom} → {row.specificityTo}
              </span>
            ) : (
              <span className="text-slate-400">
                {LEVEL_LABEL[(row.to ?? row.from) ?? ""] ?? "—"} · specificity{" "}
                {row.kind === "left" ? row.specificityFrom : row.specificityTo}
              </span>
            )}
            {hasBothSides && row.specificityDelta !== 0 && (
              <span
                className={`font-semibold ${row.specificityDelta > 0 ? "text-emerald-600" : "text-red-600"}`}
              >
                {row.specificityDelta > 0 ? "+" : ""}
                {row.specificityDelta}
              </span>
            )}
            {kind.note && <span className="text-slate-400">· {kind.note}</span>}
          </div>

          {/* Proof. The dashboard summarises; this page has to be able to show the
              passage on both sides of the change. */}
          {(row.passageBefore || row.passageAfter) && (
            <details className="mt-2 group">
              <summary className="cursor-pointer text-[11px] font-medium text-slate-500 hover:text-slate-800">
                Show the passage
              </summary>
              <div className="mt-2 space-y-2 border-l-2 border-slate-200 pl-3">
                {row.passageBefore && (
                  <p className="text-xs leading-relaxed text-slate-500">
                    <span className="font-medium text-slate-400">before: </span>
                    <span className="italic">&ldquo;{trim(row.passageBefore)}&rdquo;</span>
                  </p>
                )}
                {row.passageAfter && (
                  <p className="text-xs leading-relaxed text-slate-700">
                    <span className="font-medium text-slate-400">after: </span>
                    <span className="italic">&ldquo;{trim(row.passageAfter)}&rdquo;</span>
                  </p>
                )}
                {row.sourceUrl && (
                  <p className="truncate text-[11px] text-slate-400">
                    <Link href={row.sourceUrl} target="_blank" className="hover:text-slate-700 hover:underline">
                      {row.sourceUrl}
                    </Link>
                  </p>
                )}
              </div>
            </details>
          )}
        </div>
      </div>
    </li>
  );
}

function trim(text: string, max = 260): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

/**
 * A headline figure. Always a change, never a value — a bare number is the
 * dashboard's signature and the fastest way for this page to stop being distinct.
 */
export function DeltaStat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad" | "warn" | "neutral";
}) {
  const toneClass =
    tone === "good"
      ? "text-emerald-700"
      : tone === "bad"
        ? "text-red-700"
        : tone === "warn"
          ? "text-amber-700"
          : "text-slate-900";

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}
