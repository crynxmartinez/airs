# AIRS Benchmarks v2 — Progress as a First-Class Object

**Date:** 2026-08-05
**Supersedes:** Part 3 of `AIRS-BENCHMARK-PLAN.md`
**Decision taken:** Dashboard = snapshot of overall state. **Benchmark = the go-to for progress.**

---

## Part 1 — The three-way split now resolves cleanly

My earlier plan proposed building a question × competitor matrix on the benchmark page. **That page already exists** — `/projects/[id]/evaluations/[id]/coverage` renders exactly that: verdict grid, colour-coded levels, gap evidence on click, field summary counts.

So the confusion was never "benchmark has no job." It was that **three pages were fighting over two jobs while the third job went unbuilt.**

| Page | Tense | Question | Unit | Idiom |
|---|---|---|---|---|
| **Dashboard** | present | Where do we stand overall? | project | cards, gauges |
| **Coverage Matrix** | present | Where do we stand on this evaluation, question by question? | question × competitor | grid ✅ *built* |
| **Benchmark** | **past → future** | **What changed, did our work cause it, and where does that trend land us?** | **transition** | **diff / ledger / timeline** ← *unbuilt* |

The benchmark is the only page whose unit is a **change**, not a state. That is the whole differentiation, and it means the benchmark is not a view over `coverage` — it is a **diff engine over coverage snapshots**.

Dashboard answers *where are we*. Coverage answers *where are we, precisely*. Benchmark answers **are we winning, and was it us**.

---

## Part 2 — 🔴 The blocker: progress is currently impossible to compute

`prisma/schema.sql:244`, the comment above the `coverage` table:

> *"Persisting verdicts makes them **diffable week to week** — you can see whether a competitor newly answered a question, or whether your own coverage improved after shipping content."*

[analysis/route.ts:142](../src/app/api/evaluations/[id]/analysis/route.ts:142), the code:

```ts
run("DELETE FROM coverage WHERE evaluation_id = ?", [id]);
```

**The intent is written into the schema and defeated by the implementation.** Every analysis run deletes all prior verdicts before writing new ones. Exactly one generation exists at any moment.

Progress is not merely unbuilt — it is **uncomputable**. There is nothing to diff. Same defect class as the brief-deletion bug: a `DELETE` where an append belongs.

### 2.1 The fix: coverage becomes append-only

```sql
CREATE TABLE coverage_runs (
  id            TEXT PRIMARY KEY,
  evaluation_id TEXT REFERENCES evaluations(id) ON DELETE CASCADE,
  ran_at        TEXT DEFAULT (datetime('now')),
  questions     INTEGER,     -- breadth, so runs are comparable
  sites         INTEGER,
  engine_version TEXT        -- so an algorithm change never reads as client progress
);

ALTER TABLE coverage ADD COLUMN run_id TEXT REFERENCES coverage_runs(id);
```

Drop the `DELETE`. Latest state becomes `WHERE run_id = (latest run)`; progress becomes any two runs compared.

`engine_version` is not bookkeeping. **Without it, shipping a coverage fix looks identical to the client improving.** The scope-leak fix alone will flip verdicts across the board — that must be labelled as a re-baseline, not celebrated as progress. Any run whose `engine_version` differs is marked *"algorithm changed — not comparable"* and excluded from velocity.

---

## Part 3 — The idea, improved

### 3.1 The atomic unit of progress is the verdict transition, not the score

A score moving 72 → 76 is unfalsifiable and unactionable. A **verdict transition** is a fact with a passage attached:

```
none ──────────► lexical ──────────► answered
     you started        you committed
     talking about      to a real
     it                 answer
```

Six transition types, each meaning something specific:

| Transition | Meaning | Who caused it |
|---|---|---|
| `none → lexical` | you started covering the topic | you (partial) |
| `lexical → answered` | **you committed to a real answer** | you (the win) |
| `none → answered` | new content landed fully formed | you |
| `answered → lexical` | 🔴 you weakened or rewrote it away | you (regression) |
| competitor `lexical → answered` | 🔴 **a rival just closed your opportunity** | them |
| competitor `answered → lexical` | a rival weakened — new opening | them |

Progress becomes **countable**: *"this month: 4 gaps closed, 1 regression, 2 opportunities lost to rivals."* Every one of those is clickable to the before and after passage. Nothing in the app can currently say any of it.

### 3.2 Progress must be net of field drift — earned vs drift

This is the honesty mechanism, and it is what makes the page credible rather than promotional.

Your specificity on a question rose 12 → 34. Three different stories, and today's chart draws the same green line for all three:

| Your Δ | Field best Δ | Reality | Label |
|---|---|---|---|
| +22 | 0 | you closed real ground | **Earned** |
| +22 | +40 | you improved and still fell behind | **Losing while improving** |
| 0 | −30 | rivals decayed; you stood still | **Drift** |

So the headline metric is not your score. It is **gap to field best**, and its change decomposed into *what you did* versus *what happened to you*.

> **Gap closed: −54 → −8** · earned **46**, drift **0**

An agency that shows "earned 46, drift 0" is making a claim it can defend. One that shows a rising line is not.

### 3.3 Attribution: the causal chain, end to end

`outcomes` already scaffolds this — it has `citation_before` / `citation_after`. It stops short of the verdict, which is the part that moves first and is deterministic.

Extend it:

```sql
ALTER TABLE outcomes ADD COLUMN verdict_before TEXT;
ALTER TABLE outcomes ADD COLUMN verdict_after  TEXT;
ALTER TABLE outcomes ADD COLUMN specificity_before REAL;
ALTER TABLE outcomes ADD COLUMN specificity_after  REAL;
ALTER TABLE outcomes ADD COLUMN run_before TEXT;   -- which snapshots were compared
ALTER TABLE outcomes ADD COLUMN run_after  TEXT;
```

Then the benchmark can render the full chain, one row per piece of work:

```
Brief #3  "Publish commercial pricing"
   ├─ identified   Jun 28   field-wide depth gap, 0 of 8 stated a figure
   ├─ shipped      Jul 12   /commercial-insurance#pricing
   ├─ verdict      Jul 14   lexical (12) ──► answered (58)     ✅ EARNED +46
   └─ cited        Jul 29   Perplexity quoted your passage      ✅ CONFIRMED
```

**This is the most valuable object in the product.** Agencies lose clients when value is invisible. That chain is a defensible causal claim — *we found it, we specified it, you shipped it, the verdict flipped, the citation appeared* — with a quoted passage at each step. It is also fully deterministic; no judgement anywhere in it.

### 3.4 Leading vs lagging — show progress before the citation arrives

The hardest month of any engagement is the first, because citation share moves slowly and the client sees nothing.

| Signal | Latency | Nature |
|---|---|---|
| Verdict transition | **immediate** — next crawl | deterministic, leading |
| Specificity delta | immediate | deterministic, leading |
| Rank vs field | days | comparative |
| Citation share | **weeks** | observed, lagging |

Split the page accordingly: **"Committed"** (leading, verifiable now) and **"Confirmed"** (lagging, observed citations). Then plot the relationship — *"of 12 verdicts flipped to answered, 7 have since been cited (58%)"*.

That ratio is the strongest thing AIRS could ever publish. It is empirical proof that the deterministic engine predicts real citations — the answer to "does any of this work?" — and it is computable from data you would already be storing.

### 3.5 Velocity and forecast — make the page forward-looking

Backward-looking pages get reviewed. Forward-looking pages get budgets approved.

- **Velocity:** gaps closed per week, trailing 4 weeks.
- **Time-to-close by answer type:** money gaps close in ~9 days (you know your prices); comparison gaps take ~5 weeks (they need research). This is real scheduling intelligence, and it feeds mission phase assignment.
- **Forecast:** *"23 open gaps · 1.8 closed/week · projected parity on money questions in 6 weeks."*
- **Cost of delay:** *"3 gaps you led on are now contested — closing them next month costs more than closing them this month."*

### 3.6 Regression alerts — only a progress page can raise these

Four events a snapshot view structurally cannot detect:

1. **You regressed** — `answered → lexical`. A redesign or CMS migration quietly deleted a number. Nobody notices for months.
2. **A rival closed your gap** — they went `lexical → answered` on a question you were about to own. **Time-critical**: the opportunity is expiring.
3. **A rival newly blocks AI crawlers** — they just disqualified themselves. A free win, if you notice.
4. **The field is consolidating** — everyone answered a question this quarter. That gap is gone; stop spending on it.

Each is an alert with a date, a diff, and a passage. This is the reason someone opens the page weekly rather than quarterly.

### 3.7 The weekly digest — the page becomes a deliverable

The benchmark's data model is exactly a weekly client report. You already have a working PDF pipeline (`ReportShell`, A4, proper filenames). Add a third report:

> **Week of Jul 28** · 3 gaps closed (earned) · 1 regression · 2 rivals moved
> Net position 6th → 3rd of 9 · 1 new citation confirmed
> *Attention: cgib.com.au answered the claim-duration question you led on.*

Same shell, same print CSS. The progress page stops being a screen someone might visit and becomes a **weekly artifact that lands in an inbox** — which is what makes an engagement feel alive.

---

## Part 4 — The page design

### 4.1 Layout

```
┌─────────────────────────────────────────────────────────────────┐
│  Progress            [ This week ▾ ]  [ vs. Jun 28 baseline ▾ ] │  ← period selector:
├─────────────────────────────────────────────────────────────────┤     the signature of a
│  GAPS CLOSED    NET POSITION    EARNED / DRIFT    CONFIRMED     │     progress page
│    4 of 23        6th → 3rd       46 / 0          7 of 12       │  ← every hero is a Δ
├─────────────────────────────────────────────────────────────────┤
│  MOVEMENT LEDGER                                 ⚠ 1 regression │
│                                                                 │
│  Jul 14  ● cost question        lexical → answered   +46  EARNED│
│          "starts at $1,850 for standard commercial cover"       │
│          ← was: "contact us for a tailored quote"               │
│                                                                 │
│  Jul 18  ▲ cgib.com.au          lexical → answered   RIVAL MOVED│
│          claim-duration question — you led here 6 days ago      │
│                                                                 │
│  Jul 20  ○ your PI page         answered → lexical   −31  ⚠     │
│          the "$2.4M cover" figure was removed in a page rewrite │
├─────────────────────────────────────────────────────────────────┤
│  ATTRIBUTION            brief → shipped → verdict → citation    │
│  VELOCITY               1.8 gaps/week · parity in 6 weeks       │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Design rules that keep it from reading as a dashboard

1. **Every hero metric is a delta, never a value.** `6th → 3rd`, not `76`. A bare number is the dashboard's signature.
2. **The dominant idiom is a diff row**, not a chart — before value, after value, the passage, the cause. Diffs are inherently temporal; cards are inherently instantaneous.
3. **A period selector at the top.** Dashboards never have one; progress pages always do. It is the cheapest and clearest signal of what the page is.
4. **Colour means direction, not sentiment** — improved / regressed / rival moved. Three states, one legend.
5. **Every row expands to its before/after passage.** The dashboard summarises; the benchmark must prove. This drill-down *is* the credibility.
6. **No absolute score anywhere on the page.** Absolute scores live on the dashboard and the coverage matrix. If a number here isn't a change, it doesn't belong.
7. **Reverse chronological, newest first.** A ledger, not a report.

---

## Part 5 — Sequence

| # | Step | Why | Effort |
|---|---|---|---|
| **1** | Fix the coverage scope leak | Otherwise every diff is noise from bad verdicts | M |
| **2** | `coverage_runs` + `run_id`, drop the `DELETE` | **Nothing else is possible without history** | S |
| **3** | `engine_version` on runs | Stops algorithm changes reading as client progress | S |
| **4** | Populate `sub_intents`; crawl self | Today: 1 keyword, 0 self rows, nothing to track | S |
| **5** | Diff engine: two runs → transition list | The core primitive everything reads from | M |
| **6** | **Movement Ledger** page | The centrepiece | M |
| **7** | Earned vs drift decomposition | The honesty mechanism | S |
| **8** | Extend `outcomes`; attribution chain | The retention artifact | M |
| **9** | Regression + rival-moved alerts | The reason to open it weekly | S |
| **10** | Velocity + forecast | Forward-looking | S |
| **11** | Weekly digest PDF (reuse `ReportShell`) | Makes it a deliverable | M |
| **12** | Committed-vs-confirmed ratio | Proves the engine predicts citations | M |
| **13** | Strip mission/dimension/duplicate-trend panels | Removes the dashboard overlap | S |

Steps 1–4 are prerequisites shared with the improvement plan. Step 5 is the primitive. Step 6 is the first thing the user sees change.

---

## The one-line summary

**Dashboard shows state; the Coverage Matrix shows position; the Benchmark must show movement** — and movement is currently uncomputable because every analysis run deletes the history the schema comment promises to keep. Make coverage append-only, diff the runs into verdict transitions, decompose them into **earned vs drift**, and chain each one back to the brief that caused it. The page stops being a chart of your own scores and becomes the proof that the work worked.
