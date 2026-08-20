# AIRS — Build Plan to First Deliverable

**This is not [PLAN.md](PLAN.md).** That document tracks the algorithm — what AIRS *is*. This one tracks the shortest path to AIRS earning money — what AIRS *does for me*.

**I am the only user.** Nobody logs in. AIRS runs on my laptop, I operate it, a Markdown file comes out. That single constraint removes auth, deployment, multi-tenancy, and the SSRF allowlist from scope — see [Do Not Build](#do-not-build).

**AIRS is not the product.** It is the machine that makes my labor cheap. The product is a document and a retainer.

---

## Market reality — verified August 2026

Read this before pricing anything.

| Fact | Consequence for me |
|---|---|
| Profound: $96M Series C at **$1B valuation**, $155M+ total, 700+ enterprises ([Fortune](https://fortune.com/2026/02/24/exclusive-as-ai-threatens-search-profound-raises-96-million-to-help-brands-stay-visible)) | I am not building a competing platform. Ever. |
| Peec AI: **$10M ARR in 16 months**, ~$241/mo agency tier ([Peec](https://peec.ai/blog/we-raised-21m-series-a-to-help-brands-win-in-ai-search)) | Agencies **do** pay recurring for this category. Tier 3 is validated demand. |
| Adobe acquired Semrush for **$1.9B**, closed April 2026. AI Visibility Toolkit $99/mo ([SEJ](https://www.searchenginejournal.com/adobe-to-acquire-semrush-in-1-9-billion-cash-deal/561438/)) | The tool my prospects already log into now ships AI visibility. |
| Free AI visibility checkers from **HubSpot, Ahrefs, Semrush**, plus Omnia, GoVISIBLE, SolCrys, Birdeye | **The diagnosis retails at $0.** I cannot sell it. |
| E2M: 350 staff, **1,100+ agency clients**, white-label GEO ([Clutch](https://clutch.co/profile/e2m-solutions)). White Label IQ ships a near-identical audit spec | I am late to this channel and 100× smaller. |

**No monopoly exists** — 15+ funded platforms, no dominant share, no network effects, no antitrust coverage of the category. The threat is commoditization, not a gatekeeper.

**What survives:** free tools produce *scores*. They do not write your FAQ block, your schema, or your rewritten H2s. My cost to produce an asset package is ~30 minutes at Philippine cost base with zero overhead. E2M carries 350 salaries. I can't take the market. I can take $5k/mo out of it without anyone noticing I exist.

**Realistic ceiling: four agency relationships.** Plan for four. "The AI visibility partner for agencies" is not available to me.

---

## What AIRS actually has that the funded players don't

Measured against Profound, Peec, Scrunch, Semrush, Ahrefs, and the free checkers. Ranked by commercial weight, not technical interest.

### 1. Near-zero marginal cost per audit — this is the real one

The analysis layer runs **without an LLM**. `predictCitations`, `coverage`, `scoreWeakness` are BM25, stemming, and answer-type classification — deterministic ([AIRS-ANALYSIS.md:20](AIRS-ANALYSIS.md:20)). The only paid call in the pipeline is capture.

Every funded competitor burns inference on every prompt × every engine × every customer, every month. That cost structure forces them into seat pricing and prompt quotas. Mine doesn't.

**What this buys me that money can't:** the free checkers are self-serve — the prospect has to go find them and run one. I can run twenty *bespoke* audits on an agency's actual client roster, unsolicited, before breakfast, for pennies. Nobody with a per-prompt cost structure can afford to do that as outbound. This is the entire outreach motion, and it exists because of an architecture decision, not a budget.

### 2. Evidence, where everyone else ships a score

Every finding carries the failing passage. `selectGapEvidence` returns `null` when nothing qualifies rather than reaching for the nearest plausible quote ([AIRS-ANALYSIS.md:120](AIRS-ANALYSIS.md:120)) — it refuses to fabricate. An agency can hand my report to their client and every sentence survives being checked.

"Your visibility score is 34" cannot be argued with or acted on. "8 of 8 cited sources discuss timelines; none states a timeframe — here's the passage where each stops short" can be verified in thirty seconds and fixed in an hour.

### 3. It outputs work, not information

`BRIEF_SPECS` produces target heading, required evidence format, extractability notes, and a fill-in draft, per answer type ([src/lib/briefs.ts](src/lib/briefs.ts)). Free tools tell you that you're invisible. Monitoring platforms tell you how invisible. AIRS tells you what to write.

That's the labor layer, and labor is the part of this market that commoditization hasn't reached.

### 4. Reproducibility

Same corpus, same findings — the analysis endpoint is deterministic. I can re-run a client's audit six months later and the diff is real signal, not model drift. Every competitor built on live LLM sampling has an answer that wobbles between runs, which makes month-over-month comparison unreliable.

This is what makes Tier 3 defensible: I can prove movement.

### 5. The defect log

26 observed failures, each with root cause and fix ([AIRS-ANALYSIS.md:343](AIRS-ANALYSIS.md:343)). Not a feature — evidence the thing has been beaten against real output. Most competitor accuracy claims are unfalsifiable marketing.

### 6. 100% margin

The white-label reseller programs I found run 15–45% wholesale discounts — those operators resell someone else's platform. I own the stack. No seat cost, no per-query cost, no vendor who can reprice me.

### Honest weaknesses — do not pitch around these

| Weakness | Status |
|---|---|
| ~~Zero external validation~~ | **Partly resolved 2026-08-07: precision@5 = 1.00, base rate 0.79, lift +0.21, on one query.** Quote the lift. Still one query — capture 15–20 before using it externally. The held-out benchmark (32 cases, 100%) remains self-authored and is a separate claim |
| Query set is mis-targeted | Demand discovery returns career/salary questions on a transactional evaluation. Poisons Phase 1's calibration queries and Tier 2's briefs alike. **Phase 1-pre fixes this** |
| Corpus intent is ungated | `search_intent` is `transactional` and 9 of 10 competitors are classified `informational`; nothing gates on either, though both are already stored |
| Single engine (Claude only) | Perplexity and Google AI Overview adapters deferred |
| Local businesses untested | `gmb_audits = 0`. **Phase 4.** |
| Can't read paraphrase or implication | Structural limit of the deterministic approach — my own doc says so ([AIRS-ANALYSIS.md:332](AIRS-ANALYSIS.md:332)) |
| No brand, no case studies, no outcome data | **Phase 5** is the only fix, and it takes months |
| Differentiation unconfirmed | **Phase 1.5.** Until then, strengths 2 and 3 are believed, not proven |

---

## The three tiers

### Tier 1 — Visibility Snapshot · **FREE**

The lead magnet, not a SKU. It was priced at $350–500 in the first draft of this plan; that was wrong, because HubSpot and Ahrefs give it away.

| Section | Source |
|---|---|
| **0. Can AI read your site at all?** | `src/lib/geo.ts` — robots.txt vs `GPTBot`, `OAI-SearchBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended` |
| What AI assistants answer today | `ai_answers.answer_text`, `ai_citations` — verbatim, per query |
| Where the cited sources are weak | `coverage` + `scoreWeakness()` — question, gap rate, the quoted passage where the field approaches the dimension and stops short |
| Three highest-value fixes | Top 3 ranked weaknesses only. **Deliberately incomplete.** |

Run **unsolicited** on an agency's real client, unbranded, no pitch. Costs ~20 minutes and nothing competitively, since the diagnosis is free everywhere anyway. Its job is to make the next conversation happen.

### Section 0 is the strongest cold opener, and it needs no API key

Found on the reference client while debugging something else — `claytoninsurancebrokers.com.au`:

```
User-agent: ClaudeBot        Disallow: /
User-agent: GPTBot           Disallow: /
User-agent: Google-Extended  Disallow: /
User-agent: CCBot            Disallow: /
User-agent: anthropic-ai     Disallow: /
User-agent: Claude-Web       Disallow: /
Content-Signal: ai-train=no
```

Two sources: a Cloudflare "Managed Content" block plus a second set in their WordPress
robots.txt. **Gate 0 — Crawlable — failing outright.** No content they publish can be cited
by ChatGPT, Claude, or Google AI Overviews, regardless of quality.

Why this leads the report:

- **It is binary and checkable in thirty seconds.** The agency opens `/robots.txt` and sees it. No scoring model to defend, no methodology to explain — the thing free checkers cannot give them is not insight here, it is *the specific line*.
- **It runs today.** `geo.ts` is Written/Runs/Validated and needs no `ANTHROPIC_API_KEY` — so Section 0 ships before Phase 0 does, and unblocks outreach independent of AI capture.
- **The fix is ten minutes**, which makes the first interaction a win the agency gets credit for.
- Cloudflare's AI-blocking defaults are on by default for many sites, so this will recur across a prospect list — it is a repeatable opener, not a one-off.

**And it is a product bug worth fixing first.** `citation.ts` has the hard gate
(`aiCrawlable === false` → score 0), but the analysis route only checks robots when passed
`?robots=1`, and never checks the client's *own* site — only competitors. So AIRS scored
Clayton **86/100, gold**, while they are invisible to every AI assistant. Make the robots
check default-on, include self, and surface a blocked site as a top-of-page
disqualification rather than a line item.

### Tier 2 — Asset Package · **$750–900**

Everything in Tier 1 plus the work product. This is where free tools stop and labor starts.

| Section | Source |
|---|---|
| Full ranked gap list | All weaknesses, with evidence |
| **What to publish** | `content_briefs` — target heading, required evidence format, extractability notes, fill-in-the-blank draft, per gap |
| Rewritten on-page assets | Titles, metas, H1/H2s, FAQ block, schema markup — copy-paste ready |
| Appendix: technical hygiene | `findings`. Last. Small. |

Already built in [src/lib/briefs.ts](src/lib/briefs.ts) — `BRIEF_SPECS` covers all eight answer types. This is a rendering job, not a build.

**I never implement.** I produce artifacts; the agency's junior pastes them in. No CMS logins, ever. One revision round, 7 days. Written "not included" list: implementation, GBP edits, link building, client calls.

### Tier 3 — Monthly Retainer · **$997/mo, month-to-month** ← the offer

Re-run tracked queries, diff the citation set against last month, report movement, ship the next batch of briefs. Offered after two or three clean Tier 2s with the same agency.

Tiers 1–2 are one-off — every month restarts at zero. Tier 3 is the only line I don't re-earn. **Four retainers is the business.** Peec proves agencies pay recurring at this price point.

**Build constraint:** everything in Phases 1–3 must make re-running an audit next month *one command against the same evaluation*. Cheap now, expensive to retrofit.

### Revenue math

| Line | Monthly |
|---|---|
| Tier 1 × unlimited | $0 (acquisition) |
| Tier 2 × 4 | $3,400 |
| Tier 3 × 4 | $3,988 recurring |
| | **~$7,388 at maturity** |

Capacity check: 4 retainers ≈ 3 hrs/mo each, 4 packages ≈ 4 hrs each = ~28 hrs/month of delivery. Fits inside 20–30 hrs/week with room for Monday sales and Thursday build.

---

## The Offer

**Structural decision: the retainer is the offer, the one-off is the on-ramp.** A $850 lump sum to an unknown offshore solo operator is a high-friction purchase. A $997/mo cancel-anytime retainer is *lower* risk — smaller commitment, reversible, and it's the line item they already understand because they're paying Ahrefs for exactly that shape.

### Dream outcome

**The agency adds a profitable AI-search line item to every retainer they already have — and can prove it's working — without hiring anyone or learning a new tool.**

Not "AI visibility." That's a feature. Their dream is revenue expansion on existing accounts, defensible at renewal, zero headcount.

### Value equation

| Lever | How the offer moves it |
|---|---|
| Dream outcome ↑ | They bill $2,500, pay $997, keep $1,503/mo recurring |
| **Perceived likelihood ↑** | **Weakest lever — no case studies.** Bought with: free audit proves quality before money moves; every finding carries the quoted failing passage so the client verifies it themselves; deterministic analysis makes month 2 comparable to month 1; outcome tracking from month one |
| Time delay ↓ | Free audit in 48h. First paid package in 5 business days, vs White Label IQ's stated 1–2 weeks |
| Effort ↓ | Zero. No tool, no seats, no calls, no CMS access, no contract. Forward a URL, receive a file |

### The stack — each item kills a specific competitor weakness

| Deliverable | Gap it exploits |
|---|---|
| Free 48-hour Answer Gap Audit, unsolicited, unbranded | White Label IQ is quote-only: form → call → 1–2 weeks. Enterprise is quote-only + annual |
| Monthly asset package — titles, metas, H2s, FAQ blocks, schema, drafted sections | Free checkers return a *score*. Peec is monitoring-only. Ahrefs hands over data and walks away |
| Evidence pack — the failing passage from each cited competitor | Everyone ships share-of-voice. Verifiability substitutes for the brand I don't have |
| Month-over-month citation diff | Live-sampling platforms wobble between runs; deterministic analysis means movement is real signal |
| Unlimited clients at one flat rate | Brand Radar inherits Ahrefs' per-seat/per-project economics. Peec charges per workspace |
| Zero-meeting async delivery | Enterprise needs onboarding, training, QBRs. My 12-hour timezone gap becomes a feature |
| White-label editable Markdown | Locked PDFs are useless to a reseller. Reseller programs give 15–45% off; I give 60% margin |

**Cut from the stack:** dashboards, logins, a portal, live reporting, strategy calls. All platform work — raises my cost, lowers their perceived speed. They want a file, not a login.

### Price math — anchored, not vibes

What the agency pays today to attempt this in-house:

```
Ahrefs base plan                 $129/mo
Brand Radar AI Indexes (all 6)   $699/mo
                                 ────────
                                 $828/mo   ← and they still do 100% of the work
```

**My offer: $997/mo — $169 more than Ahrefs Brand Radar, and you don't have to do the work.**

That is the sentence. Lead with it.

Cross-checks: Semrush One is $199–549/mo for tooling only — I'm 2–5× a tool because I'm not a tool. Peec's agency tier is ~$241/mo for monitoring with no content output — I'm 4× for the layer they explicitly lack. Tier 2 at $850 ≈ one month of Ahrefs, for a finished deliverable instead of a dashboard.

### Guarantee — Publishable or Free

> Send it to your client as-is or don't pay. If the first package isn't something you'd forward under your own logo without editing, invoice cancelled, keep the work. Delivered in 5 business days or the month is free.

A **quality** guarantee, not an outcome guarantee — I never promise citations or rankings. It removes the "unknown offshore stranger" risk, which is the real objection. Month-to-month, cancel anytime, no annual, no minimum.

### Scarcity — real, capacity-based

> **4 retainer slots. Two open.** Founding rate $997/mo locked for as long as you stay — it goes to $1,497 once I have ten verified client outcomes on file.

Both halves are true and checkable against my actual hours. No countdown timers. The rate increase is a real future event tied to Phase 5.

### Names (MAGIC)

1. **The Zero-Meeting AI Answer Engine — 30-Day Client Citation Sprint for SEO Agencies** ← lead with this cold; "zero-meeting" is the strongest hook for a buyer drowning in vendor calls
2. **Publishable-or-Free: The 5-Day AI Visibility Package for White-Label Agencies** ← landing page; the guarantee does more work than the hook
3. **The Answer Gap Partnership — Monthly AI-Search Delivery for Agencies Who Won't Hire**

### The ceiling — the honest part

**The value supports $1,500–2,000/mo. My credibility doesn't. Yet.** The binding constraint is proof, not value. Agencies are the most price-sophisticated buyer in this market — they know exactly what Ahrefs costs because they pay it, and they will not pay a stranger a premium on an unproven claim.

| Stage | Price | Unlocked by |
|---|---|---|
| Now | **$997/mo** founding, 4 slots | Free audit as proof of quality |
| ~10 verified outcomes | **$1,497/mo** | Phase 5 outcome loop |
| Vertical specialisation | **$2,000+/mo** | 5 comparable case studies in one niche (e.g. insurance brokers) |

**Two floors I hold:**

- **Never below $750.** Below that I'm competing head-on with white-label programs that have real delivery capacity, and I lose that fight on volume.
- **Never discount to close the first one.** A discounted founding client anchors my price permanently and tells me nothing about whether the offer works. If they won't pay $997, the offer is wrong or the buyer is wrong — fix that, don't shave the number.

**The risk this offer does not solve:** retainer churn at month three, when the agency's client asks "did it work?" Without the outcome loop I have no answer and they cancel. **Phase 5 is the retention mechanism, not just the moat — build it the week the first retainer signs, not after ten.**

---

## "We already have Semrush" — the objection I will hear every time

Have the answer ready before the first message goes out.

> Semrush tells you your visibility score. It doesn't tell you *why* the sources it cites beat you, and it doesn't hand your team the paragraph that fixes it. What I send is the failing passage from each cited competitor, the specific missing fact, and the drafted section — ready to paste. You keep Semrush for tracking. This is the work.

Sell the **artifact and the labor**, never the monitoring. The moment I'm compared feature-to-feature against a $99/mo tool, I've lost.

---

## Phase 0 — Unblock

**Goal:** the AI capture path can execute. **~3 hours. Blocks everything.**

Verified against the code and the current API reference on 2026-08-07 — every item below
was confirmed, and two were added.

- [ ] Set `ANTHROPIC_API_KEY` in `.env.local` — confirmed absent; the file holds `APIFY_TOKEN` and `OPENAI_API_KEY` only
- [ ] [src/lib/ai-capture.ts:26](src/lib/ai-capture.ts:26) — `claude-opus-4-20250514` → `claude-opus-5`. **Not "may fail" — it 404s.** That model retired **2026-06-15**, seven weeks ago. ([PLAN.md](PLAN.md) and the file's own doc comment already claim opus-5 — code and doc disagree.)
- [ ] Same file — `max_tokens` 4096 → 16000. On Opus 5 thinking is on by default and `max_tokens` caps thinking **plus** response. 4096 truncates. (16000 is also the ceiling for a non-streaming request; above ~16K you must stream to avoid SDK HTTP timeouts.)
- [ ] Same file — `web_search_20250305` → `web_search_20260209` (the dynamic-filtering variant; correct for Opus 5)
- [ ] Same file — raise `max_uses` above 5. Fan-out feeds `sub_intents`; 5 starves it.
- [ ] **Handle `stop_reason: "refusal"` before reading `content`.** Opus 5 ships elevated cybersecurity safeguards; a declined request returns **HTTP 200** with `stop_reason: "refusal"` and possibly empty `content`. `parseClaudeResponse` reads content blocks unconditionally and breaks on that path.
- [ ] **Opt into server-side fallbacks** — `fallbacks: "default"` with beta header `server-side-fallback-2026-07-01`. A decline then re-runs on Opus 4.8 server-side instead of returning nothing.
- [ ] Smoke test one capture against Clayton eval `7b4c780a30c34fef`

Two things the current request gets right and must stay right: it sets no
`temperature`/`top_p`/`top_k`, and it uses no assistant prefill. Both would 400 on Opus 5.

**Done when:** `SELECT COUNT(*) FROM ai_answers` is non-zero.

---

## Phase 1 — Ground truth

**Goal:** know what I'm allowed to claim. **One build day.**

Every accuracy number in this repo is self-authored — [AIRS-ANALYSIS.md:326](AIRS-ANALYSIS.md:326) says so. Calibration is the only number from outside my own head.

**Order matters.** `predictCitations()` can only rank pages already in `page_content`, and the current competitor set came from SERP scraping. If the AI cites a site I never crawled, it can never make my top 5 and recall counts it as a miss — I'd be measuring my crawler, not my algorithm.

**Capture → crawl the cited hosts → calibrate.**

### ⚠️ New prerequisite: fix the query set first

"Capture 15–20 Clayton queries" — from where? The `sub_intents` table currently holds this,
for an Australian commercial insurance broker:

```
how much do commercial insurance agents make in california
how much do commercial insurance brokers make in ontario
how much do top commercial insurance brokers make
how do i become a commercial insurance broker
```

Every one is a **career or salary** question, and two are for the wrong continent.
Calibrating precision@5 against those measures the algorithm on queries no buyer asks and no
client can win. The number would be real and useless — and worse, it would then govern which
sentence goes on the cover.

**So the commercial-intent filter is a Phase 1 prerequisite, not a later improvement.**
`demand.ts` already filters boilerplate, self-reference, and off-topic noise; what's missing
is a buyer/evaluator vs learner/career classification gated on the evaluation's
`search_intent`, plus a region filter (`target_location` is `Australia` and is used for the
competitor search but not for demand). Half a day, and it is upstream of every number in
this phase.

- [ ] **Add the commercial-intent + region filter to `demand.ts`; re-run discovery**
- [ ] Capture 15–20 Clayton queries
- [ ] Crawl the hosts appearing in `ai_citations`
- [ ] `GET /api/evaluations/[id]/calibration` — read `avgPrecision`, `avgRecall`, `suggestWeightAdjustments()`
- [ ] Tune `WEIGHTS` in [src/lib/citation.ts](src/lib/citation.ts) at most twice. Needs ≥5 queries to mean anything ([calibration.ts:201](src/lib/calibration.ts:201))

| precision@5 | Cover language |
|---|---|
| **≥ 0.4** | "How AI assistants answer questions in your category, and where the cited sources are weak" — ships as **observed** |
| **< 0.4** | "Citation gap analysis — what the cited sources are missing" — ships as **predicted**. Section 2 still fully valid; ranking is directional |

### ✅ Result — 2026-08-07

```
precision@5      : 1.00     all 5 predicted sources were in the assistant's retrieval set
base rate        : 0.79     what a RANDOM top-5 scores against this candidate pool
LIFT OVER CHANCE : 0.21     <- the honest number
recall@5         : 0.16     exactly the ceiling, min(5,31)/31
queries          : 1        Clayton, "how much does commercial insurance cost in australia"
```

**Quote the lift, not the precision.** Raw precision@5 = 1.00 is real but flattering, and the
direction of the error favours us — which is why `calibration.ts` now returns `baseRate`,
`liftOverChance` and `maxPossibleRecallAt5` alongside it, so the figure cannot be over-read
by accident later.

The reason: crawling the retrieval set is *required* for a fair test — `predictCitations` can
only rank pages in `page_content`, so an uncrawled host is an automatic miss — but crawling it
also loads the candidate pool with known positives. After crawling, 30 of 38 candidates had
been retrieved, so a coin-flip top-5 scores 0.79 by construction.

Measured across both runs, the ranking's own contribution is consistent:

| Candidate pool | Base rate | Observed | Lift |
|---|---|---|---|
| 16 sites, 8 retrieved | 0.50 | 0.80 | **+0.30** |
| 38 sites, 30 retrieved | 0.79 | 1.00 | **+0.21** |

**Against the 0.4 gate the cover ships as *observed*** — but the sentence to defend is "our
top five were all in the assistant's retrieval set," not a percentage.

**Recall@5 is maxed, not weak.** The assistant retrieved 31 distinct hosts, so a top-5 can
capture at most 5/31 ≈ 0.16 — and 0.16 is what it scored. Recall@5 against a 31-source
retrieval set measures the size of the set, not the ranking.

**The ordering warning was real.** The first calibration run returned **precision 0.0**, because
only 3 of 32 retrieved hosts had been crawled — `predictCitations` can only rank pages in
`page_content`, so an uncited-because-uncrawled host scores as a miss. Crawling 8 retrieved
hosts moved it from 0.0 to 0.80 with no change to the algorithm. **Never calibrate before
crawling the retrieval set**; the number is otherwise a measure of crawl coverage.

**Caveats to hold, honestly:**

- **One query.** `calibration.ts` wants ≥ 5 queries before the number means much. This is a
  signal, not an established accuracy figure — capture 15–20 before quoting it externally.
- **Retrieval, not citation.** What gets stored is the `web_search_tool_result` set — every
  source the assistant *pulled in*. Whether a given source ended up quoted in the prose is
  not recoverable from the response. `predictCitations` predicts retrieval, so the metric is
  self-consistent, but "cited" overstates it in conversation. Say **retrieved**.
- **`WEIGHTS` untouched.** No tuning was applied. 0.80 is the out-of-the-box number, which
  makes it the honest baseline to tune against later.

**Done when:** ✅ number written down, cover sentence decided — **observed**.

---

## Phase 1.5 — Differentiation test ⚠️ NEW

**Goal:** find out whether the gap analysis is actually differentiated, or whether I'm about to build an export around a claim that isn't true. **One hour. Do this before Phase 2.**

**Status: UNVERIFIED.** I believe nobody else does passage-level, evidence-quoted, answer-type-typed gap detection. Competitor research did **not** confirm this — Scrunch advertises "pinpoint content gaps," Profound does autonomous content generation. A 20-minute search finding nothing is not proof.

Settle it empirically instead of arguing about it:

- [ ] Run [HubSpot AI Search Grader](https://www.hubspot.com/ai-search-grader) on Clayton
- [ ] Run [Ahrefs free AI Visibility Checker](https://ahrefs.com/ai-visibility-checker) on Clayton
- [ ] Run [Semrush free checker](https://www.semrush.com/free-tools/ai-search-visibility-checker/) on Clayton
- [ ] Start a Scrunch or Peec trial if one is available; export their gap output
- [ ] Put all four side by side with AIRS output and answer one question in writing: **does any of them name the missing fact and quote the passage where the cited source stops short?**

| Outcome | What Phase 2 emphasizes |
|---|---|
| Nobody does it | Section 2 leads, and it is the entire pitch |
| Somebody does it, worse | Lead on evidence quality and the drafted asset |
| Somebody does it well | **Stop.** Reprice as pure fulfilment labor and compete on cost, not insight |

**Done when:** I can name, in one sentence, the thing my report contains that none of those four produce. If I can't write that sentence, I don't have a differentiator — I have a cost advantage, which is still a business, but a different one.

---

## Phase 2 — The deliverable

**Goal:** one command produces a file I'd put a stranger's logo on. **One build day.**

[report/route.ts:43](src/app/api/evaluations/[id]/report/route.ts:43) serializes `evaluation, competitors, evidence, findings, recommendations, scores` — the **hygiene layer only**. No briefs, no coverage, no weaknesses. The entire Tier 2 output is excluded, written to a `reports` table with 0 rows that nothing renders. Dead code producing the wrong data.

- [x] New `src/lib/export.ts` — takes `evaluationId` + tier, returns Markdown
- [x] Tier 1 render: answers, gaps, **top 3 fixes only** (`TIER_1_FIXES = 3`)
- [x] Tier 2 render: full gap list + briefs + hygiene appendix
- [x] `POST /report` **deleted** 2026-08-09 — it wrote hygiene-only JSON to a `reports` table with 0 rows across the project's life. The `GET` stays; the in-app view uses it.
- [x] Unbranded
- [x] Markdown, not PDF
- [x] Every factual claim traceable to a `coverage` or `evidence` row
- [x] Last page: analysis and recommendations, no guarantee
- [x] Reachable from the UI — download links on the report page. It was curl-only until 2026-08-09, which meant the actual product could not be produced from the app that computes it.

**Done when:** the Clayton audit exports as a file I'd send to Octopus unedited.

---

## Phase 3 — Scale

**Goal:** twenty unsolicited Tier 1s in a morning. **One build day.**

- [x] `npm run audit -- --url <site> --query "<query>" --location <geo> --tier <1|2> --out ./audits/`
- [x] Orchestrates the existing HTTP routes — no duplicated analysis logic
- [x] Batch mode: CSV of targets → one file each
- [x] Logs failures per target and keeps going

**Verification is not optional.** A hallucinated citation in front of an agency's client ends that channel permanently. Until twenty ship clean, manually check every one: the competitor really is cited where I say, the queries really return what I claim, every statement about the client's site is currently true. Ten minutes on a twenty-minute audit is still 90%+ margin.

### ⚠️ First verification, 2026-08-09 — Rule 3 found a real error on the first check

One claim, checked against the live file. `curl https://claytoninsurancebrokers.com.au/robots.txt`.

The Tier 1 export said **"blocks 5 AI crawlers: ChatGPT, Claude, Google AI, Alexa/Roku, ByteDance."**
The live file disallows **eleven user agents across nine platforms**. Three defects:

1. **Undercount.** `AI_CRAWLERS` listed six agents and missed `Applebot-Extended`, `CCBot`,
   `meta-externalagent`, `anthropic-ai` and `Claude-Web` — so the audit understated the problem
   in a document whose entire job is to name the problem. Now 10 platforms, multiple agents each,
   and a platform counts as blocked if any one of its agents is.
2. **Wrong product name.** `Amazonbot` was labelled **"Alexa/Roku"**. Roku is unrelated to
   Amazonbot. A wrong product name in a client deliverable costs more credibility than the
   finding earns.
3. **Unanchored matching.** `User-agent:\s*GPTBot` matched `GPTBot-Image`, reporting blocks
   nobody wrote. Now matched on a whole line, and `Disallow:` is distinguished from `Disallow: /`.

**And the fact the audit was missing entirely:** the blocks are inside Cloudflare's *managed*
content block — on by default, most owners have no idea. That turns "you block eight AI
platforms" into "your CDN did this and it is a toggle", which is a different conversation and
the one that closes. Now rendered in the export.

Parsing moved to `src/lib/robots.ts` (pure) with **8 tests pinned to the real file**. Corrected
output: **8 platforms**, correctly named.

**One check, three defects, one missed selling point. Do not ship an audit unverified.**

**Done when:** one command turns a CSV of ten prospects into ten Markdown files.

---

## Phase 4 — Local businesses

**Goal:** serve agencies whose clients are local service businesses. **One build day. Not before Phase 3 ships.**

`gmb_audits = 0`, `gmb_businesses = 0`. Marked shipped in [PLAN.md:74](PLAN.md:74), never executed, depends on Apify — paid, third-party, breaks.

- [ ] Run [src/lib/gmb-scraper.ts](src/lib/gmb-scraper.ts) against one real business end to end
- [ ] Measure Apify cost per run — does it survive at $850/package?
- [ ] Fold GMB findings into the Phase 2 export
- [ ] If fragile or expensive: sell non-local only and revisit

**Until then, sell professional-services and B2B only.** Clayton Insurance Brokers is the right profile.

---

## Phase 5 — The moat ⚠️ PROMOTED

**Goal:** build the one thing no competitor can copy. **Starts when the first Tier 3 retainer signs.**

The commodity clock is ~18 months. AIRS isn't a bridge to something else, so defensibility has to be built inside it. Three places it can come from:

1. **Proof it works** — [src/lib/outcomes.ts](src/lib/outcomes.ts), brief shipped → citation gained. No competitor can show an agency *"here are 40 gaps we closed and the citations that followed."* Profound has $155M and cannot produce my client outcome data. Retainers generate the before/after pairs; this is why Tier 3 matters beyond revenue.
2. **Accumulated ground truth** — every calibration run banks real observed AI citations. A year across dozens of markets is a dataset nobody starting later has.
3. **The agency channel** — four agencies who trust the deliverable are harder to displace than any feature.

- [ ] Wire `markBriefShipped()` into the Tier 3 workflow so every retainer month records a baseline
- [ ] Run `measureOutcome()` on the following month's capture
- [ ] After 10 verified outcomes, put the aggregate in the sales message

---

## Do Not Build

| Item | Why |
|---|---|
| Auth, multi-tenancy, hosted deployment | Selling documents, not access |
| SSRF allowlist on `/api/scrape` + `/api/crawl` | Only matters deployed. Localhost only. |
| Perplexity + Google AI Overview adapters | One engine sells fine. Add when an agency asks. |
| Scheduled re-runs | Manual until Tier 3 volume demands it |
| Dashboard polish, charts, Citation Share ring | Nobody looks at my dashboard |
| Migrations, `crypto.randomUUID()`, `prisma/` rename | Cosmetic |
| Local embeddings (ONNX) | Biggest accuracy gain available — worthless before ground truth exists to measure against |
| **Anything that makes AIRS look like a platform** | See the test below |

---

## Tool, not platform — how to actually decide

The rule is useless as a slogan. Here is the test.

> **Would I build this if I were guaranteed to be the only person who ever sees it?**
>
> No → it's platform work. Cut it.

A platform feature serves a user who isn't in the room. A tool feature serves me, right now, while I work. The deliverable is the product; **the UI is scaffolding**. Output quality is unlimited. Interface quality is capped at "I can operate it."

### The four platform smells

**1. Building for a stranger's trust.** Onboarding, empty states, tooltips, loading skeletons, error copy written in complete sentences, anything that exists so someone unfamiliar isn't confused. I am never unfamiliar. A crash with a stack trace is a perfectly good error message for an audience of one.

**2. Building for a user who doesn't exist.** Auth, roles, permissions, invite flows, project switching, per-tenant config. Every one of these is infrastructure for people who will never log in.

**3. Generality before the second use case.** Platforms are general; tools are specific. Hardcode the Clayton config. Hardcode the query set. When a second client genuinely needs something different, *then* extract a parameter. Config UI is the endgame of this smell — a settings page is a hardcoded object that lost its way.

**4. Robustness I'm not paying for.** Retry logic, graceful degradation, monitoring, error handling for cases that can't happen. A platform must keep working when its author is asleep. A tool can break at 2pm while I'm sitting in front of it, and I fix it. My own analysis doc already warns against defensive code for impossible scenarios — same principle.

### Specific calls

| Decision | Tool answer |
|---|---|
| New evaluation | CLI arg or a hardcoded const. Not a wizard. |
| Inspect coverage results | `node -e` against SQLite, or the existing table view. Not a new chart. |
| Change citation weights | Edit `WEIGHTS` in [src/lib/citation.ts](src/lib/citation.ts). Not a settings page. |
| Something failed | Read the stack trace. Not an error-reporting UI. |
| Run twenty audits | A CSV and a `for` loop. Not a job queue. |
| Store a client's config | A JSON file per client in the repo. Not a `clients` table with CRUD. |
| Share a report | Send the Markdown file. Not a share link. |
| Track which audits I've sent | A row in a spreadsheet. Not a CRM module. |
| The report itself | **Unlimited effort.** This is the product. |

### The one exception

Phase 3's headless runner looks like platform work and isn't. It's the difference between one audit and twenty, and twenty is the whole outreach motion. The test still passes: I would build it if I were the only user, because I am the one running it twenty times.

### Why this matters more than it sounds

Profound raised $155M to build the platform. Peec raised $29M. If I spend Thursdays on dashboards I am spending my scarcest resource competing on the one axis where I lose by three orders of magnitude — and *not* spending it on the report, which is the only axis where I win.

Every hour goes into what the client reads, not what I click.

---

## Rules

1. **No code until five people ask for the audit.** Documented failure mode: complete systems for zero customers — RHU portal, grades system, AZMATH.
2. **Thursday is the only build day.** Monday is sales-only and does not move.
3. **Assemble the first 2–3 audits by hand** before writing Phase 2. Manual assembly tells me what Section 2 should contain; building first means guessing the format.
4. **Never mention how fast it is.** Twenty minutes of my time against $1,500 of agency billing is my margin, not their discount. Quote five days.
5. **Never compete on monitoring.** Semrush is $99/mo and Adobe owns it. I sell the artifact and the labor.
6. **Sell the outcome data as soon as I have it.** It's the only asset in this plan that compounds.

---

## Sequence

| When | Phase | Outcome |
|---|---|---|
| **Now (~1hr, no API key)** | **0.5** | **Crawlability check default-on and covering self. Section 0 ships; outreach can start before Phase 0** |
| Thursday 1 | 1-pre | Commercial-intent + region filter on `demand.ts` — the query set every later number depends on |
| Thursday 1 | 0 + 1 | precision@5 number; I know what I can claim |
| Thursday 1 (+1hr) | 1.5 | I can name my differentiator, or I learn I don't have one |
| Weeks 1–2 | — | First 2–3 audits assembled **by hand** and sent free |
| Thursday 2 | 2 | Export ships; Tier 1 and Tier 2 both render |
| Thursday 3 | 3 | Runner ships; fire twenty free Tier 1s |
| Thursday 4+ | 4 | GMB, only if Phase 3 is clean |
| On first retainer | 5 | Outcome loop — the moat |

**Why 0.5 jumped the queue:** it is the only deliverable in this plan that runs today with no
credential, no spend, and no unresolved accuracy question — and on the one real client
tested, it found a finding that invalidates everything downstream of it. An hour of work that
unblocks outreach beats a build day that doesn't.

**Before Phase 2, one Phase D fix is mandatory:** `extractSubject` currently emits headings
like *"How much does commercial insurance agents make in california cost?"*. Tier 2's core
promise is a copy-paste-ready asset package — malformed headings in the deliverable end that
channel faster than any missing feature. Replace it with `subjectTerms()` from `coverage.ts`
(already unit-tested, and the same function the engine reaches its verdict with).
