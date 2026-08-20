# AIRS — The Algorithm and the Update Plan

**Status:** algorithm implemented and benchmarked; analysis pipeline partially wired.
**Last updated:** 2026-08-05

---

## 0. What AIRS is for

One sentence: **find the weakness in the competitors an AI assistant already cites, and turn that weakness into work that makes our page the one it cites instead.**

Two things follow from that sentence, and they are the reason AIRS is not an SEO tool.

1. **The competitor set is not "who ranks on Google."** It is *whoever an AI answer draws from*. That set is smaller, more stable, and chosen on different grounds than a SERP.
2. **The scored entity is the competitor, not us.** RRS measures *them*. Our score is a by-product. This is by design — the deliverable is the gap, not the grade.

And one hard constraint, set by the product owner:

> **No LLM in the pipeline.** The algorithm must be deterministic, keyless, and explainable. Same input, same output, every time, with the passage that produced each number attached to it.

That constraint is not a limitation to work around. It is what makes the output *auditable*, which is the thing an agency can actually sell.

---

## 1. The algorithm

### 1.1 The model of AI citation we are reproducing

An AI assistant answering a question does four things in order. A page must survive all four to be cited. Fail any one and the rest is irrelevant.

```
        ┌─────────────┐  robots.txt allows GPTBot / OAI-SearchBot /
   1.   │  CRAWLABLE  │  ClaudeBot / PerplexityBot / Google-Extended?
        └──────┬──────┘  → NO: hard zero. Nothing else matters.
               │
        ┌──────▼──────┐  Does the page surface for the *sub-queries* the
   2.   │  RETRIEVED  │  assistant fans out to, not just the headline query?
        └──────┬──────┘
               │
        ┌──────▼──────┐  Is there a *passage* — not a page — that answers
   3.   │  QUOTABLE   │  in the shape the question demands?
        └──────┬──────┘
               │
        ┌──────▼──────┐  Does it state a fact the model *cannot generate
   4.   │  PREFERRED  │  from its own weights*? Specificity is the moat.
        └─────────────┘
```

Gate 4 is the insight the whole scoring rests on. A model will happily write "pricing varies by provider" from memory. It will *not* invent "$1,850 setup, $240/month, 14-day onboarding." **To be cited is to be unguessable.** Specificity is therefore not a style preference; it is the citation mechanism.

### 1.2 How the deterministic engine works

The pipeline, module by module. All of it runs with no API key.

```
 topic / intent
      │
      ▼
 ┌──────────────────────────────────────────────┐
 │ demand.ts        DISCOVER THE QUESTIONS      │
 │ autocomplete seeds + competitor headings     │
 │ → the sub-queries an assistant fans out to   │
 └────────────────┬─────────────────────────────┘
                  ▼
 ┌──────────────────────────────────────────────┐
 │ search.ts        FIND THE CITED SET          │
 │ region-locked SERP → the pages in play       │
 └────────────────┬─────────────────────────────┘
                  ▼
 ┌──────────────────────────────────────────────┐
 │ indicators.ts    READ EACH PAGE HONESTLY     │
 │ content-root detection, link-density filter  │
 │ → real prose, not nav chrome                 │
 └────────────────┬─────────────────────────────┘
                  ▼
 ┌──────────────────────────────────────────────┐
 │ coverage.ts      DOES IT ACTUALLY ANSWER?    │
 │ classify → chunk → rank → verify answer shape│
 │ → none | lexical | answered  (+ the passage) │
 └────────────────┬─────────────────────────────┘
                  ▼
 ┌──────────────────────────────────────────────┐
 │ citation.ts      WHO GETS CITED, AND WHY     │
 │ 5 weighted factors, crawlability as a gate   │
 │ → ranked pages + ranked weaknesses           │
 └──────────────────────────────────────────────┘
```

#### Step 1 — `demand.ts`: what people actually ask

The headline query is one question. An assistant answering it fans out into many. We reconstruct that fan-out from two keyless sources:

- **Autocomplete suggestions** for generated seed prefixes (`how much does {topic}`, `is {topic} worth`, `{topic} vs`, …).
- **Competitor headings** — an `<h2>` on a page in the cited set is a question someone decided was worth answering.

Autocomplete is preferred over headings when both are available, because it reflects demand rather than one vendor's content plan.

Three filters keep the list honest, each written because the unfiltered version produced garbage:

| Filter | Kills | Why it exists |
|---|---|---|
| `BOILERPLATE_QUESTION` | "did you find what you were looking for today?" | Cookie banners and feedback widgets look like questions |
| `PRODUCT_SELF_REFERENCE` | "do not track" | Chrome text mimics question syntax |
| `isLongTailNoise` | degenerate multi-clause strings | Autocomplete tails are not demand |
| `isTopicRelevant` | off-topic drift | Whole-word tokens, prefix match only for ≥5-char tokens — because `"apparel"` contains `"app"` |

#### Step 2 — `search.ts`: the cited set, in the right market

The bug that motivated this: an evaluation targeting **Australia** returned **Philippine** insurance brokers. Three compounding causes — no location input in the wizard, no region parameter on the query (so the search engine geolocated by *our server's IP*), and a `.com.au` asset URL being ignored.

Resolution is now explicit and ordered:

```ts
export function resolveRegion(location?: string | null, assetUrl?: string | null): string {
  return regionFromLocation(location) ?? regionFromUrl(assetUrl) ?? ALL_REGIONS;
}
```

`ALL_REGIONS` (`wt-wt`) is a *deliberate* fallback. The rule: **never let the server's IP silently choose the market.** An explicit "all regions" is honest; an accidental Manila is not.

#### Step 3 — `indicators.ts`: extraction that doesn't lie

The single source of truth for page indicators (it replaced three drifting copies). Two mechanisms matter:

- **Content-root detection.** Try `article`, `main`, `[role="main"]`, `#content`, `.entry-content`, … and accept a root only if it holds **≥25% of body text**. Below that the "root" is a widget, not the content.
- **Link-density filter.** Drop any section whose characters are >60% inside anchors:

  ```ts
  const linkRatio = current.totalChars > 0 ? current.linkChars / current.totalChars : 0;
  if (text.length > 40 && linkRatio > 0.6) return;
  ```

This was learned the expensive way. On w3schools, heading extraction pulled **510 nav headings**. The first fix — blanket-stripping `[class*="nav"]` — *destroyed the content*, leaving 2 footer headings and 251 words. Density beats class-name heuristics: navigation is structurally link-dense, whatever it calls itself.

#### Step 4 — `coverage.ts`: the core

This is the module that decides whether a page answers a question. It has no model in it. It works by asking a narrower, decidable question:

> **Does any passage on this page contain a token of the *shape* this question requires, about the *subject* of the question?**

**a. Classify the answer type.** Eight shapes, each with a decidable test:

| Type | Question form | Satisfied by |
|---|---|---|
| `money` | how much, cost, price | a number **anchored to a currency** |
| `duration` | how long, when | a number + time unit (incl. word-numbers) |
| `count` | how many | a quantity **of the subject** |
| `steps` | how do I | ordered/enumerated procedure |
| `comparison` | vs, better than | both sides named with a differentiator |
| `entity` | who, which provider | a named entity |
| `boolean` | can I, is it, does it | an affirmation/negation (dash-tolerant) |
| `definition` | what is | a copular definition of the subject |

Each of those "anchored to" clauses is load-bearing. `money` without the currency anchor matched phone numbers. `count` without *of-the-subject* matched any stray integer. Every anchor is a false positive that got caught.

**b. Chunk and rank.** `chunkText` produces 60-word windows with 20-word overlap — overlap so an answer straddling a boundary is not lost. Ranking is BM25 (k1=1.5, b=0.75) with light stemming, domain synonyms, and prefix matching (`MIN_PREFIX_MATCH = 6`).

**c. Gate on concept coverage.** `termCoverage` must clear `MIN_TERM_COVERAGE = 0.4`. This exists because BM25 on a handful of passages has **degenerate IDF** — one absent rare term can outweigh four present ones. The gate asks a blunt question BM25 can't: *is the passage even about this?*

**d. Verdict — three levels, and the middle one is the product.**

| Verdict | Meaning | Sold as |
|---|---|---|
| `none` | the field never approaches the dimension | **Tier 1 — coverage gap.** Nobody answers this. Own it. |
| `lexical` | the words are there, the answer is not | **Tier 2 — depth gap.** Everyone gestures; nobody commits. |
| `answered` | a passage supplies the required shape | Table stakes. Reach parity, don't differentiate. |

`lexical` is where the money is. A page that says "our pricing is competitive" is lexically about pricing and answers nothing. That is a page we beat with one honest number.

**e. The computed hedge.** If no retrieved passage supplies the required answer shape, **any synthesizer must equivocate** — it has nothing to quote. So hedging is not a text pattern we detect; it is a *consequence we compute*. It then acts as a multiplier on the citation score.

**f. Evidence, or nothing.** Early versions quoted a glossary entry as proof of pricing coverage. Fixed with `GAP_VOCABULARY` plus density normalisation, and `gapEvidence: string | null` — **null when the field never approaches the dimension.** A claim with no quotable passage behind it now shows no quote rather than a misleading one. No score without its passage.

Light morphology throughout, including:

```ts
function stripFinalE(token: string): string {
  return token.length > 4 && token.endsWith("e") ? token.slice(0, -1) : token;
}
```

so `pricing` and `price` unify — a page that plainly answered was being rejected over `costs` ≠ `cost`.

#### Step 5 — `citation.ts`: which page gets cited, and why

`predictCitations` scores each candidate on five weighted factors:

| Factor | Weight | Reads |
|---|---|---|
| `queryMatch` | 0.30 | BM25 relevance of the best passage |
| `answerPresence` | 0.25 | Does a passage satisfy the answer type? |
| `specificity` | 0.20 | Numbers, named entities, concrete claims |
| `extractability` | 0.15 | Is the answer self-contained and quotable? |
| `freshness` | 0.10 | Half-life 12mo volatile / 36mo stable |

Plus a **hard gate**: `aiCrawlable === false` → score **0**. Not a penalty. A page the crawlers can't fetch cannot be cited, and averaging that into a 73/100 would be a lie.

This is the direct answer to *"what page is the result and why is that page cited."* Every prediction returns its factor breakdown and the passage each factor scored — so the answer is never "the model thinks so."

#### Step 6 — scoring the weakness

Finding a gap is easy. Ranking gaps by *what to do Monday* is the product. Five terms:

```
score = severity × demand × winnability × durability / effort
```

| Term | Asks |
|---|---|
| **severity** | how badly is the field failing this? (`none` > `lexical`) |
| **demand** | do people actually ask this? (from `demand.ts`) |
| **winnability** | can *we* credibly answer it? First-party facts we already own beat facts we'd have to research |
| **durability** | will the answer still be true in a year? |
| **effort** | `EFFORT_BY_TYPE` — a price we already know is cheap; a benchmark study is not |

`FIRST_PARTY_TYPES` is why winnability matters more than it looks: **our own prices, timelines, and process are facts no competitor and no model can generate.** That is the cheapest moat available, and most sites leave it unwritten.

### 1.3 How well does it work

Honestly, and with the history, because the history is the credibility.

**The held-out benchmark** — `independent-cases.json`: 32 cases, 20 industries, distribution `answered:16 / lexical:12 / none:4`. Held out means: written to test the algorithm, never used to tune it.

| Milestone | Accuracy | What happened |
|---|---|---|
| First run, 19 cases | 21% | Degenerate IDF + no morphology |
| After stemming + IDF gate | 89% | |
| After duration units, title exclusion | 100% | On the *development* set |
| **Independent set, first run** | **78.1%** | The reckoning |
| After `patch1` | 94% | |
| Current | **100%** (`MIN_ACCURACY = 1.0`) | Ratchet, upward only |

The 78.1% result is the most valuable number in this document. An independent validation pass named the root cause of most false `answered` verdicts as **my own `pageScope` union** — a change I had added to fix a single wedding-photographer case. Its verdict:

> *"the algorithm does not hold up. It is not shippable as a gap-detection product in its current form."*

That was correct, and acting on it is what produced the current engine. The lesson is now structural: `MIN_ACCURACY` **ratchets upward only** and records where we actually are. A convenient fix that moves the development set and drops the held-out set is a regression, and the test says so.

**Current state:** 110 unit tests pass; held-out accuracy 100%.

**What it does not do, stated plainly:**

- It does not query a live AI assistant, so the cited set is *modelled* from search + crawl, not observed.
- Answer-type classification is rule-based. A question phrased unusually can be typed wrong.
- Freshness depends on `Last-Modified`, which many sites lie about or omit.

None of these are fatal, and all of them are visible in the output rather than hidden in a score.

---

## 2. The AIRS analysis update plan

### 2.1 Evaluation

**What the evaluation is:** the point where a topic becomes a scored, evidenced competitive picture.

Landed:

- **Region resolution** — explicit target location, TLD fallback, `wt-wt` last. The Australia→Philippines bug is closed and verified live (the `claytoninsurancebrokers` evaluation now returns eight `.com.au` competitors).
- **Prevalence gating** — a finding must hold across enough of the field to be a *field* weakness. "8 of 8 competitors publish pricing" is table stakes; one competitor missing something is noise.
- **Competitor-type scoping** — directories and aggregators are not compared against a service business.
- **Consolidated indicator extraction** — one `indicators.ts`, word-boundary matching, content-root + link-density.
- **Content storage** — `page_content` table, so evidence is re-checkable without re-crawling.
- **Self-as-scored-entity** — our own site runs through the same pipeline as the competitors. No special case.
- **Evidence discipline** — every finding carries the passage that produced it, or carries none.

Next:

1. **Wire the coverage engine into the evaluation run.** The engine is built and benchmarked; the evaluation still reports indicator-level findings. This is the highest-value remaining step — it converts "8 of 8 publish pricing" into "8 of 8 *mention* pricing, 0 of 8 *state a number* → Tier 2 depth gap, evidence attached."
2. **Surface the three-tier verdict in the UI**, with `lexical` visually distinct from `answered`. Right now the most valuable verdict is the least visible.
3. **Show the citation factor breakdown per competitor page** — the "why is *that* page cited" panel.

### 2.2 Mission

**What a mission is:** the ranked weakness list turned into work, verified by the system rather than checked off by hand.

Landed:

- Four phases (Month 1 / 2-3 / 4-6 / 7-12).
- Automated audit feeding the plan.
- System verification of task completion — no manual check-offs.

Next:

1. **Generate tasks from `rankWeaknesses`** rather than from audit checks alone. A mission task should read: *"Publish your commercial-lines starting price. 8 of 8 competitors mention pricing; 0 state a number. Tier 2 depth gap. Effort: low — you already know this number."* That sentence is the entire product.
2. **Phase assignment from the score terms** — high winnability + low effort belongs in Phase 1 by construction, not by editorial judgement.
3. **Re-verify against the same coverage engine.** A task is done when the page now `answered` a question it previously `lexical`-ed. Same engine, so the definition of done is the definition of the gap.

### 2.3 Benchmark

**What the benchmark is for:** it is the reason to believe any of the above.

Landed:

- `independent-cases.json` — 32 cases, 20 industries, held out.
- `MIN_ACCURACY` ratchet with documented history.
- 110 unit tests across coverage, citation, demand, indicators, search.

Next:

1. **Grow the held-out set toward 100 cases**, keeping the `answered / lexical / none` mix roughly stable. Written first, never tuned against.
2. **Track per-answer-type accuracy.** Aggregate accuracy hides which of the eight shapes is weakest. Break it out.
3. **An optional model-comparison harness** — run the same questions past a real assistant *once*, purely to measure agreement between our modelled cited set and the observed one. Read-only, offline, not in the pipeline. This is how we learn what the deterministic approach is missing without violating the no-LLM constraint.

### 2.4 Reporting

Landed (this session):

- `AppChrome` structurally excludes the app shell on `/report` routes via `usePathname()` — chosen over print-CSS hiding so the sidebar **cannot** reach the PDF whatever the stylesheet does.
- `ReportShell` / `ReportSection`: A4-measured page (210mm) so the screen matches the PDF, `break-inside: avoid` on cards, a `no-print` toolbar, and `document.title` set to a `fileStem` so the PDF is named `AIRS Evaluation — {query}.pdf` instead of `localhost`.
- Evaluation and mission have **separate reports** with their own facts blocks and their own pagination.
- Print stylesheet: `@page { size: A4; margin: 12mm 12mm 14mm }`, `print-color-adjust: exact`, orphans/widows, `thead { display: table-header-group }` so table headers repeat.
- Chrome-hiding scoped with `:not(.report-page *)` — the unscoped `header { display: none }` would have erased the report's own title block from page 1.

Verified in-browser: 0 `aside`, 0 `nav`, report header present inside `.report-page`, page width 794px (= 210mm @ 96dpi), 5 page breaks resolving to `break-before: page`, `thead` at `table-header-group`, no console errors on either report.

---

## 3. The through-line

Every design decision above answers to one question: **can we show the user the passage?**

- Deterministic, so the answer is reproducible.
- Passage-level, so the answer is quotable.
- Three-tier, so the answer distinguishes *absent* from *hedged*.
- Held-out benchmarked, so the accuracy claim is not self-reported.
- Crawlability as a gate, not a penalty, so the score never averages away a disqualification.

An agency can put that in front of a client. That is the product.

---

## Appendix — module map

| Module | Lines | Role |
|---|---|---|
| `src/lib/coverage.ts` | 835 | Answer-type classification, chunking, BM25 ranking, three-tier verdict, specificity |
| `src/lib/indicators.ts` | 599 | Page extraction: content roots, link-density filter, signal detection |
| `src/lib/citation.ts` | 326 | Citation prediction (5 factors + crawlability gate), weakness scoring |
| `src/lib/demand.ts` | 267 | Keyless demand discovery: autocomplete seeds, heading sub-intents, noise filters |
| `src/lib/search.ts` | 192 | Region-locked search, `resolveRegion` |
| `src/lib/independent-cases.json` | — | 32-case held-out benchmark, 20 industries |
| `src/components/report-shell.tsx` | 131 | A4 document shell, PDF filename, section pagination |
| `src/components/app-chrome.tsx` | — | Structural chrome exclusion on report routes |
