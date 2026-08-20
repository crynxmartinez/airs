# AIRS Analysis — Algorithm and Update Plan

How AIRS finds competitor weakness for AI search, without an LLM, and how that flows
through evaluation → coverage → weakness → recommendations → mission → benchmark.

Companion to [PLAN.md](PLAN.md), which tracks phases and status. This document is the
design: what the algorithm does, why each part exists, and what it cannot do.

---

## 1. What we are measuring

**Classic SEO** competes for ranking positions. **AI search** competes for *citations* —
when someone asks ChatGPT, Google's AI Overview, Perplexity or Claude about a topic,
some set of pages gets retrieved and quoted. Those pages are the competition.

So the unit of analysis is not "who ranks" but **"who gets quoted, and where are they
weak."**

### The insight that makes it work without AI

An AI answer is:

```
answer = synthesize( retrieve(query) )
```

Synthesis needs a model. **Retrieval does not** — it is classic information retrieval,
fully deterministic. And AIRS only needs the retrieval half, because "which sources get
cited" is a retrieval outcome.

This also lets the **hedge signal be computed rather than observed**. Instead of reading
an assistant say *"costs vary depending on scope"*, we compute *why* it would: retrieve
the best passages for the question, check whether any contains a currency figure, and if
none does, **any** synthesiser is forced to hedge. Same finding, derived from evidence,
and it names the missing fact.

---

## 2. The four gates to being cited

Failing an earlier gate makes later ones irrelevant.

| Gate | Requirement | Where it lives |
|---|---|---|
| **0 — Crawlable** | AI crawlers allowed: `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended` | `src/lib/geo.ts` → hard gate in `predictCitations` |
| **1 — Retrieved** | Findable for the *fan-out sub-queries* an assistant actually issues, not the head term | `src/lib/demand.ts` |
| **2 — Quotable** | A self-contained answer passage under a question-shaped heading — retrieval is chunk-level | `extractContent` sections, `scoreExtractability` |
| **3 — Preferred** | Supplies something the model cannot generate itself: a figure, a date, a named entity | `scoreSpecificity` |

**Gate 3 is the competitive game.** The original 20 hygiene indicators (schema, viewport,
canonical, alt text) all sit at Gate 2 and below — necessary, never sufficient. Against a
strong field they find nothing, because hygiene is where strong competitors are strongest.

---

## 3. The algorithm

```
topic
 └─ A. DEMAND      real queries people type            demand.ts
     └─ B. SUPPLY  heading-anchored passages           indicators.ts → page_content
         └─ C. COVERAGE  does this page answer it?     coverage.ts
             └─ D. CITATION  who would be quoted?      citation.ts
                 └─ E. WEAKNESS  what is worth attacking?  citation.ts
```

### A — Demand (`src/lib/demand.ts`)

Real query strings from keyless public endpoints. No API key.

| Step | Function | Notes |
|---|---|---|
| Seed expansion | `buildSeeds` | Autocomplete only completes forward, so 14 question prefixes ("how much does…") and 7 suffixes ("… vs", "… near me") are how question-shaped queries surface at all |
| Google autocomplete | `googleSuggest` | Locale-aware via `gl` / `hl` — matters when the buyer is in Manila and global cost content is priced in USD |
| DuckDuckGo autocomplete | `ddgSuggest` | Higher volume, more drift |
| Competitor headings | `subIntentsFromHeadings` | What the field *chose* to answer — free, already stored by the crawl |
| Noise rejection | `isTopicRelevant`, `isLongTailNoise`, `BOILERPLATE_QUESTION` | See §7 — every filter here exists because of specific garbage observed in a real run |

Stored in `sub_intents` with `source` and `is_question`, so downstream can weight
autocomplete-sourced (proven demand) above heading-sourced (inferred demand).

### B — Supply (`src/lib/indicators.ts` → `page_content`)

The crawl stores what a page **says**, not just what it scores.

- `extractContent` produces **heading-anchored sections** — a heading plus the copy
  belonging to it. Retrievers chunk on structure; a fixed word window splits an answer
  away from the heading that introduces it.
- Boilerplate stripping is **semantic tags and ARIA roles only**. Blanket class matching
  (`[class*="nav"]`) was tried and removed — it fixed mega-menus on some sites and
  deleted the article body on others.
- Navigation headings are rejected by **link density**: a heading whose text is ≥90%
  anchor text is a nav label, not a section title. This fails safe.
- Also stored: `hasOrderedList`, `hasTable` (needed by the `steps` and `comparison`
  answer types), plus `published_at` / `modified_at` for freshness.

### C — Coverage (`src/lib/coverage.ts`)

The core. Three outcomes per (question × site):

| Level | Meaning | Weakness tier |
|---|---|---|
| `none` | The page does not discuss the question | **Tier 1 — coverage gap** |
| `lexical` | Discusses it but supplies no answer of the required shape | **Tier 2 — depth gap** |
| `answered` | Supplies the required answer shape | — |

Pipeline inside `assessPassages`:

1. **`classifyQuestion`** — what shape of answer does this question demand?
2. **`termCoverage`** — relevance gate. A concept counts as present three ways: exact
   stem, domain synonym (`Pricing` satisfies `cost`), or 6-character prefix
   (`photographer` / `photography`). Threshold `MIN_TERM_COVERAGE = 0.4`.
3. **`rankPassages`** — BM25 over sections, with synonym-expanded query tokens.
4. **`findAnswerEvidence`** — does a top passage supply the answer, *about this subject*?
   Requires the match to sit near a subject term (window ±140 chars, or established by
   the section heading / page title) and rejects `DISTRACTOR_CONTEXT`.
5. **`scoreSpecificity`** — how quotable the passage is.
6. **`selectGapEvidence`** — for a gap, quote where the field approaches the dimension
   and stops short. Returns `null` when nothing does, which is a meaningful answer.

### Answer-type taxonomy

Every question demands a shape of answer. A page can rank #1 lexically and still fail
this check — **that failure is precisely the depth gap.**

| Type | Question shape | Answer evidence | Effort to fill | First-party? |
|---|---|---|---|---|
| `money` | how much, cost, price, rate, fee | `₱50,000`, `starts at`, `per month` | low | ✅ you own your prices |
| `duration` | how long, timeline, turnaround | `3 weeks`, `60–90 minutes` | low | ✅ you know your schedule |
| `count` | how many | a bare number | medium | — |
| `steps` | how to, process, guide | `step 1`, `first…then`, `<ol>` | medium | ✅ your documented process |
| `comparison` | X vs Y, difference between | `versus`, `whereas`, `compared to` | **high** | ❌ needs outside research |
| `entity` | who, where, which provider | a named entity | low | ✅ |
| `boolean` | is, can, should, do I need | `yes`, `you should`, `it isn't` | low | ✅ |
| `definition` | what is, define, explain | `is a`, `refers to`, `means` | low | — |

### D — Citation prediction (`predictCitations`)

Which pages would be quoted. A page can rank #1 and never be cited if its passage is not
usable; a page can rank #7 and be cited if it holds the one concrete fact the answer needs.
So citation = ranking **×** usability.

| Factor | Weight | Measures |
|---|---:|---|
| `queryMatch` | 0.30 | BM25, normalised across the candidate pool |
| `answerPresence` | 0.25 | `answered` = 1, `lexical` = 0.25, `none` = 0 |
| **`specificity`** | **0.20** | Concrete facts per 100 words, hedging as a multiplier |
| `extractability` | 0.15 | Self-contained, under a heading, sensible length |
| `freshness` | 0.10 | Recency, half-life 12 months for volatile types, 36 for stable |

`aiCrawlable === false` is a **hard gate to zero** — no quality compensates for being
absent from the index.

**Why specificity is weighted so heavily:** a model cites what it cannot generate itself.
Generic prose is exactly what it produces for free, so citing it adds nothing. A passage
containing `₱150,000–₱400,000, 6–8 weeks, 3 integrations` is irreplaceable. Specificity
density is the best available proxy for an LLM's preference — and it needs no LLM to compute.

### E — Weakness scoring (`scoreWeakness`)

```
weakness = severity × demand × winnability × durability / effort
```

| Term | Source | Why |
|---|---|---|
| `severity` | `(1 − answerRate) × 0.75 + (1 − bestSpecificity) × 0.25` | An answered field is still weak if its answers are thin |
| `demand` | autocomplete presence (0.6) + heading frequency (≤0.4) | An unasked question is worth less |
| `winnability` | can *you* supply this answer type? already covered → 0.1 | **The term that makes the ranking actionable rather than merely true** |
| `durability` | first-party fact → 1.0, else 0.6 | Your own price does not expire; a survey statistic does |
| `effort` | per answer type | Page edit vs original research |

`rankWeaknesses` drops anything you already answer, so a gap you have filled never becomes
a task. `forcesHedge` is true when **no** predicted citation answers — the strongest signal,
because an assistant is then forced to equivocate.

---

## 4. AIRS analysis update — end to end

How the new algorithm reshapes each existing stage.

### Evaluation

| Before | After |
|---|---|
| `primary_query` = one head term ("full stack web") | A **tracked query set**, expanded into sub-intents |
| Competitors = DuckDuckGo SERP scrape | Competitors = the **predicted (later, observed) citation set** |
| Own asset not stored | Own asset is `competitor_type: 'self'`, scored through the same pipeline, excluded from field prevalence |
| `rrs_score` = average competitor hygiene score | `rrs_score` stays a field diagnostic; **Citation Share** becomes the headline |

> **The single most important config change.** The reference evaluation had
> `primary_query = "full stack web"` — a *learning* query — so it found w3schools, Coursera
> and AWS docs, then correctly reported no exploitable gap. The site sells Done-For-You web
> apps to small businesses in ₱. No code change fixes a query pointed at the wrong intent.

### Coverage (shipped)

`GET /api/evaluations/[id]/analysis` runs demand → coverage → citation → weakness and
returns ranked weaknesses with evidence. Deterministic: same corpus, same findings.

Verdicts are **persisted** in the `coverage` table on every analysis run, making them
diffable week to week. `GET /api/evaluations/[id]/coverage` returns the full matrix.

The **coverage matrix UI** is at `/projects/[projectId]/evaluations/[id]/coverage` —
sub-intents down, sites across, color-coded (green = answered, yellow = lexical, red =
none). Rows expand to show evidence passages, gap evidence, and specificity scores.
Filters by gap level and answer type. Summary stats at the bottom count coverage gaps,
depth gaps, and fully answered questions.

### Findings

Findings are now **weaknesses with evidence**, alongside the hygiene checks:

| Before | After |
|---|---|
| "2 of 10 competitors lack Schema.org — add it for an edge" | "8 of 8 cited sources discuss timelines; **none states a timeframe**" |
| Fired on `.some()` — any single competitor's imperfection | Prevalence-gated: `gapRate ≥ 0.6` = opportunity, `≤ 0.2` = table stakes, middle band dropped |
| Impact hardcoded per indicator | Impact derived from prevalence, capped per indicator |
| No evidence | The failing passage, the missing answer type, the count |
| Hygiene-only | **Weakness-based findings** added: `generateWeaknessFindings()` writes AIRS-\<answerType\> findings, ranked by exploitability score |

The analysis endpoint now generates weakness-based findings and regenerates recommendations
automatically — the full pipeline flows: analysis → findings → recommendations → missions.

### Recommendations

Priority inherits `impact_level`, so prevalence-gating propagates for free. Weakness-based
findings now generate **typed action plans** — 8 templates keyed by answer type (money,
duration, count, steps, comparison, entity, boolean, definition), each with specific steps,
effort, and impact copy. These are deterministic scaffolds; the LLM-drafted content brief
(§below) is the one stage where generative AI earns its place.

### Missions

| Before | After |
|---|---|
| Tasks from hygiene findings | Tasks from ranked weaknesses, ordered by exploitability |
| Phase by hardcoded `impact_level` — all parity work landed in months 7–12 | `assignPhase`: opportunities pulled forward, parity work in its dimension's natural phase |
| Verified by re-checking markup | Verified by re-checking **whether the answer is now present** — same answer-type check |

Distribution on the reference project went from 7/4/13/2 to a balanced 6/6/6/2, all 20 tasks
auto-verifiable.

### Content briefs (shipped)

Each weakness emits a **content brief** — `src/lib/briefs.ts` generates per-weakness briefs
with:
- Target heading (question-shaped, matching the answer type)
- Required evidence format (e.g. "currency figure with symbol" for money)
- Extractability notes (how to make the passage self-contained)
- Draft template (fill-in-the-blank scaffold the user completes)

Briefs are persisted in `content_briefs` table and served at
`GET /api/evaluations/[id]/briefs`. UI at `/projects/[projectId]/evaluations/[id]/briefs`
with expandable cards, score breakdowns, copy-to-clipboard, and outcome loop controls.

### Benchmarks

| Before | After |
|---|---|
| `score_history` tracks competitor-average RRS drift | Track **Citation Share** per query × engine, plus per-question coverage over time |
| "Did our hygiene score go up" | "Are we now the cited source for question X" |

**Citation Share** is now the dashboard headline metric. `computeCitationShare()` in
`src/lib/ai-capture.ts` computes the fraction of tracked AI queries where the user's site
is cited, per engine and overall. Displayed as a hero section on the project dashboard
with a circular progress ring and per-engine breakdown.

### Outcome loop (shipped)

`outcomes` table: exploited weakness → shipped_at → later citation measurement.
`src/lib/outcomes.ts` implements `markBriefShipped()` (records citation baseline) and
`measureOutcome()` (compares after re-running AI capture). If citation_after >
citation_before, the brief is marked "verified". The briefs UI has ship/measure buttons
with status badges: pending → shipped → verified.

That closes the loop and lets the tool learn which weakness types actually pay off.

---

## 5. Data model

| Table | Status | Purpose |
|---|---|---|
| `page_content` | ✅ shipped | Per (competitor, url): title, headings, **sections**, main text, word count, `has_ordered_list`, `has_table`, publish/modify dates |
| `sub_intents` | ✅ shipped | Per evaluation: question, source, seed, locale, `is_question` |
| `competitors.competitor_type` | ✅ extended | Added `'self'` |
| `coverage` | ✅ shipped | Per (evaluation × competitor × question): level, score, term_coverage, specificity, passage, gap_evidence, scored_at. Diffable week to week. |
| `content_briefs` | ✅ shipped | Per weakness: target heading, required format, extractability notes, draft template, status (pending → shipped → verified) |
| `ai_queries` | ✅ shipped | Tracked queries per project × engine |
| `ai_answers` | ✅ shipped | Captured AI answer text, fan-out queries, engine, timestamp |
| `ai_citations` | ✅ shipped | Per answer: url, quoted passage, position, is_self flag |
| `outcomes` | ✅ shipped | Exploited weakness → shipped_at → citation_before → citation_after → measured_at |

> **Known debt:** `getDb()` runs `schema.sql` only on first connection, so adding a table
> requires a dev-server restart. Bit twice during this work. Needs a real migration step.

---

## 6. Accuracy — how it is measured

`src/lib/coverage.eval.test.ts` is a labeled benchmark across **unrelated industries**
(photography, dentistry, law, logistics, insurance, fitness, veterinary, events,
construction, accounting, SaaS, restaurant) chosen specifically to test that the
answer-type model generalises rather than memorising web-development vocabulary.

Current: **19/19 (100%)** — `answered` 11/11, `lexical` 6/6, `none` 2/2.

### Independent benchmark (held-out)

`src/lib/coverage.independent.test.ts` — 32 cases across 20 industries, authored
independently of the implementation. Baseline: 25/32 (78%). After evidence anchoring
and pageScope fixes: 30/32 (94%). After entity classification, entity subject
proximity, business-name filtering, structural comparison detection, and all-caps
acronym support: **32/32 (100%)** — `answered` 16/16, `lexical` 12/12, `none` 4/4.

Full suite: **57 tests passing.**

### Honest reading of that number

**100% on 19 cases I authored is weak evidence.** Same author wrote the fixtures and the
fixes, so overfitting is the obvious risk. The benchmark's real value was **finding bugs**
(§7) — those fixes generalise. The number itself is a regression guard, not proof.

Real accuracy requires **ground truth**: for ~20 sub-intents, what did an AI actually cite?
Capture once via Apify or an API, then calibrate the §D weights against it. Metric:
precision@5 / recall@5 of predicted vs actual citation set. Without that, we cannot say
whether we agree with real AI behaviour 40% or 85% of the time.

### What no deterministic algorithm will do

- **Paraphrase and implication.** *"Most engagements wrap inside a quarter"* answers a
  duration question; regex will not see it. Synonyms close common cases, not all.
- **Credibility.** It can tell you a figure is present, not whether it is trustworthy.
- **Writing the brief.** Detecting the gap is algorithmic; drafting the fix is not.
- **Observing real citations.** This *predicts* retrieval. A prediction is a model of the
  process and can drift from it.

---

## 7. Defect log — what real output taught the algorithm

Every filter and threshold above exists because of a specific observed failure. Kept
because it documents *why* the code is shaped this way.

| Symptom observed | Root cause | Fix |
|---|---|---|
| w3schools reported **510 headings** across 4 pages | Headings collected from whole document; boilerplate stripped only for body text | Collect from the pruned content root |
| Then w3schools dropped to **2 headings / 251 words** | Blanket class stripping deleted their content wrapper | Reverted to semantic tags + link-density filter |
| Benchmark scored **21%**, nearly all `none` | IDF degenerate on few passages — one absent term outweighed four present | Plain concept coverage, no IDF |
| A page stating `₱150,000` scored as not discussing cost | No stemming: `costs` ≠ `cost` | `stem()` |
| `photographer` ≠ `photography` | Light stemmer cannot unify these | 6-char prefix matching |
| `"Completed in 60 to 90 minutes"` not a timeframe | `minutes` missing from duration units | Added |
| Page titled *"Term Life vs Whole Life"* counted as delivering a comparison | Title matched the answer pattern | Answer evidence must come from **body**; headings are context only |
| Developer **salary** answered a project-cost question | Answer-type check context-blind | `DISTRACTOR_CONTEXT` + subject proximity |
| Course *"9 hours to complete"* answered a build-duration question | Same | Same |
| Pure-hedge passage scored **60** for specificity | `PROPER_NOUN` matched sentence-initial capitals ("Costs", "Typically") | De-capitalise sentence starts; hedging became a multiplier |
| All 10 analysed questions were **boilerplate** ("do not track", "did you find what you were looking for today?") | Heading harvest accepted anything question-shaped; ordering was alphabetical | `BOILERPLATE_QUESTION` + `PRODUCT_SELF_REFERENCE`; order by demand source |
| `"best online custom apparel"` passed topic relevance | Substring match — `"apparel"` contains `"app"` | Whole-word tokens; prefix only for stems ≥5 chars |
| `"…development company trivandrum"` survived | Filter needed `"company in"`; word threshold too high | `VENDOR_SHOPPING` + >5-word rule for non-questions |
| Gap evidence was a **framework glossary** for a pricing gap | Evidence picked the best *subject* match | `selectGapEvidence` on answer-dimension vocabulary |
| Then a **promo blurb** won | Raw hit count favours long passages | Density per 100 words |
| Then an **author bio** won | One incidental hit qualified | Require ≥2 hits and density ≥1 |
| Then a **cookie-vendor table** won ("Payment processing") | On-dimension but off-subject | Evidence must be on-subject *and* on-dimension |
| `definition` gaps always produced junk evidence | Its vocabulary (`is`, `are`, `what`) matches any prose | Return `null` for `definition` / `entity` |
| "Which backup platform do you use?" classified as `definition` | Entity pattern only matched `which (company\|agency\|developer\|provider\|tool)` — "platform" absent | Broadened to `which (…\|platform\|brand\|software\|system\|service\|product)` + `which … do you` |
| "Comfort Zone" in a warranty passage answered "which furnace brands" | Entity subject proximity disabled; pageScope union included page title "Furnace" so any entity match passed | Enable subject proximity for entity; use passage heading as scope, not all page headings |
| "Marisol Vega" in a heading didn't count as an entity answer | Entity evidence checked body only; heading excluded as non-answer text | For entity type, include heading in source text — a named person in a heading IS the answer |
| "Comfort Zone" (business name) still matched as entity | Entity match was the company name from the page title, not the asked-for entity | Filter: reject entity matches where the proper noun is the business name from the page title |
| "What is the difference between Essential and Complete?" scored `lexical` | No single passage had contrastive connectors; the contrast was structural (separate sections) | Structural comparison detection: 2+ passages from distinct sections matching different subjects = answered |
| All-caps product names (SIRIS, SaaS) missed by `PROPER_NOUN` | Pattern required `[A-Z][a-z]{2,}` — no all-caps acronyms | Added `\|[A-Z]{3,}\b` alternative to `PROPER_NOUN` |

---

## 8. Tuning reference

| Knob | File | Default | Effect |
|---|---|---:|---|
| `OPPORTUNITY_MIN_GAP` | `findings.ts` | 0.6 | Field share that must lack a thing for it to be an opportunity |
| `PARITY_MAX_GAP` | `findings.ts` | 0.2 | At or below, it is table stakes |
| `MIN_TERM_COVERAGE` | `coverage.ts` | 0.4 | Below this, the page is not about the question |
| `MIN_PREFIX_MATCH` | `coverage.ts` | 6 | Morphological match length |
| `WEIGHTS` | `citation.ts` | see §D | Citation factor weights — first thing to calibrate against ground truth |
| `EFFORT_BY_TYPE` | `citation.ts` | per type | Divisor in the weakness score |
| `MIN_PRIMARY_SET` | `findings.ts` | 3 | Below this many classified rivals, fall back to the full set |

---

## 9. Roadmap

**Done**
1. Content storage + self as a scored entity
2. Prevalence-gated weakness detection
3. Heading-anchored sections, relevance gate, stemming
4. Specificity scoring
5. Answer–subject proximity + distractor rejection
6. Citation prediction
7. Five-term weakness scoring
8. Demand discovery (keyless) + noise filters
9. `GET /api/evaluations/[id]/analysis`
10. **Persist `coverage`** — verdicts diffable week to week (`coverage` table, written on every analysis run)
11. **Coverage matrix UI** — sub-intents × sites, color-coded, expandable evidence (`/evaluations/[id]/coverage`)
12. **Weakness-based findings** — `generateWeaknessFindings()` writes AIRS-\<type\> findings; analysis auto-generates findings + recommendations
13. **Typed recommendation plans** — 8 answer-type-specific action plan templates with steps, effort, impact
14. **Content briefs** — per-weakness briefs with target heading, required format, extractability notes, draft template (`content_briefs` table, `src/lib/briefs.ts`)
15. **Ground truth + weight calibration** — `src/lib/calibration.ts` computes precision@5 / recall@5 vs real AI citations; `src/lib/ai-capture.ts` captures Claude answers with web search
16. **Citation Share** as dashboard headline — `computeCitationShare()` in `ai-capture.ts`; hero section on project dashboard with per-engine breakdown
17. **Outcome loop** — `src/lib/outcomes.ts` tracks shipped → citation gained; briefs UI has ship/measure buttons with status badges

**Deliberately deferred**
- Local embeddings (ONNX, offline, no key) — closes the paraphrase gap; the largest
  remaining free accuracy gain, but only worth it once ground truth exists to measure against
- Perplexity Sonar adapter — Claude adapter shipped; Perplexity and Google AI Overview adapters still needed for multi-engine Citation Share
- Google AI Overview adapter via Apify — third-party scrape, breakage risk
- Scheduled re-runs of tracked queries — outcome loop is manual today; needs a cron/scheduler
