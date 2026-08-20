# AIRS Benchmarks — Improvement Plan

**Date:** 2026-08-05
**Scope:** `src/app/projects/[projectId]/benchmarks/page.tsx`, `src/app/api/projects/[id]/benchmarks/route.ts`

> "for me benchmark looks a lot like dashboard"

That reading is correct, and it is not a styling problem. **The benchmark page is a dashboard** — it plots your own scores over time against a number you typed in yourself. Fixing the look would not fix that. The fix is to change what the page is *for*.

---

## Part 1 — Why it feels like a dashboard

### 1.1 Three pages are the same page

| Page | Stat cards | Score chart | Mission progress | Recent activity |
|---|---|---|---|---|
| `/dashboard` | ✅ | ✅ bar | — | ✅ |
| `/projects/[id]` | ✅ | ✅ line | ✅ | ✅ |
| `/projects/[id]/benchmarks` | ✅ | ✅ line | ✅ | — |

Identical visual grammar too — same `rounded-xl border border-slate-200 bg-white p-5` cards, same `text-sm font-semibold text-slate-800` card titles, same `text-sm font-medium text-slate-500` stat labels, same Recharts idiom. Benchmarks is the project overview with three more charts bolted on.

### 1.2 The "benchmark" is measured against a number you typed

[route.ts:150](../src/app/api/projects/[id]/benchmarks/route.ts:150):

```ts
targetScore: project?.target_score ?? 80,
```

`80` is a hardcoded default the user edits by hand in a text box. The dashed `ReferenceLine` labelled **"Target"** on the main chart is that number.

A benchmark is *a standard you are measured against*. A number you chose for yourself is a **goal**, and tracking progress toward a self-set goal over time is the definition of a dashboard. So the page is doing dashboard work with a benchmark label.

### 1.3 The actual benchmark data is never queried

AIRS already computes a real external standard — **the field**. It lives in the `coverage` table: 15 columns of per-question, per-competitor verdicts with the passage, the answer type, the specificity score, and the gap evidence.

The benchmark API queries `score_history`, `missions`, `mission_tasks`, `evaluations`, `dimension_scores`, `citation_snapshots`, `outcomes`, `projects`.

**It never queries `coverage`.** Not once. The richest, most differentiated data in the system — the thing no competitor tool has — appears nowhere on the page named Benchmarks.

### 1.4 Time-series is the wrong axis

Every chart on the page is *x = date*. That is a dashboard's axis: "how are we doing lately?" A benchmark's axis is **x = competitor** or **x = question**: "where do we stand, and against whom?"

Worse, the current framing can report a loss as a win. Your RRS rising from 72 to 76 draws an upward line — while the field moved 78 → 88 and you fell from 4th to 7th. The page shows green.

---

## Part 2 — The distinction to enforce

Give each page one question, one unit, one dominant idiom. If two pages share an idiom, one of them is redundant.

| Page | The question it answers | Unit | Idiom |
|---|---|---|---|
| Dashboard | How are all my projects doing? | project | cards + activity |
| Project overview | How is this project doing over time? | evaluation | trend lines |
| **Benchmarks** | **Where do I stand against the field, question by question — and what closes the gap?** | **question × competitor** | **dense comparison matrix** |

That third row is the whole product thesis. Nothing else in the app renders it, and the data is already sitting in the database.

---

## Part 3 — The redesign

### B1. 🟢 The competitive position matrix — the centrepiece

Rows = questions (sub-intents). Columns = **You** + each competitor. Cells = the coverage verdict, colour-coded, with specificity.

```
                        You    aib    dkg   vimc   cgib   smart   cowd   ...   FIELD BEST
how much does it cost?  ○ 12   ◐ 41   ○  8   ● 66   ◐ 39   ○  4    ○  0        ● 66 vimcover
how long does a claim…  ○  0   ○  0   ○  0   ○  0   ◐ 22   ○  0    ○  0        ◐ 22 cgib      ← TIER 1
do i need PI insurance? ◐ 28   ● 71   ● 63   ◐ 34   ● 58   ◐ 30    ● 55        ● 71 aib
what is public liab…    ● 54   ● 80   ◐ 44   ● 62   ● 77   ◐ 41    ◐ 38        ● 80 aib

  ● answered   ◐ lexical (hedge)   ○ absent        number = specificity 0–100
```

One screen, and it says: *nobody answers the claim-duration question — take it*; *you're behind on PI insurance, the bar is aib at 71*; *cost is wide open, best in field is 66*.

Sortable by "widest gap", "most winnable", "field weakest". This view is impossible on the dashboard because the dashboard has no concept of a question.

### B2. 🟢 The gap ledger — the bar to beat, per question

Under the matrix, one row per question:

| Question | Field best | Their answer | You | Gap | Verdict |
|---|---|---|---|---|---|
| how much does commercial insurance cost | 66 — vimcover | *"premiums typically start from $600 annually"* | 12 | **−54** | Tier 2 depth gap |
| how long does a claim take | 22 — cgib | *"claims are handled promptly"* | 0 | **−22** | **Tier 1 — field-wide gap** |

The quoted passage is the persuasive element. A client seeing *"claims are handled promptly"* labelled as the best answer in the entire field understands the opportunity instantly — no explanation of scoring required. All three columns come from `coverage.passage`, `coverage.specificity`, `coverage.gap_evidence`.

### B3. 🟢 Answer-type weakness profile

Group the field's failures by the eight answer shapes:

```
money        ████████░░  8/10 questions unanswered by the whole field
duration     ██████░░░░  6/10
count        ██░░░░░░░░  2/10
steps        █░░░░░░░░░  1/10
```

This is a strategic read, not a status read: *this field cannot talk about money or time.* It tells you what kind of content to commission, not which page to edit. Directly implements Tier 1.2 from the improvement plan, and doubles as the per-answer-type accuracy view the engine benchmark needs.

### B4. Rank movement, not score movement

Replace "Composite Score over time" with **position against the field over time**. Same snapshots, honest framing:

- `4th of 9 → 7th of 9` even though your absolute score rose. A rising score in a faster-rising field is a loss, and the page must be able to say so.
- Per question: *"you moved from `none` → `lexical` on cost — halfway there."*

The verdict transition (`none → lexical → answered`) is a better progress metric than any 0–100 score, because it maps to a specific action.

### B5. Closure proof — did shipping actually work?

You have `content_briefs.status` (`pending → shipped → verified`) and you have coverage verdicts over time. Join them:

| Brief | Shipped | Verdict before | Verdict after | Specificity | Result |
|---|---|---|---|---|---|
| Publish commercial pricing | Jul 12 | `lexical` 12 | `answered` 58 | +46 | ✅ closed |
| Claim duration section | Jul 20 | `none` 0 | `lexical` 18 | +18 | ⚠ still hedging |

This is the single most valuable panel in the app for retaining a client, because it is causal: *we told you to write this, you wrote it, the verdict flipped, here is the passage.* It needs B5 to depend on the verification loop (Tier 2.2 of the improvement plan) — build them together.

### B6. Move what belongs elsewhere

- **Mission Progress bar chart + list** → the project overview already shows Active Missions. Delete from Benchmarks.
- **Dimension Averages (Current)** → this is an evaluation-level view; it belongs on the evaluation page.
- **Score Trends (RRS/GEO/GMB/Composite)** → keep *one* version, on the project overview. Not both.
- **Target Score card** → recast as "Field position target" (*be top 3*) or drop it. An arbitrary 80 is not a benchmark.

Removing these is half the fix for "looks like a dashboard." The page should get **denser and narrower in purpose**, not gain more charts.

---

## Part 4 — 🔴 Blockers: today the benchmark would report fiction

I queried the live database. Four problems mean the numbers on this page cannot currently be trusted.

### 4.1 Only 8 coverage rows exist, and all for one non-question

```
coverage      = 8 rows        sub_intents = 0 rows
content_briefs= 1 row         ai_citations = 0 rows
```

Every coverage row is for the question **`"full stack web"`** — which is the `primary_query`, not a question at all. `sub_intents` is empty, so [analysis/route.ts:115](../src/app/api/evaluations/[id]/analysis/route.ts:115) fell back to the headline keyword.

**The fan-out premise — the entire basis of the product — is inert.** The demand endpoint has not populated sub-intents, so one keyword is being analysed instead of twelve questions. That is why there is exactly 1 brief.

### 4.2 There is no `self` row, so no comparison is possible

All 8 rows are competitors. `competitor_label` is never `"Self"` — the self assessment only persists when `selfEntry` exists, which needs your own site crawled into `page_content`. It hasn't been.

**A benchmark with no self row cannot compare anything.** This is the literal reason the page fell back to plotting your own score over time: the comparison data was never written.

### 4.3 Three competitors are `answered` with specificity **0**

```
intelivita.com    answered   specificity 0
aws.amazon.com    answered   specificity 0
weweb.io          answered   specificity 0
```

"Answered" and "zero quotability" is a contradiction — an answer nothing can quote is not an answer. This is the site-union scope leak from the improvement plan (Tier 0.1) surfacing in real data, and it makes the field look 7/8 healthy when the truth is unknown.

Any benchmark built on this reports **no gap where gaps exist**, which is the worst possible failure for this product.

### 4.4 Dependency order

**B1–B3 must not be built before Tier 0.1 lands.** A matrix rendering wrong verdicts is more damaging than no matrix — it is confidently wrong, on one screen, in front of a client.

Prerequisites, in order:
1. Fix the scope leak (improvement plan Tier 0.1).
2. Populate `sub_intents` — run the demand endpoint as part of the evaluation flow, not manually.
3. Crawl the self site into `page_content` so the self row is written.
4. Then build B1.

---

## Part 5 — Visual rules so it stops reading as a dashboard

1. **Table-first, not chart-first.** The dashboard is cards + charts. The benchmark is a matrix. Different information density is the strongest differentiator available, and it costs nothing.
2. **No stat-card row at the top.** That row *is* the dashboard signature. Lead with the matrix.
3. **Colour means verdict, not sentiment.** `answered` / `lexical` / `none` — three states, one legend, used identically everywhere. Not red-amber-green "performance".
4. **Every number is clickable to its passage.** The dashboard summarises; the benchmark must let you drill to the quote. That interaction is the credibility of the whole system.
5. **x-axis is a competitor or a question, never a date** — except in B4, where it is explicitly *rank*, not score.

---

## Part 6 — Sequence

| # | Step | Depends on | Effort |
|---|---|---|---|
| 0a | Fix coverage scope leak | — | M |
| 0b | Populate `sub_intents` in the evaluation flow | — | S |
| 0c | Crawl self into `page_content` → self coverage row | — | S |
| 1 | **B1** competitive position matrix | 0a–0c | M |
| 2 | **B2** gap ledger with quoted passages | B1 | S |
| 3 | **B6** delete mission/dimension/duplicate-trend panels | — | S |
| 4 | **B3** answer-type weakness profile | 0b | S |
| 5 | **B4** rank movement replaces score movement | B1 | M |
| 6 | **B5** closure proof | verification loop (Tier 2.2) | M |

Steps 0a–0c are not optional polish. Until they land, the page has no comparison data to render — which is precisely why it became a dashboard.

---

## The one-line summary

**The benchmark looks like a dashboard because it is one:** it plots your own scores against a number you typed, and never queries the `coverage` table where the real standard — the field, question by question — already lives. Make it a **question × competitor matrix with the bar to beat quoted**, and it becomes the one screen nothing else in the app can show.
