# Question-First — closing the gap between prospecting and evaluation

## The observation

Prospecting now runs on **three hand-picked buying questions** (`entity` → `money` → `boolean`), each asked 3×, producing a business × question citation grid.

An AIRS evaluation still starts from `evaluations.primary_query` — a single keyword string — and discovers its own questions.

Those are two different systems doing the same job.

## What's already right — don't rebuild these

AIRS is **not** keyword-based internally. `demand.ts` converts the seed into question shapes, and `sub_intents` is a question table. `coverage` is keyed per (question × site) with three verdicts. The architecture already thinks in questions.

The problem isn't the model. It's **where the questions come from, and what the output is.**

## What's actually broken

| # | Gap | Evidence | Status |
|---|---|---|---|
| **1** | Questions can only be auto-discovered, never hand-specified | ~~`sub_intents.source` accepts only three values~~ — **wrong**. `source` is plain `TEXT NOT NULL`; the value list lives in a *comment*, not a CHECK constraint. A new source works with no migration, proven on 2026-08-07 when `ai_fanout` was added and simply worked. | Smaller than thought — a route, not a schema change |
| **2** | The questions analysed and the questions asked of the AI are unlinked | `ai_queries` has `project_id`, `query`, `engine`, `tracked` — no `sub_intent_id`. Still true. | Open |
| **3** | No repeat-run aggregation | 3 runs create 3 `ai_answers` rows — but nothing computes "cited 2 of 3", and rows are only associable by query text plus a close timestamp. | Open, and see the C3 warning |
| **4** | No citation grid | Partly built. `/discover` already groups citations by host and ranks by how many distinct sub-queries retrieved each (`rankHosts`). That is the grid primitive for **one** business × **one** question. | Half done |
| **5** | Citations are URLs, not businesses | Was worse than described — **six** normalisers that disagreed. Now one: `src/lib/url.ts`, 7 tests. | ✅ Closed 2026-08-09 |

## The reframe that makes this simple

**Same engine, two jobs, two question sources:**

| | Prospecting | Auditing |
|---|---|---|
| Question source | 3 hand-picked buying questions | `demand.ts` autocomplete expansion |
| Subject | Many businesses at once | One business |
| Runs per question | 3 | 1 |
| Output | Citation grid — who's weak | Coverage + briefs — what to fix |

`demand.ts` stays. Auto-discovery finds questions you'd never think of, and that's what makes an *audit* thorough. Hand-picked questions are for *finding* prospects. Neither replaces the other.

---

## ⛔ The gate — do not start this yet

**Prerequisites, all three:**

1. ✅ **Phase 0 done** — `claude-opus-5`, key set, `max_tokens` 16000, `web_search_20260209`. Completed 2026-08-07; `ai_answers` is non-zero and capture returns ~50 sources and 7 sub-queries per run.
2. ⬜ **The manual method run on 20+ businesses**, by hand, across at least two cities.
3. ⬜ **One paying client.** Curative or AIRS, either counts.

**One of three. The gate still holds** — and #2 is the one that decides the grid's columns.

**Why #2 specifically:** you don't yet know what belongs in the grid. Is `S` (Sources-but-not-quoted) a column or a value? Do you need the quoted passage per hit, or just the count? Does hostname matching break on businesses with two domains?

Build it now and you'll build the wrong columns and rewrite it in three weeks. Twenty manual runs answers all of it for free.

---

## The changes — one build day, in order

### C1 · Let questions be typed in

**No schema change.** `source` is unconstrained text, so `manual` is already a legal value — a new route that accepts a list of questions and inserts them with `source = 'manual'` is the entire change. Update the column comment so the next reader knows the list is illustrative, not enforced.

The unique index on `(evaluation_id, question)` already prevents duplicates.

Two things the ordering must respect, both added on 2026-08-07:

- The analysis route ranks sub-intents `ai_fanout` → `autocomplete%` → everything else. **Decide where `manual` sits.** Hand-picked buying questions are a deliberate choice and should almost certainly outrank autocomplete — probably alongside `ai_fanout`.
- The demand route deletes and rebuilds sub-intents on every run, but exempts `ai_fanout` because those cost an API call and cannot be regenerated. **`manual` needs the same exemption**, for the stronger reason that a human typed them.

*Smallest possible change and the one that unblocks everything else.*

### C2 · Link capture to the questions

Add nullable `sub_intent_id` to `ai_queries`.

Now "capture citations for these three sub-intents" is expressible, and every captured answer traces back to the question that produced it.

Nullable so existing rows and ad-hoc captures still work.

### C3 · Repeat runs

`captureClaudeAnswer()` takes a `runs` parameter and loops. Each run is already a separate `ai_answers` row.

⚠️ **`/discover` caches, and that will silently break this.** It reuses an existing capture for the same query on the same project — deliberately, so discovery does not re-pay — which means three "runs" through that path return the *same* capture three times and report a confident "cited 3 of 3" from a single observation. Pass `force: true`, or call `/ai-capture` directly, which never reuses.

Add a small delay between runs. Three identical requests back-to-back may hit prompt cache and defeat the point of measuring variance.

**One schema change is worth it after all:** a `capture_group_id` on `ai_answers`. Without it, "cited 2 of 3" is inferred by counting rows with matching query text and a nearby timestamp — which breaks the moment two prospecting runs overlap or a query is re-asked next month. One nullable column makes the grouping exact instead of heuristic.

### C4 · The grid

New `src/lib/grid.ts`:

```
For an evaluation:
  for each sub_intent (manual source)
    for each ai_answer of that sub_intent
      group ai_citations by safeHost(url)
  → { host, question, hits, runs, quoted|sources_only }
```

✅ **Done — `src/lib/url.ts` is the one normaliser.** "Reuse the one in `calibration.ts`" understated the problem: there were six, and two disagreed on the case that matters. `safeHost` did not prepend a scheme, so `new URL("acme.com.au/quote")` threw and it returned the *whole string* as the host — the same business, grouped apart from its own `https://` rows. Two more bugs surfaced during extraction:

- **Dotless hosts.** `new URL("https://garbage")` parses and reports hostname `garbage`. A stray word in a citation field became a business with a retrieval count. `hostOf` now requires a registrable dot.
- **Failure fallbacks disagreed.** Four copies returned the raw input on parse failure (inventing a phantom competitor), one returned `""`. Now uniformly `""` — with the two *display* sites, the report heading and the export filename, taking an explicit fallback rather than each burying its own default.

Use `hostOf` for identity, `normaliseUrl` for fetching. They are separate functions because they are separate jobs.

**Build on `rankHosts` in `/discover`**, which already does host grouping and retrieval-count ranking for one question. The grid is that, generalised across questions and businesses.

⚠️ **`QUESTIONS.md` does not exist in this repo.** C4 depends on its Strong / Target / Unstable / Invisible rules, and those four labels *are* the product — write them down before building the thing that emits them.

⚠️ **`S` (Sources-but-not-quoted) cannot be measured.** The API returns the **retrieval set** — every source the assistant pulled in — and whether a given one was quoted in the prose is not recoverable from the response. So `S` is not a column choice; it is unavailable. The grid measures *retrieval*, and the wording throughout should say "retrieved", not "cited". Better to know this now than after twenty manual runs designed around a column that cannot be filled.

### C5 · Export

Grid → CSV. That's the prospecting artifact — the thing you actually work from.

Markdown export can wait; the CSV goes into the same sheet you're already using for the log.

---

## The unresolved question: what does a prospecting run belong to?

The reframe says prospecting's subject is **many businesses at once** — but C1 and C2 both hang questions off an *evaluation*, and an evaluation requires a `digital_asset_url`. In prospecting there is no client site yet. That is the entire point.

Two ways out:

| | Cost |
|---|---|
| **Placeholder evaluation** to hold the questions | Works today, no schema change. Grubby: a fake `digital_asset_url`, and `is_self` is meaningless for every row |
| **Scope prospecting at the project level** | `ai_queries` is *already* project-scoped, so this is the grain the data is in. C2 would attach `sub_intent_id` to a project-level question set instead of an evaluation |

**Recommendation: project level.** It matches how `ai_answers` and `ai_citations` are already keyed, it avoids inventing a client that does not exist, and it keeps the audit path (evaluation-scoped, one business) cleanly separate from the prospecting path (project-scoped, many businesses) — which is the reframe this document opens with.

## Do not change

- **`demand.ts`** — auto-discovery is what makes an audit thorough. Manual questions supplement it, never replace it.
- **`coverage.ts`** — per (question × site) is already the right unit.
- **`primary_query`** — leave it as the seed for the audit path. Adding manual questions doesn't require removing the seed.
- **The scoring weights** — untouched until calibration has actually run against ground truth.

## Cost note

27 captures per niche (3 questions × 3 runs × 3 cities). Measured, not assumed:

```
discovery profile   $0.375/capture   →   $10.13 per niche   ← measured on a live 9-capture run
default profile     $1.44 /capture   →   $38.88 per niche   (extrapolated from tokens)
```

Use the discovery profile. Tuned 2026-08-07 — raising the search cap costs more and returns
*fewer* sources, while effort is what drives fan-out.

⚠️ **These numbers are 3x higher than this document said before, and the earlier figure was
wrong.** `ai-capture.ts` priced tokens at $5/$25 per million while the grid route used $15/$75 —
two prices in one codebase, with the cheaper one feeding every plan. Now one constant, and
marked unconfirmed: **check it against the Anthropic console before quoting a price to anyone.**
The token counts are measured and trustworthy; the dollars are those counts times an assumption.

`ai_answers` carries `input_tokens` / `output_tokens` / `model`, so per-run cost is queryable rather than estimated. Check after the first city.

**Cities are a market parameter, not a query suffix.** `/discover` already appends the target market to the capture query and keys the reuse lookup on it, after an Australian cleaning query returned a Cleveland maid service and Yelp listings for Los Angeles. Three cities are three markets, so they are three genuinely distinct captures — the reuse cache will not collapse them.


---

## ✅ Result — built 2026-08-09

C1–C5 are done. The gate was overridden deliberately: prerequisite 2 (twenty manual runs) and
3 (one paying client) are still unmet, and the warning below still stands.

| | Shipped as |
|---|---|
| **C1** | `POST/GET/DELETE /api/evaluations/[id]/questions`. No migration — `source` was already unconstrained text. `manual` ranks above `ai_fanout` in the analysis order and is exempt from the demand rebuild. |
| **C2** | `ai_queries.sub_intent_id`, nullable, threaded through `captureClaudeAnswer` via `CaptureOptions.subIntentId`. Backfills an existing row only when it has none. |
| **C3** | `captureRepeated()` + `ai_answers.capture_group_id`. Goes straight to the API, never through `/discover`, so three runs are three observations. |
| **C4** | `src/lib/grid-score.ts` (pure, 18 tests) + `src/lib/grid.ts` (assembly). Rules in `QUESTIONS.md`. |
| **C5** | `GET/POST /api/projects/[id]/grid`, `?format=csv`. |

**Scoped at project level, as recommended.** Prospecting has no client site, so there is no
evaluation to hang it off.

### What the first live run found

3 questions x 3 runs, Brisbane insurance brokers, 9 captures, **$3.38**. 56 businesses, 0 failures.

Four things the run exposed that no amount of planning would have:

1. **The verdict rules were wrong in two places.** `Strong` did not require the roll-call
   question, and was checked before `Target`. A business retrieved on all three questions but
   only 1-of-3 on the money question cleared both bars and came out Strong — averaging away the
   only cell that matters. Both fixed; see the reasoning in `QUESTIONS.md`.
2. **Directories were being graded as prospects.** `localsearch.com.au`, `au.trustpilot.com`,
   `payscale.com`, `aph.gov.au` — all correct retrievals, none a business anyone can sell to.
   Added `classifyHost`, which now filters 17 of 56 rows. It is hostname-only and says so:
   `justbrisbane.com.au` is a directory it cannot detect.
3. **Cost was 3x the documented figure** — see the cost note.
4. **`Strong` is structurally margin-1** at three runs, because it hinges on the money cell
   alone. Reported as its own warning rather than lumped in with genuine boundary cases.

### The honest reading of the result

**Zero real businesses came out as `target`.** One `strong` (`alls.com.au`), one `target` that
is a directory the classifier missed, and 35 `unstable` — and 41 of 56 verdicts would flip on a
single retrieval. This run found no sellable prospect.

That is a result, not a failure: the machinery works and three runs is too thin to separate
businesses. It is also exactly what prerequisite 2 exists to establish. **Build complete, method
unvalidated** — the twenty manual runs still decide whether these columns are the right ones.

The one finding that did land: both roster entries came back `invisible` at 0-of-9, and
`claytoninsurancebrokers.com.au`'s robots.txt says why — it blocks eight AI platforms, via
Cloudflare's managed list, which is a dashboard toggle.

## Definition of done

You can paste three questions into a form, hit run, and get back a CSV of every business cited across those questions with hit counts and a verdict — the thing you're currently building by hand in a spreadsheet.

Until the twenty manual runs are done, **that spreadsheet is the product.** This document just makes sure you don't rebuild it wrong when the time comes.
