# The question set, and what the four verdicts mean

This is the rulebook `src/lib/grid.ts` implements. It exists because the four labels *are* the
prospecting product — the grid is just the thing that computes them — and a label whose rule
lives only in code is a label nobody can argue with.

---

## The unit of measurement

**One cell = one business × one question × N runs.**

The value in the cell is a count: *retrieved in k of N runs*.

### Say "retrieved", not "cited"

The API returns the **retrieval set** — every source the assistant pulled in while answering.
Whether a given source was then quoted in the prose is **not recoverable** from the response.

This kills the `S` (Sources-but-not-quoted) column that earlier drafts assumed. It is not a
column choice that was made; it is a distinction the data cannot support. Every label below is
therefore about *retrieval*, and the wording in exports says so. Claiming "cited" would be
claiming something we did not measure.

---

## The three questions

Prospecting asks three, in this order, because they measure different things:

| # | Shape | Example | What it tells you |
|---|---|---|---|
| 1 | `entity` | "best insurance brokers in Brisbane" | Who exists in the market's mind at all |
| 2 | `money` | "how much does a broker cost in Brisbane" | Who is trusted with the transactional question |
| 3 | `boolean` | "is it worth using an insurance broker" | Who owns the objection |

Question 1 is the **roll call** and question 2 is the **money**. That asymmetry is what makes
`target` a meaningful verdict rather than just "middling".

Three runs each. One retrieval is indistinguishable from luck; three tell you whether it holds.

---

## The verdicts

Two levels. Cell-level is arithmetic. Business-level is the judgement you act on.

### Cell verdicts — one business, one question

| Verdict | Rule |
|---|---|
| `solid` | retrieved in **every** run |
| `unstable` | retrieved in **some but not all** runs |
| `absent` | retrieved in **no** run |

### Business verdicts — across all questions

Let **reach** = questions retrieved on at least once ÷ total questions.
Let **consistency** = total retrievals ÷ (questions × runs).

**The rules are checked in this order, and the order is part of the rule.**

| # | Verdict | Rule | What it means for you |
|---|---|---|---|
| 1 | **Invisible** | on the roster, retrieved **nowhere**, in no run | Strongest problem, hardest sale. They are absent from a market they operate in — but you must prove they *do* operate in it, or you are pitching a business that legitimately does not serve that market. |
| 2 | **Unstable** | `absent` on the **entity** question | The market does not know they exist. A different problem and a different conversation — there is no specific gap to point at yet. |
| 3 | **Target** | on the roll call, but **not `solid` on the money question** | **The pitch.** The market knows they exist; the assistant does not trust them with the buying question. Specific, demonstrable, fixable — the entire offer. |
| 4 | **Strong** | on the roll call, `solid` on money, reach ≥ ⅔ **and** consistency ≥ ⅔ | Owns the field. Not a prospect. Note them as the benchmark. |
| 5 | **Unstable** | anything left | Real but flickering. Worth contacting, weaker story: "sometimes" is harder to sell than "never on the question that matters". |

### Why Target is checked before Strong

Both were originally written the other way round, and testing the rule rather than assuming it
exposed two cases:

- A business retrieved on **all three** questions but only **1 of 3** on the money question
  scores reach 1.0 and consistency 6/9 — clearing both bars — and came out **Strong**. But
  flickering on the buying question *is* the sellable gap. The aggregate was averaging away the
  only cell that matters.
- A business **absent from the entity question** but solid on the other two scores reach ⅔ and
  consistency 6/9 — hitting both bars exactly — and also came out **Strong**, hiding the fact
  that they never come up when somebody asks who to hire.

Hence: the money question is not one third of the evidence, it is the point; and the roll call
is a precondition, not a third of a score.

### Why `Target` outranks `Invisible` as a prospect

Invisible is the more dramatic finding and the worse lead. A business that never appears may
simply be too new, too small, or not actually in that market — and you will spend the call
establishing that instead of selling. A **Target** has already proven it is a real competitor by
appearing on the entity question. The gap is then narrow, provable, and attributable to
something on their site. That is a fifteen-minute conversation rather than an argument.

---

## The roster problem — read this before trusting `Invisible`

**A business that is never retrieved has no row.** Citations only contain businesses that *were*
retrieved, so invisibility is not observable from a capture. It is the absence of an
observation, and absence needs a list to be absence *from*.

So `Invisible` is the one verdict the grid **cannot compute from captures alone**. It requires a
**roster**: an independently sourced list of businesses that operate in this market — a maps
scrape, a directory, a trade association list, your own prospect sheet.

`buildGrid()` therefore takes an optional roster. Consequences, stated plainly:

- **No roster → no `Invisible` verdicts.** Not zero of them. *None computed.* The grid reports
  `rosterProvided: false` so a report can never imply "we checked and found none".
- **A bad roster manufactures false `Invisible` rows.** Put a business on the roster that does
  not serve the market and it will read as a catastrophic visibility failure. The roster is an
  assertion that these businesses *should* appear.

This is the one place where the grid can be confidently wrong, so it is the one place that
demands a human before the number goes in front of anyone.

---

## Thresholds, and how much to trust them

`⅔` for both reach and consistency is a **starting value, not a calibrated one**. With 3
questions × 3 runs it means: on at least 2 questions, and at least 6 of 9 total retrievals.

It has not been validated against outcomes, because that needs the twenty manual runs. Until
then treat the boundary cases — anything within one retrieval of a threshold — as unclassified
rather than as the label printed. The `margin` field on each business row exists for exactly
this: it reports how many retrievals would have to change to flip the verdict.

**A verdict with `margin: 1` is a coin flip wearing a label** — with one structural exception.

`Strong` is *always* margin 1. It is decided by the money cell being `solid`, so 3-of-3 is by
definition one observation away from 2-of-3, which is `Target`. That is not a defect in the
rule; it is an accurate report that at three runs the two verdicts sit one observation apart.
The grid says so in a separate warning rather than lumping every Strong row in with genuine
boundary cases, which would fire on almost every run and teach you to ignore the warning.

The only thing that thickens that margin is **more runs**.

---

## What would change these rules

Recorded so the next revision is a decision rather than a drift:

1. **Twenty manual runs.** If `Target` businesses convert better than `Invisible` ones, weight
   outreach accordingly and consider dropping `Invisible` from the export entirely.
2. **A fourth question.** If `comparison` ("X vs Y") turns out to separate businesses that the
   other three grade identically, add it — reach denominators change with it.
3. **Retrieval instability across time.** If re-running the same grid a week later moves
   businesses between verdicts more than the run-to-run variance within a batch, then 3 runs is
   too few and the number goes up before anything else here changes.
