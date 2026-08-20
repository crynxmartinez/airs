# AIRS — Roadmap (Combined Status)

**Generated 2026-08-08.** This merges [PLAN.md](PLAN.md) (the algorithm — what AIRS *is*) and
[BUILD-PLAN.md](BUILD-PLAN.md) (the business — what AIRS *does for me*) into one view of
what is done and what comes next. Every status below was verified against the code and the
live database, not copied from the older documents.

---

## The idea, in three sentences

When someone asks ChatGPT, Claude, Perplexity, or Google's AI about our client's topic, some
set of pages gets cited — those pages are the competition. AIRS finds where those cited
sources are **weak** (no price, no timeframe, no evidence, stale, wrong format) and produces
**actionable work** — content briefs, rewritten headings, schema — so the client's page
becomes the better answer. The headline metric is **Citation Share**: what fraction of AI
answers cite us.

---

## Database reality check (2026-08-08)

| Table | Rows | Meaning |
|---|---|---|
| projects | 15 | |
| evaluations | 14 | |
| competitors | 127 | |
| page_content | 352 | Crawled corpus |
| sub_intents | 1,232 | Demand questions |
| coverage | 2,752 | Question × competitor verdicts |
| coverage_runs | 33 | Append-only history — diffing works |
| content_briefs | 92 | |
| findings / recommendations | 240 / 240 | |
| **ai_answers** | **8** | AI capture is live |
| **ai_citations** | **190** | Real observed citations |
| citation_snapshots | 5 | Citation share tracked over time |
| score_history | 10 | Multi-score benchmark snapshots |
| outcomes | 1 | Loop started, barely used |
| **gmb_audits / gmb_businesses** | **0 / 0** | GMB pipeline never executed |

---

## What is DONE — verified

### Core engine (deterministic, no LLM in the analysis path)

| Piece | Where | State |
|---|---|---|
| Scoring: RRS + 7 dimensions, self excluded from field | `src/lib/scoring.ts` | ✅ Validated |
| Prevalence-gated weakness detection (≥0.6 gap = opportunity) | `src/lib/findings.ts` | ✅ Validated |
| Coverage engine: answer-type classification, BM25 retrieval, specificity | `src/lib/coverage.ts` | ✅ Validated (held-out benchmark 100%) |
| Document-scoped coverage — scope leak closed | `src/lib/coverage.ts` | ✅ Validated |
| Coverage history + month-over-month diff (engine-version stamped) | `src/lib/progress.ts`, `coverage_runs` | ✅ Validated, 13 tests |
| Citation prediction + exploitability ranking | `src/lib/citation.ts` | ✅ Calibrated (see below) |
| Content briefs, 8 answer types | `src/lib/briefs.ts`, `src/lib/brief-format.ts` | ✅ Fixed |
| GEO / AI-crawler robots analysis | `src/lib/geo.ts` | ✅ Validated (caught Clayton blocking every AI crawler) |

### Phase 0 — Unblock AI capture ✅ DONE (2026-08-07)

All eight checklist items landed: `ANTHROPIC_API_KEY` set, `claude-opus-5`,
`max_tokens: 16000`, `web_search_20260209`, `max_uses: 12`, refusal handling,
server-side fallbacks, smoke-tested. `ai_answers = 8` — the done-when condition holds.

### Phase 0.5 — Crawlability default-on ✅ DONE

The robots check is now **on by default and covers the client's own site**
(`?robots=0` to skip). The bug that scored Clayton 86/gold while they blocked every AI
crawler is fixed. Section 0 of the free audit ships.

### Phase 1-pre — Commercial-intent + region filter ✅ DONE

`demand.ts` now classifies `buying | evaluating | learning | career | general` and filters
career/salary questions on transactional evaluations, plus geo-conflict detection
(`geoConflict` in `search.ts` catches "…in california" on an Australian client). Tested in
`demand.intent.test.ts`.

### Phase 1 — Ground truth / calibration ✅ DONE (1 query) ⚠️ needs volume

```
precision@5 = 1.00   base rate 0.79   LIFT +0.21   (Clayton, 1 query)
```

Cover language ships as **observed**. The honest number is the lift.
**Remaining:** capture 15–20 queries before quoting externally. Currently at 7 queries / 8 answers.

### Phase D fixes ✅ DONE

- `extractSubject` replaced — heading logic moved to `brief-format.ts` using `subjectTerms()`
  from coverage (the same function the engine judges with). Unit-tested in `briefs.test.ts`.
- Wrong-intent questions fixed by Phase 1-pre above.

### Phase E — Outcome loop ✅ CLOSED (code), ⚠️ barely used

`verify-brief.ts` makes `verified` reachable: re-crawl the shipped URL, re-run
`assessDocuments` for the brief's question — the definition of *done* is byte-identical to
the definition of the *gap*. `outcomes = 1` — the loop has run once.

### Phase 2 — The deliverable ✅ DONE

`src/lib/export.ts` renders Tier 1 (top-3 fixes, deliberately incomplete) and Tier 2 (full
gap list + briefs) as unbranded Markdown. Every claim traces to a `coverage` or `evidence`
row; absence is stated, not hidden.

### Phase 3 — Scale runner ✅ DONE

`npm run audit -- --url <site> --query "<q>" --location <geo> --tier <1|2>` and batch mode
via `--csv`. Orchestrates the existing HTTP routes; failures logged per target, run continues.

### Infrastructure

- **`node:sqlite` migration** — `better-sqlite3`'s unsigned binary was intermittently blocked
  by Windows Application Control (`ERR_DLOPEN_FAILED` → every route 500s → app looks empty).
  Node's built-in driver cannot be blocked. Same `airs.db`.
- **Benchmarks rebuilt** — multi-score history (RRS/GEO/GMB/Composite), citation-share chart,
  mission overlay, outcome summary. Snapshots auto-record on score/scan/capture.
- **Dashboards redesigned** — composite scores, charts, activity feeds, Citation Share hero.
- **Test suite** — `npm test`, 10+ test files across coverage, briefs, citation, demand,
  indicators, progress, prose, search.

---

## What is NOT done — the gap list

### Blocking money (do first)

| # | Item | From | Effort | Why it's next |
|---|---|---|---|---|
| 1 | **Capture 15–20 queries** on the reference client | BUILD Phase 1 | ~$2–8 API spend + an hour | The calibration number is real on 1 query and quotable on 15. Everything external cites it. |
| 2 | **Phase 1.5 — differentiation test** | BUILD Phase 1.5 | 1 hour | Run HubSpot/Ahrefs/Semrush free checkers on Clayton side-by-side with AIRS output. Until done, "nobody else quotes the failing passage" is believed, not proven. |
| 3 | **Assemble 2–3 audits by hand and send them free** | BUILD Rules #3 | Weeks 1–2 | Manual assembly tells you what the export should contain. Sales motion, not code. |

### Product debt (visible in output quality)

| # | Item | From | Detail |
|---|---|---|---|
| 4 | Corpus intent gating | PLAN Phase C | `search_intent = transactional` with 9/10 `informational` competitors — both facts stored, nothing gates on them. Scoring an agency against education publishers points advice the wrong way. |
| 5 | Crawler misses | PLAN backlog | 3 of 10 Clayton competitors crawled to 0 pages; self stored 1 of 4. Find whether content-root or link-density filter rejects them. |
| 6 | IDF weighting for subject terms | PLAN backlog | A privacy policy was selected as gap evidence because every page ties on unweighted terms. |
| 7 | Outcome loop in the workflow | BUILD Phase 5 | `markBriefShipped()` + `verifyBrief()` exist; wire them into the monthly retainer routine so every month records baseline → verify. This is the moat and the churn defence. |

### Coverage & Briefs UX (planned earlier, not started)

| # | Item | Effort |
|---|---|---|
| 8 | Briefs page: sort (score/demand/effort) + status filter | small |
| 9 | Briefs page: "Measure/Verify" button on shipped briefs + outcome summary card | small |
| 10 | Printable coverage report + briefs report (ReportShell) | medium |
| 11 | Coverage trend display from `coverage_runs` (gaps closed since last run) | small |

*Tool-not-platform check: 8–11 only matter if the operator (you) uses these pages weekly.
If the Markdown export is the real interface, skip them.*

### Deferred (do not build until asked)

- Perplexity + Google AI Overview adapters — one engine sells fine
- Scheduled re-runs — manual until Tier 3 volume demands it
- **GMB / Maps via Apify** (BUILD Phase 4) — `gmb_audits = 0`, never executed. Sell
  professional-services/B2B only until Phase 3 outreach is clean, then validate on one real
  business and measure Apify cost per run
- Auth, deployment, SSRF allowlist — single user, localhost only
- Dashboard polish beyond what exists — nobody looks at your dashboard

### Housekeeping (cosmetic, batch when idle)

- `better-sqlite3` + `@types/better-sqlite3` still in `package.json` — remove (code uses `node:sqlite`)
- `crawlee` dependency never imported — remove
- `prisma/` holds raw SQL, no Prisma — rename or leave
- README is create-next-app boilerplate
- `generateId()` uses `Math.random()` — `crypto.randomUUID()` is a drop-in

---

## The sequence — what to do next, in order

| When | What | Done-when |
|---|---|---|
| **Next session** | Capture 15–20 queries on Clayton (batch via ai-capture; ~$0.13–0.48 each) | `ai_queries ≥ 15`, calibration re-run, lift quoted from ≥15 queries |
| Same day (+1 hr) | Phase 1.5 differentiation test — 4 free checkers vs AIRS output | One written sentence naming what AIRS produces that none of them do |
| This week | Hand-assemble 2–3 free Tier 1 audits from real prospects, send unsolicited | Replies exist (or don't — that's signal too) |
| Next build day | Corpus intent gating (#4) + crawler misses (#5) | Reference evaluation scores against contestable rivals only |
| When first retainer signs | Wire outcome loop into monthly routine (#7) | Every retainer month records baseline → shipped → verified |
| Only if operating the UI weekly | Coverage/briefs UX (#8–11) | — |

**The one rule that overrides the sequence:** no more engine work until audits have been
sent. The engine is validated; the corpus, the claim set, and the sales motion are not.

---

## The four gates (unchanged, for reference)

| Gate | Requirement | Status |
|---|---|---|
| 0 — Crawlable | AI crawlers allowed in robots.txt | ✅ default-on, covers self |
| 1 — Retrieved | Findable for the fan-out sub-queries | ✅ observed fan-out captured |
| 2 — Quotable | Self-contained answer under a question-shaped heading | ✅ coverage engine |
| 3 — Preferred | A number, date, source the model can't generate itself | ✅ briefs target this |

## Tier structure (unchanged)

| Tier | Price | State |
|---|---|---|
| 1 — Visibility Snapshot | FREE (lead magnet) | ✅ export renders it; runner batches it |
| 2 — Asset Package | $750–900 | ✅ export renders it |
| 3 — Monthly Retainer | $997/mo | Machinery ready (re-run + diff + verify); needs first client |
