# AIRS Analysis — Improvement Plan (Coverage + Briefs)

**Date:** 2026-08-05
**Scope:** `src/lib/coverage.ts`, `src/lib/briefs.ts`, `src/app/api/evaluations/[id]/analysis/route.ts`

The single best improvement is not a new feature. It is **fixing a scope leak in coverage that silently inflates competitor scores and deletes briefs before they are written.** Everything else in this plan is worth less until that is fixed, because briefs are generated *from* coverage verdicts — a wrong verdict doesn't produce a bad brief, it produces **no brief at all**.

---

## Tier 0 — Correctness. Do these first.

### 0.1 🔴 The site-union scope leak — false `answered` verdicts

**This is the 78.1% bug, still live.** The independent validation named `pageScope` as the root cause of most false `answered` verdicts. It was fixed inside `assessPassages`, but the *analysis route* reintroduces it at a higher level.

[analysis/route.ts:63](../src/app/api/evaluations/[id]/analysis/route.ts:63) unions **every crawled page of a site** into one candidate:

```ts
// Group pages into one candidate per site: a citation names a page, but coverage of
// a question is a property of the site's whole crawled footprint.
```

Then [coverage.ts:667](../src/lib/coverage.ts:667) builds subject scope from *all* headings in that candidate:

```ts
const pageScope = kept.map((p) => p.heading ?? "").join(" ");
```

and [coverage.ts:302](../src/lib/coverage.ts:302) unions that into proximity with **no distance limit**:

```ts
const inScope = new Set([...tokenize(window), ...scopeTokens]);
```

So once any page anywhere on the site has a heading containing the subject, subject proximity becomes free for every passage on every other page.

**Reproduced.** A site with a carpet-cleaning page (no price) and an unrelated office-cleaning page (`$450 per month`), asked *"how much does carpet cleaning cost"*:

| Unit of assessment | Verdict | Evidence quoted |
|---|---|---|
| Page-scoped (correct) | `lexical` | "Contact us for a carpet cleaning quote…" ✅ |
| Site-union (what runs today) | **`answered`** | "Standard **office** cleaning contracts start at $450 per month…" ❌ |

The verdict flips, and the quoted evidence is a passage about a different service from a different page.

**Damage, in order of severity:**

1. Competitor coverage inflates → `severity` falls → **the gap drops out of `rankWeaknesses` entirely.** The weakness you were going to exploit becomes invisible.
2. If it happens on *your* site, `alreadyCovered` goes true and [briefs.ts:123](../src/lib/briefs.ts:123) does `if (w.alreadyCovered) continue;` — **the brief is never written.**
3. The report quotes an off-topic passage as proof. This is exactly the "misleading evidence" failure already fixed once at page level.
4. **The held-out benchmark cannot catch it**, because every benchmark case feeds one page's passages. The 100% is real, and it is measuring the wrong unit.

**Fix — assess per page, aggregate to site:**

```
for each site:
  for each crawled page:            ← scope stays inside one page
     assessPassages(question, page.passages)
  siteVerdict = best page verdict   ← "answered" iff some single page answered
  citedPage   = the page that produced it
```

This preserves the route's actual intent ("coverage is a property of the site's footprint") while making the *scope* what it must be — one document. It also yields something the product currently cannot state: **which page is the citation candidate.** That is the "why is *that* page cited" question, answerable for free as a side effect.

Additionally, bound proximity inside `findAnswerEvidence` — heading scope should come from the passage's own heading chain, not a flat join of every heading in the document.

**Guard so it cannot return:** add multi-page cases to `independent-cases.json` where one page answers a *different* question than the one asked. Current cases are all single-page, which is why this survived.

---

### 0.2 🔴 Re-running the analysis destroys the user's brief progress

[briefs.ts:118](../src/lib/briefs.ts:118):

```ts
run("DELETE FROM content_briefs WHERE evaluation_id = ?", [evaluationId]);
```

But `status` is a real lifecycle the user drives from the UI — `pending → shipped → verified` ([briefs page:93](../src/app/projects/[projectId]/evaluations/[id]/briefs/page.tsx:93)). Every re-run of `/analysis` silently wipes every "shipped" and "verified" mark, plus any drafted content.

**Fix:** upsert on `(evaluation_id, question)`. Refresh the computed fields (score, severity, evidence, required format); **preserve** `status` and `draft_content` when the user has touched them. Delete only briefs whose question no longer appears in the weakness set, and prefer archiving over deleting anything the user shipped.

---

### 0.3 🟠 `extractSubject` writes broken headings into the deliverable

[briefs.ts:83](../src/lib/briefs.ts:83) is an order-dependent chain of 20 `.replace()` calls. The output goes straight into `target_heading` and the draft the user is told to publish. Tested on real insurance queries — **3 of 7 broke:**

| Question | Extracted subject | Heading the brief tells you to publish |
|---|---|---|
| how much does commercial insurance cost | `commercial insurance` | ✅ How much does commercial insurance cost? |
| what is the cost of business insurance in australia | `the  of business insurance in australia` | ❌ *How much does the  of business insurance in australia cost?* |
| how much does it cost to insure a cafe | `it  to insure a cafe` | ❌ |
| how long does a claim take | `a claim take` | ❌ dangling verb |
| is my business insurance tax deductible | `my business insurance tax deductible` | ❌ leading possessive |

Note the double spaces — `\bcost\b` and `\bprice\b` are stripped unconditionally, mid-phrase.

**Fix:** reuse `subjectTerms()` from `coverage.ts` instead. It already strips answer-shape words correctly and is unit-tested, and it is the *same* function the coverage engine uses to decide the verdict — so the brief's subject and the engine's subject stop disagreeing. Then normalise whitespace, drop leading articles/possessives, and template the heading from the answer type rather than string-surgering the question.

---

### 0.4 🟠 Briefs are hardcoded to ₱ regardless of market

[briefs.ts:37](../src/lib/briefs.ts:37) writes `₱[YOUR PRICE]`, `₱[LOW]`, `₱[HIGH]`. The Australian broker evaluation — which we just fixed the region handling for — gets a pricing brief denominated in Philippine pesos.

**Fix:** derive currency from `evaluations.target_location` (the field already exists and is populated), fall back to the asset TLD, then to a neutral `[CURRENCY][AMOUNT]`. Same resolution ladder as `resolveRegion` in `search.ts` — one source of truth for market.

---

## Tier 1 — Make coverage sharper

### 1.1 Report the citation candidate page, not just the site
Falls out of 0.1 for free. The evaluation can then say *"aibinsurance.com.au answers this — on `/commercial/liability`, in the section headed 'What does it cost'"*. Today it can only name the domain.

### 1.2 Per-answer-type accuracy in the benchmark
`MIN_ACCURACY = 1.0` is aggregate. It hides which of the eight answer shapes is weakest. Break the report out by `answerType` and ratchet each independently — an aggregate 100% across 32 cases can still mean `comparison` is guessing at 60% on 5 cases.

### 1.3 Grow the held-out set toward 100 cases, multi-page
Keep the `answered / lexical / none` mix stable, and make **multi-page sites the default case shape**, since that is what production feeds. Write cases before touching the engine, never after.

### 1.4 Rank the `lexical` verdicts by how close they came
`lexical` is the money verdict, but today all `lexical` results look alike. A page that says *"packages from mid-range to premium"* is one edit from answering; a page that says *"quality service you can trust"* is not. Score the distance — right answer type nearby, subject present, just no committed value — and surface **"closest to answering"** vs **"nowhere near"**. That distinction changes which gap you attack first, because it predicts how fast the competitor can close it.

### 1.5 Make hedging explicit in the output
The hedge is already computed (`forcesHedge`). Surface it as a first-class column with the phrase that caused it — "contact us for pricing", "it depends". That phrase is the single most persuasive thing to show a client, and it's currently buried in the API response.

---

## Tier 2 — Make briefs actually competitive

The brief today says *what shape to write*. It does not say *what to beat*. That is the gap between a content template and the AIRS thesis.

### 2.1 🟢 Put the bar to beat in every brief — the highest-value brief change

A brief should carry, from data already computed and already stored in the `coverage` table:

- **The field's best current answer, quoted.** "aibinsurance.com.au is the closest: *'premiums typically start from $600 annually'* — specificity 0.42."
- **The specificity number to exceed.** Not "be specific" — *"beat 0.42"*, which is measurable and re-checkable.
- **What the field collectively fails to say.** "0 of 8 state a figure for cafés specifically."
- **Why you can win it.** The `winnability` term already knows this is a first-party fact you own.

That turns "write a pricing section" into "here is the sentence that is currently winning, here is the number to beat, here is why you can." Same data, transformed from advice into a target.

### 2.2 🟢 Close the loop — verify with the engine that found the gap

`status` already has `verified`, and nothing ever sets it. Add: when a brief is marked shipped with a URL, re-crawl that URL and re-run `assessPassages` for the brief's question.

- `answered` → promote to **verified**, record the new specificity and the passage.
- still `lexical` → hold at shipped with the reason: *"published, but no committed figure — still a hedge."*

This is the strongest thing in the whole system, because the definition of *done* is byte-identical to the definition of the *gap*. No human judgement in the loop, and it is a re-runnable weekly diff.

### 2.3 Draft from evidence, not from a static template
`BRIEF_SPECS` templates ignore the competitor evidence entirely. Feed the field's best passage in as a contrast example ("they wrote this; here is the shape that beats it") and use the sub-intent's own wording for the heading, since that wording is what people actually type.

### 2.4 Order briefs by the ship decision
Currently ordered by `weakness_score DESC` only. Group by **effort × winnability** so the page reads as: *this week (low effort, high winnability)* → *this month* → *this quarter*. Same ranking, sequenced as work.

---

## Tier 3 — Calibrate against reality

`src/lib/calibration.ts` already computes precision@5 / recall@5 of predicted citations against **observed** AI citations. That is the only external truth in the system, and the held-out benchmark is not a substitute for it — the benchmark measures whether the engine agrees with *us*.

1. Capture observed citations for the questions in one live evaluation.
2. Run `calibration.ts` and record precision@5 as the headline accuracy number.
3. Re-run it after fixing 0.1 — this is the cleanest possible measurement of whether that fix matters in production, not just in tests.

If precision@5 is low while the benchmark sits at 100%, the benchmark is measuring the wrong thing and Tier 1.3 becomes the priority.

---

## Sequence

| # | Change | Why now | Effort |
|---|---|---|---|
| 1 | **0.1** page-scoped assessment | Everything downstream inherits the verdict | M |
| 2 | **0.1-guard** multi-page benchmark cases | Locks the fix in | S |
| 3 | **0.2** brief upsert | Stops silent data loss | S |
| 4 | **0.3** `extractSubject` → `subjectTerms` | Broken headings in the deliverable | S |
| 5 | **0.4** market-aware currency | Wrong currency in a fixed-region product | S |
| 6 | **2.1** bar-to-beat in briefs | Biggest product gain; data already exists | M |
| 7 | **2.2** verification loop | Closes gap → work → proof | M |
| 8 | **1.4 / 1.5** rank `lexical`, surface hedge phrase | Sharpens the money verdict | S |
| 9 | **1.2 / 1.3** per-type accuracy, grow the set | Keeps the accuracy claim honest | M |
| 10 | **3** calibration as headline number | External truth | M |

Steps 1–5 are correctness and should land together. Steps 6–7 are where the product gets meaningfully better.

---

## The one-line summary

**Coverage is measuring the wrong unit** (site, not page), which inflates competitor scores and suppresses the briefs you most want — and **briefs describe a shape instead of naming the bar to beat**, which is the difference between a content template and a competitive weapon.
