# Coverage + Briefs — Plan v2

**Date:** 2026-08-05
**Basis:** live output of the pipeline after the document-scoping fix, on evaluation `446068f56e015dbd` (elportfolio.site, a full-stack development *agency*).
**Supersedes:** Tier 0.1–0.2 of `AIRS-IMPROVEMENT-PLAN.md` (landed) — everything below is new or still open.

---

## Part 0 — The finding that reframes both

The pipeline now runs end to end on 12 real questions and produces 12 briefs. Here are the top four, verbatim from the database:

| # | Question the brief targets |
|---|---|
| 1 | how much to **learn** full stack web development |
| 2 | should i **learn** full stack web development in 2026 |
| 3 | how much should i **charge** for a full stack website |
| 4 | how much do full stack web developers **make** |

The client sells full-stack development services. **Every one of those targets someone who wants to become a developer, or who wants to know developer salaries — not someone who wants to hire one.** Brief #4 asks the agency to publish developer salary data. Brief #1 asks it to publish course prices.

The system is optimising a services business into a tutorial site.

### It already has the data to know better

```
evaluations.search_intent = "transactional"

competitors.competitor_type:
  w3schools.com/whatis/whatis_fullstack.asp      informational
  geeksforgeeks.org/…/what-is-full-stack…        informational
  roadmap.sh/full-stack                          informational
  coursera.org/articles/full-stack-developer     informational
  coursera.org/learn/fullstack-web-development   informational
  aws.amazon.com/what-is/full-stack-development  informational
  intelivita.com/blog/…                          informational
  dev.to/…/roadmap-2026-complete-guide           informational
  weweb.io/blog/how-to-build-…                   informational
  geeksforgeeks.org/websites-apps/…              direct
```

**The evaluation declares transactional intent, 9 of 10 competitors are classified informational, and nothing in the analysis pipeline gates on it.** `competitor_type` is fetched in [analysis/route.ts:51](../src/app/api/evaluations/[id]/analysis/route.ts:51) and used for exactly one thing — spotting `self`:

```ts
const key = `${p.ctype === "self" ? "self:" : ""}${host}`;
```

The mismatch is detected, stored, and discarded. Everything downstream — coverage verdicts, weakness ranking, briefs — is computed against a competitor set the system has already labelled as the wrong kind of page.

This is the highest-value fix in this document, and it is largely a filter over data that already exists.

---

## Part A — Coverage

### A1. 🔴 Gate the corpus on intent — the fix that makes everything else worth doing

A transactional evaluation must not be scored against informational publishers. w3schools is not competing for this client's revenue; it wins the *definition* of full-stack development and will always beat an agency at that, forever, at any effort level. Ranking that as a weakness spends the client's budget on an unwinnable fight.

Concretely:

1. **Filter candidates by intent compatibility.** Transactional evaluation → score `direct` and `transactional` competitors; treat `informational` as reference context, not as the field. Surface the exclusion count so nothing is silently dropped.
2. **If the compatible set is too small, say so.** "8 of 10 results are informational — this query is dominated by education publishers. Consider a commercial query such as *hire full stack developer* or *full stack development agency*." A structural mismatch is a finding, not an empty page.
3. **Carry intent into demand discovery** (see B2) so the questions match the corpus.

The failure mode this prevents is the worst one available: confidently ranked, well-evidenced advice pointing the wrong direction.

### A2. 🟠 Weight subject terms by rarity within the site

Observed gap evidence, live:

```
GAP  w3schools.com | "is full stack web development and web development same"
     source: https://www.w3schools.com/about/about_privacy.asp
```

A **privacy policy** was selected as the best gap evidence. Why: `subjectTerms` returns `["full","stack","web","development"]`, and on a web-development site those words appear on nearly every page, including boilerplate. Every document ties on `subjectCoverage`, so the tie-break falls through to BM25 and picks arbitrarily.

The `subjectCoverage` tie-break I added fixed the cross-topic case (office price vs carpet question) but cannot fix the generic-term case, because it counts terms equally.

**Fix:** weight each subject term by its inverse document frequency *across that site's own crawled pages*. `privacy` is rare and `web` is universal, so the rare terms decide. This is computable from `page_content` with no new data, and it is the same statistic that fixes:

- gap evidence landing on boilerplate,
- the document-selection tie in `assessDocuments`,
- `termCoverage` treating a filler word as equal evidence of topicality.

Deliberately scoped **per site**, not per corpus: what is distinctive about a page is relative to its own domain.

### A3. 🟠 Two classification holes, both visible in live output

```
definition  | how much time does it take to learn full stack web development
definition  | how much time to learn full stack web development
definition  | full stack web
```

1. **"how much time" falls through to `definition`.** The money signature correctly excludes `how much time`, but `duration` only triggers on `how long`, `timeline`, `turnaround`, `deadline`, `how many days|weeks|…`. Nothing catches `how much time`. Both questions scored **0** as a result — they were classified as definitions, found "answered", and dropped out of the ranking. Add `how much time`, `how soon`, `how quickly`, `how fast`, `lead time`.
2. **`"full stack web"` is not a question and is being briefed as one.** It is the `primary_query` fallback. Require question shape (or an explicit answer-type signature) before a string can earn a brief; a bare keyword should produce a coverage row at most.

### A4. 🟠 Decide what `answered` with zero specificity means

Live output:

```
weweb.io   score 76   answered   spec=0   "answers, but too generically to be worth quoting"
```

`explain()` labels it honestly, so this is not a bug — but it is an unresolved design question, and 3 of 8 competitors hit it in the earlier run. A passage that satisfies the answer *shape* while containing nothing a model could not generate itself is, by the product's own thesis, **not a citation candidate**. Yet it counts as `answered`, which suppresses severity and can cancel a brief.

Two options, and I recommend the first:

- **Add a fourth level** — `answered_generic` between `lexical` and `answered`. Keeps the three-tier story intact for reporting while letting weakness scoring treat it as the near-miss it is. Requires a benchmark relabel.
- Keep three levels and make specificity a **multiplier** on severity, so a spec-0 answer barely suppresses the gap.

Either way, stop letting an unquotable answer mask a real opportunity.

### A5. 🟢 Rank `lexical` by distance to answering

`lexical` is the money verdict and today every `lexical` looks identical. But *"packages from mid-range to premium"* is one edit from answering, while *"quality service you can trust"* is nowhere near. The data to separate them already exists — answer-type proximity, subject coverage, whether a near-miss pattern fired at all (`findAnswerEvidence` already returns `firstMatch` on failure).

Emit a `depthDistance` score and surface **"closest to answering"** vs **"nowhere near"**. It changes which gap you attack first, because it predicts how quickly a competitor could close it themselves.

### A6. Per-answer-type benchmark ratchet
`MIN_ACCURACY = 1.0` is aggregate over 32 cases. An aggregate 100% can still hide `comparison` guessing at 60% on 5 cases. Break the ratchet out per `answerType`. A3 above is exactly the class of hole an aggregate number hides.

### A7. Crawl the self site
`corpus.self_crawled: false`. There is no `self` coverage row, so:
- the coverage matrix has an empty "You" column,
- `measureGapMovement` reports `self 0 → 0` for every question,
- `alreadyCovered` can never be true, so briefs are written for questions the client may already answer.

Small change, blocks three features.

---

## Part B — Briefs

### B1. 🔴 `extractSubject` is producing broken instructions — confirmed in the shipped output

Not a hypothetical any more. These are the actual `target_heading` values the client is told to publish:

| Question | Heading generated |
|---|---|
| how much to learn full stack web development | `How much does **how much to learn** full stack web development cost?` |
| how much should i charge for a full stack website | `How much does **how much  charge** for a full stack website cost?` |
| how much do full stack web developers make | `How much does full stack web developers **make** cost?` |

**Three of four money briefs are malformed.** The 20-step `.replace()` chain in [briefs.ts:83](../src/lib/briefs.ts:83) is order-dependent: `how much (does|do|is|are)` doesn't match `how much to`, so the prefix survives and gets wrapped in a second "How much does … cost?". Note the double space — `\bcost\b` and `\bprice\b` are stripped unconditionally, mid-phrase.

**Fix:** delete `extractSubject`. Use `subjectTerms()` from `coverage.ts` — already unit-tested, and it is the *same* function the engine uses to reach its verdict, so the brief's subject stops disagreeing with the analysis. Then build the heading from the answer type over that subject, normalise whitespace, and drop leading articles and possessives. Add a guard test asserting no generated heading contains a double space or a duplicated question stem.

### B2. 🔴 Only brief questions a buyer would ask

The counterpart to A1, on the demand side. `demand.ts` already has `isTopicRelevant`, `isLongTailNoise`, `BOILERPLATE_QUESTION`, and `PRODUCT_SELF_REFERENCE` — what is missing is a **commercial-intent** filter.

Add a `COMMERCIAL_INTENT` classification over each sub-intent:

| Signal | Example | Brief-worthy for a services client? |
|---|---|---|
| buying | *how much does a full stack website cost*, *hire*, *agency*, *near me*, *quote* | ✅ yes |
| evaluating | *X vs Y*, *do i need*, *is it worth* | ✅ yes |
| learning | *learn*, *tutorial*, *roadmap*, *from scratch*, *course* | ❌ no |
| career | *salary*, *how much do … make*, *how much should i charge*, *jobs* | ❌ no |

Then let the evaluation's `search_intent` choose which classes earn briefs. This alone removes briefs #1, #2 and #4 from the live top four and promotes real buyer questions in their place.

`winnability` should reinforce it: an agency has no first-party salary data, so a career question is not winnable and should not score **1.0** — which it currently does (see B7).

### B3. 🟢 Put the bar to beat in every brief — the biggest product gain

Still the strongest available change, and now the data is definitely there: the `coverage` table holds `specificity`, `passage`, `level`, and — new — `source_url` per competitor per question.

Each brief should carry:

- **The field's best current answer, quoted, with its page.** *"Closest today: w3schools.com — `/whatis/whatis_fullstack.asp` — 'a full stack developer works on both front end and back end' — specificity 38."*
- **The number to beat.** Not "be specific" — **"beat 38"**, which is measurable and re-checkable by the same engine.
- **What the field collectively fails to say.** *"0 of 9 state a project price."*
- **Why you can win it.** The `winnability` term already knows whether this is a first-party fact.

That converts a content template into a competitive target, using only data already persisted.

### B4. 🟠 Market-aware currency
[briefs.ts:37](../src/lib/briefs.ts:37) hardcodes `₱[YOUR PRICE]`. Derive the currency from `evaluations.target_location`, then the asset TLD, then a neutral `[CURRENCY][AMOUNT]` — the same ladder as `resolveRegion`. An Australian broker currently gets pricing guidance in Philippine pesos.

### B5. 🟠 Deduplicate near-identical questions
Two briefs shipped for:

```
how much time does it take to learn full stack web development
how much time to learn full stack web development
```

Same intent, same answer, two units of work. Cluster sub-intents by stemmed subject + answer type, keep the highest-demand phrasing as canonical, and record the variants on the brief as "also asked as" — useful content guidance rather than duplicate tasks.

### B6. 🟢 Close the loop — nothing ever sets `verified`
`content_briefs.status` supports `pending → drafted → shipped → verified`; the UI can reach `shipped` and `verified` is unreachable in code. Add: on shipping with a URL, re-crawl that URL and re-run `assessDocuments` for the brief's question.

- `answered` → **verified**, recording the new specificity and passage.
- still `lexical` → hold at shipped with the reason: *"published, but no committed figure — still a hedge."*

The definition of done becomes byte-identical to the definition of the gap. This also fills `outcomes.verdict_before/after` for the attribution chain in the benchmark plan — build them together.

### B7. 🟠 Make `winnability` and `effort` actually discriminate

From the live table:

```
winnability:  1.0 ×8,  0.5 ×5   (0.5 exactly when answer_type = definition)
effort:       low ×8,  medium ×4 (medium exactly when answer_type = steps)
```

Both terms are pure functions of `answerType`. They contribute no independent information to `severity × demand × winnability × durability / effort`, so the ranking is effectively three terms wearing five.

- **winnability** should read first-party ownership: do we hold this fact? Our prices, timelines, team size, process → high. Salary benchmarks, industry statistics → low.
- **effort** should read what the answer requires: a number we already know is trivial; a comparison table needs research; a benchmark study is a project.

Until then, two of the five ranking terms are decoration.

---

## Part C — Sequence

Correctness before capability, and the intent gate before anything that consumes the corpus.

| # | Change | Why this order | Effort |
|---|---|---|---|
| 1 | **A1** intent gating of the corpus | Everything downstream is currently computed against the wrong field | M |
| 2 | **B2** commercial-intent filter on sub-intents | Demand side of the same defect; without it briefs stay mis-targeted | M |
| 3 | **B1** delete `extractSubject` → `subjectTerms` | Malformed instructions in the shipped deliverable | S |
| 4 | **A3** `how much time` → duration; reject non-questions | Two live questions scoring 0 for the wrong reason | S |
| 5 | **A7** crawl self | Unblocks the "You" column, gap movement, `alreadyCovered` | S |
| 6 | **A2** subject-term IDF within site | Stops boilerplate being quoted as evidence | M |
| 7 | **B4** market currency · **B5** dedup | Small, visible, independent | S |
| 8 | **B3** bar-to-beat in briefs | Biggest product gain; needs 1–6 to be trustworthy | M |
| 9 | **B7** real winnability and effort | Makes the ranking mean what it claims | M |
| 10 | **A4** resolve `answered`-but-unquotable | Needs a benchmark relabel; do it deliberately | M |
| 11 | **A5** rank `lexical` by distance · **A6** per-type ratchet | Sharpening, once the corpus is right | M |
| 12 | **B6** verification loop → `verified` | Pairs with the benchmark attribution chain | M |

Steps 1–2 are the ones that change what the product recommends. Steps 3–5 are small and fix visibly broken output. Step 8 is where the brief becomes a competitive weapon rather than a writing prompt.

---

## The one-line summary

**Coverage is scoring the client against nine education publishers it has already labelled `informational` while the evaluation declares `transactional`** — so the briefs tell a development agency to publish course prices and developer salaries, in headings like *"How much does how much to learn full stack web development cost?"*. Gate the corpus and the demand set on intent, replace `extractSubject` with the engine's own `subjectTerms`, and put the quoted bar-to-beat in every brief. The data for all three already exists in the database.
