# AIRS — Build Plan

## What AIRS is for

**Find where the sources an AI assistant cites are weak, then make our page the better answer.**

AIRS is an AI-search visibility tool, not a classic SEO auditor. The unit of competition is
not a ranking position — it is a **citation**. When someone asks ChatGPT, Google's AI Overview,
Perplexity, or Claude about our topic, some set of pages gets pulled in and quoted. Those pages
are the competition. Their blind spots are the opportunity.

### The four gates to being in an AI answer

Failing an earlier gate makes the later ones irrelevant.

| Gate | Requirement | Where AIRS measures it |
|---|---|---|
| **0 — Crawlable** | AI crawlers allowed: `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended` | `src/lib/geo.ts` (built) |
| **1 — Retrieved** | Findable for the *fan-out sub-queries* the assistant actually issues, not the head term | Phase B |
| **2 — Quotable** | A self-contained answer passage under a question-shaped heading — retrieval is chunk-level | Phase A (headings + text), Phase C |
| **3 — Preferred** | Gives the model something it cannot generate itself: a number, a date, a named source, original data | Phase C–D |

Gate 3 is the competitive game. The original 20 hygiene indicators (schema, viewport, canonical,
alt text) all live at Gate 2 and below — necessary, never sufficient.

### Weakness = unmet demand, read off the AI's own answer

The AI's hedging reveals what its sources lack. If every answer to "what does X cost" says
*"costs vary depending on scope"*, that hedge exists because **no cited source publishes a number**.

| Signal in the AI answer | What it means | The move |
|---|---|---|
| Hedge — "varies", "it depends" | No cited source has specifics | Publish the specifics |
| Unanswered sub-question | Nothing in the index covers it | First-mover |
| Stale citations on a moving topic | Field hasn't updated | Publish current, explicitly dated |
| Single-source dominance | Fragile monopoly | Become the second source |
| Every source says the same generic thing | Nobody has first-hand data | Original research |
| Answer wants a table, sources give prose | Format gap | Publish the table |

### Weakness tiers, by exploitability

1. **Coverage gap** — nobody answers this sub-intent
2. **Depth gap** — answered, but without specifics
3. **Evidence gap** — asserted without proof
4. **Freshness gap** — stale on a moving topic
5. **Format gap** — served in the wrong shape
6. **Extractability gap** — not quotable by a retriever ← *the original indicator set*

### Exploitability score

```
exploitability = prevalence × demand × winnability / effort
```

- **prevalence** — fraction of the field with the gap *(shipped)*
- **demand** — was this sub-question actually issued during fan-out
- **winnability** — can we credibly be better here
- **effort** — page edit vs. original research

### The headline metric: Citation Share

Across tracked queries × engines, what fraction of AI answers cite us? It is directly
measurable, it moves when we do the work, and it is what users care about.
RRS becomes a diagnostic, not the headline.

---

## Status

**Three states, not one.** "Shipped" used to mean the code landed, which is how a
coverage engine with a scope leak and an outcome loop whose `verified` status was
unreachable both sat here marked ✅ for weeks. The commercial claims in
[BUILD-PLAN.md](BUILD-PLAN.md) — evidence over scores, reproducibility, month-over-month
diffing — are only true at **Validated**.

| State | Means |
|---|---|
| **Written** | The code exists and typechecks |
| **Runs** | It executes end to end on real data without erroring |
| **Validated** | Its output has been checked against reality and is correct |

| Phase | Written | Runs | Validated | Note |
|---|:---:|:---:|:---:|---|
| Foundation, scoring, findings, reports, missions | ✅ | ✅ | ✅ | |
| GEO / AI-crawler robots analysis (`src/lib/geo.ts`) | ✅ | ✅ | ✅ | Correctly caught Clayton blocking every AI crawler |
| Crawler (multi-page, robots-aware, shared extraction) | ✅ | ✅ | ⚠️ | 3 of 10 Clayton competitors returned 0 pages; self stored 1 of 4 crawled |
| Prevalence-gated weakness detection | ✅ | ✅ | ✅ | |
| **Phase A — content storage + self as scored entity** | ✅ | ✅ | ✅ | Self crawl verified on Clayton |
| **Phase B — AI answer capture** | ✅ | ✅ | ✅ | Live 2026-08-07 on Opus 5 + `web_search_20260209`: 53 retrieved sources, 8 fan-out queries per capture. Calibration precision@5 **0.80** |
| **Phase C — coverage mapping** | ✅ | ✅ | ⚠️ | Engine validated (32-case held-out set at 100%); the *corpus* is not — it scores against `informational` competitors on a `transactional` evaluation |
| **Phase D — exploitability + briefs** | ✅ | ✅ | ❌ | 3 of 4 money briefs ship malformed headings; questions are career/salary, not buyer intent |
| **Phase E — outcome loop** | ✅ | ⚠️ | ❌ | `verified` status is unreachable in code — nothing ever sets it |
| GMB / Maps analysis via Apify | ✅ | ❌ | ❌ | `gmb_audits = 0`, `gmb_businesses = 0` — never executed. See BUILD-PLAN Phase 4 |
| **Coverage history + progress diff** | ✅ | ✅ | ✅ | Append-only runs, engine-version stamped, 13 tests |
| **Document-scoped coverage** | ✅ | ✅ | ✅ | Closed the scope leak; both benchmarks at 100% |

**The two that block money:** Phase B blocks every claim that starts "what AI assistants
actually answer" — that is Tier 1's first section. Phase D blocks Tier 2, which is the
thing being sold.

---

## Validated: prevalence-gated weakness detection

Findings previously fired when **any single** competitor lacked a feature, so "1 of 10 competitors
don't display pricing" became a high-priority differentiator. Every finding was an "opportunity"
and none represented a majority gap.

Now a gap is classified by how much of the field shares it:

| Gap rate | Class | Impact |
|---|---|---|
| ≥ 0.8 | `opportunity` — near-universal weakness | high |
| ≥ 0.6 | `opportunity` — majority weakness | medium |
| 0.2–0.6 | **dropped** — mixed field, no edge | — |
| ≤ 0.2 | `gap` — table stakes | low |

Impact is derived from prevalence and capped per indicator. Analysis is scoped to
`direct`/`functional`/`platform` competitors, falling back to the full set (with a UI banner)
when fewer than 3 are classified. Added the two missing weakness checks — reviews (TA-03) and
contact (TA-02) — which had recommendation plans that nothing could trigger.

Tuning knob: `OPPORTUNITY_MIN_GAP` in `src/lib/findings.ts`.

---

## Validated: Phase A — content storage + self as scored entity

**The blocker it removed.** `evidence` stores aggregate indicator values (`"6612"`, `"true"`).
No amount of that answers "does this page address question X". Coverage analysis needs the text.

| Change | Where |
|---|---|
| `page_content` table — headings JSON, main text, word count, published/modified dates | `prisma/schema.sql` |
| `extractContent()` — heading outline, boilerplate-stripped body, schema.org/meta date signals | `src/lib/indicators.ts` |
| Crawler returns per-page content | `src/lib/crawler.ts` |
| Crawl + scrape routes persist it (replace, not append) | `api/evaluations/[id]/crawl`, `api/scrape` |
| Own asset as `competitor_type: 'self'`, scored through the same pipeline | `api/evaluations/[id]/self` |
| Self excluded from prevalence field | `src/lib/findings.ts` |
| Self excluded from `rrs_score` and score history | `src/lib/scoring.ts` |

The self asset matters twice: it stops the system recommending work already done, and it gives
the first honest "how do we compare" number. On the reference evaluation the field averages 87
while the site itself scores 64.

---

## Validated: Phase B — AI answer capture

Replaces DuckDuckGo SERP scraping as the source of competitors. Real AI answers captured
and stored for calibration and Citation Share.

| # | Task | Status |
|---|---|---|
| 1 | `ai_queries` table — tracked queries per project | ✅ |
| 2 | `ai_answers` table — engine, answer text, captured_at, fan-out queries | ✅ |
| 3 | `ai_citations` table — url, quoted passage, position, whether it is us | ✅ |
| 4 | Claude engine adapter — `claude-opus-4` + `web_search_20250305` | ✅ `src/lib/ai-capture.ts` |
| 5 | Perplexity engine adapter — Sonar API | ⬜ Deferred |
| 6 | Google AI Overview adapter — Apify | ⬜ Deferred |
| 7 | Sub-intents derived from observed fan-out queries | ✅ Fan-out queries stored in `ai_answers` |
| 8 | UI: "What AI says about your topic" | ⬜ Deferred (data layer ready) |

**Written, not running.** `POST /api/evaluations/[id]/ai-capture` captures a Claude answer
with web search, persists the answer text, fan-out queries, and all citations with `is_self`
flagging. `GET /api/evaluations/[id]/ai-capture` returns Citation Share for the project.

**Working since 2026-08-07.** A capture returns the visible answer, every retrieved source,
and the assistant's own fan-out sub-queries — the last being the most valuable output, since
it is observed evidence of how an assistant decomposes a question rather than the
autocomplete-derived guesses in `demand.ts`.

Three extractor bugs had to be fixed before any of it surfaced. All three returned zero
against a response carrying 53 sources: two read `block.tool` where the field is `block.name`,
and the third expected search results on the `server_tool_use` block when they arrive
separately in `web_search_tool_result.content`. With `web_search_20260209` the model drives
search from inside code execution, so most `server_tool_use` blocks are `code_execution`
carrying Python, not a query.

**What was blocking it, for the record:**

| Blocker | Detail |
|---|---|
| No credential | `.env.local` holds `APIFY_TOKEN` and `OPENAI_API_KEY`; no `ANTHROPIC_API_KEY` |
| Retired model | `CLAUDE_MODEL = "claude-opus-4-20250514"` retired **2026-06-15** — the call 404s. The doc comment in the same file already claims `claude-opus-5` |
| Stale tool + budget | `web_search_20250305` (use `web_search_20260209` on Opus 5); `max_tokens: 4096` truncates, because Opus 5 thinks by default and `max_tokens` caps thinking *plus* response |

One more, not in the original plan: **Opus 5 can decline a request with HTTP 200 and
`stop_reason: "refusal"`.** The parser reads content blocks unconditionally and will break
on that path. Handle the refusal, and opt into server-side `fallbacks` so a decline
re-runs on Opus 4.8 instead of failing.

---

## Runs: Phase C — coverage mapping (engine validated, corpus not)

| # | Task | Status |
|---|---|---|
| 1 | `coverage` table: (competitor × sub_intent) → level, score, term_coverage, specificity, passage, gap_evidence, scored_at | ✅ |
| 2 | Crawl the **cited** URLs rather than SERP results | ✅ Existing crawler + analysis endpoint |
| 3 | Deterministic coverage grading (no LLM call needed) | ✅ `src/lib/coverage.ts` |
| 4 | Weakness computation over the coverage matrix, reusing prevalence gating | ✅ `src/lib/citation.ts` → `scoreWeakness` |
| 5 | Coverage matrix UI: sub-intents down, competitors across, gaps highlighted | ✅ `/projects/[projectId]/evaluations/[id]/coverage` |
| 6 | Sitemap-driven page discovery prioritized by sub-intent match | ⬜ Deferred |

**Shipped:** Coverage verdicts persisted on every analysis run. Matrix UI with color-coded
cells (green/yellow/red), expandable rows showing evidence passages, filters by gap level
and answer type, and summary stats. API at `GET /api/evaluations/[id]/coverage`.

**Also written:** Calibration against ground truth — `src/lib/calibration.ts` computes
precision@5 / recall@5 of predicted vs actual AI citations, with weight adjustment
suggestions. API at `GET /api/evaluations/[id]/calibration`. **Never run** — it needs
observed citations, which need Phase B.

**The engine is validated; the corpus is not.** The held-out benchmark sits at 100% (32
cases, 20 industries), but on the reference evaluation the field it scores against is nine
`informational` publishers on an evaluation whose `search_intent` is `transactional`. Both
facts are already in the database and nothing gates on them. Scoring an agency against
education publishers produces well-evidenced advice pointing the wrong direction.

---

## Runs: Phase D — exploitability + briefs (output not yet correct)

| # | Task | Status |
|---|---|---|
| 1 | Exploitability scoring: prevalence × demand × winnability / effort | ✅ `src/lib/citation.ts` → `scoreWeakness` |
| 2 | Ranked attack list replacing the flat findings list | ✅ `generateWeaknessFindings()` in `src/lib/findings.ts` |
| 3 | Content-brief generation per weakness: target question, angle, format, required evidence, extractability requirements | ✅ `src/lib/briefs.ts` |
| 4 | Missions built from briefs instead of hygiene checklists | ✅ Analysis auto-generates findings → recommendations |

**Written and running; output is not yet correct** — see the two defects below. 8
answer-type-specific action plan templates in `src/lib/recommendations.ts`
(money, duration, count, steps, comparison, entity, boolean, definition), each with concrete
steps, effort level, and impact copy. Content briefs include target heading, required
evidence format, extractability notes, and a fill-in-the-blank draft template. UI at
`/projects/[projectId]/evaluations/[id]/briefs` with expandable cards and copy-to-clipboard.

**Two defects, both visible in shipped output:**

1. **`extractSubject` produces malformed headings.** The 20-step `.replace()` chain is
   order-dependent, and 3 of 4 money briefs on the reference evaluation came out as
   *"How much does **how much to learn** full stack web development cost?"* and
   *"How much does commercial insurance agents make in california **cost?**"*. Fix: delete it
   and use `subjectTerms()` from `coverage.ts` — already unit-tested, and it is the same
   function the engine uses to reach its verdict.
2. **The questions are wrong.** Demand discovery returns career and salary queries
   (*"how do i become a commercial insurance broker"*), so the briefs tell a services
   business to publish competitor salary data. Needs a commercial-intent filter over
   sub-intents, gated on the evaluation's `search_intent`.

---

## Written: Phase E — outcome loop (does not close)

| # | Task | Status |
|---|---|---|
| 1 | `outcomes` table: exploited weakness → shipped_at → later citation/visibility measurement | ✅ |
| 2 | Re-run tracked queries on a schedule; diff the citation set | ⬜ Manual today; needs scheduler |
| 3 | Citation Share as the dashboard headline | ✅ Hero section on project dashboard |
| 4 | Learn which weakness types pay off per market | ✅ `getOutcomeSummary()` in `src/lib/outcomes.ts` |

**Written; the loop does not close.** `src/lib/outcomes.ts` implements `markBriefShipped()`
(records citation baseline), `measureOutcome()` (compares after re-running AI capture), and
`getOutcomes()` / `getOutcomeSummary()`. Briefs UI has ship/measure buttons with status
badges: pending → shipped → verified.

**`verified` is unreachable in code — nothing sets it.** The UI can reach `shipped` and stops
there. Closing it means re-crawling the shipped URL and re-running `assessDocuments` for the
brief's question: `answered` → verified, still `lexical` → hold with the reason. That makes
the definition of *done* byte-identical to the definition of the *gap*, and it is also what
fills `outcomes.verdict_before/after` for the attribution chain. Blocked on Phase B either
way, since `measureOutcome()` re-runs AI capture. Citation Share displayed as dashboard hero with circular
progress ring and per-engine breakdown. API at `GET/POST /api/evaluations/[id]/outcomes`.

---

## Backlog / debt

- `crawlee` is a dependency but never imported — the crawler is hand-rolled fetch + cheerio + playwright
- `prisma/` holds raw SQL and no Prisma — rename or adopt
- README is still create-next-app boilerplate
- No auth, and `/api/scrape` + `/api/crawl` fetch arbitrary user-supplied URLs — localhost only; needs an allowlist before any deployment ([BUILD-PLAN](BUILD-PLAN.md) explicitly de-scopes this while single-user)
- Ad-hoc `ALTER TABLE` migrations inside `getDb()` will drift. One ordering trap already hit: `schema.sql` runs *before* the column migrations, so any index in `schema.sql` referencing a newly-added column fails with "no such column" on an existing database. Run-scoped coverage indexes are created in `db.ts` after the ALTERs for exactly this reason
- `generateId()` uses `Math.random()`; `crypto.randomUUID()` is a drop-in
- 3 of 10 Clayton competitors crawled to 0 pages; the self site stored 1 of 4 pages crawled. Worth finding out whether the content-root or link-density filter is rejecting them
- Subject terms are unweighted, so on a site where every page mentions the topic (`web`, `development`) any document ties and the tie-break is arbitrary — a **privacy policy** was selected as gap evidence. Needs IDF weighting across the site's own crawled pages

## Tech stack

| Component | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TailwindCSS 4 |
| Charts | Recharts |
| Database | SQLite via `node:sqlite` (Node's built-in driver) |
| Crawling | fetch + Cheerio, Playwright fallback, robots-aware |
| Maps data | Apify |
| AI answers | Claude (`claude-opus-5` + `web_search_20260209`) — **not yet running**, see Phase B. Perplexity Sonar and Apify AI Overviews deferred |
| Tests | `node --test` (`npm test`) |

`better-sqlite3` was replaced because its prebuilt binary is unsigned, and Windows Smart App
Control blocks it intermittently with `ERR_DLOPEN_FAILED`. When that fires every route
returns 500 and the app looks empty — indistinguishable from having no data. `node:sqlite`
is compiled into the signed Node binary and cannot be blocked. Same file, same SQL, same
`airs.db`. Requires `@types/node` ≥ 22.
