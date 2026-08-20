/**
 * Quote hygiene for the exported document.
 *
 * Split out of `export.ts` so it can be unit-tested — that module reaches the database and
 * cannot load under `node --test`. These two functions are the only thing standing between a
 * client-facing report and an embarrassing quote, so they earn their own tests.
 */

/**
 * Is this passage prose a reader would accept as a quote?
 *
 * The extractor's link-density filter removes most navigation, but a menu rendered as plain
 * text survives it. The first Tier 1 draft quoted this, three times, as "the closest any
 * source comes":
 *
 *   "Very proudly one of the largest Australian owned Insurance Brokers. CONTACT US Business
 *    Insurance Commerical Insurance Commercial Vehicle Insurance Construction Insurance…"
 *
 * That is a nav list. Printing it as evidence in a document an agency forwards to their
 * client costs more credibility than the finding buys — so a passage that fails this check
 * is not quoted at all, and the report says so.
 */
export function looksLikeProse(text: string): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 10) return false;

  // Longest run of consecutive capitalised words. Menus are Title Case sequences; prose
  // rarely exceeds four in a row, and then only for a name or a proper noun.
  let run = 0;
  let longest = 0;
  for (const w of words) {
    if (/^[A-Z]/.test(w)) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 0;
    }
  }
  if (longest >= 6) return false;

  // Prose ends sentences. A list does not.
  return /[.!?](\s|$)/.test(text);
}

/**
 * Cut to a sentence boundary where possible, a word boundary otherwise.
 *
 * A quote ending "…Strata Insurance TAKING C" reads as a broken export rather than a
 * deliberate excerpt.
 */
export function trimToBoundary(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;

  const cut = clean.slice(0, max);
  const lastSentence = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (lastSentence > max * 0.5) return cut.slice(0, lastSentence + 1);

  const lastSpace = cut.lastIndexOf(" ");
  return `${lastSpace > 0 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * The answer a reader would see, without the model narrating its own process.
 *
 * A captured answer opens with the assistant talking about what it is about to do — "I'll
 * search for current information on commercial insurance costs in Australia. Let me search
 * for more specific breakdowns…" — which is scaffolding, not content. Quoted in a client
 * document it reads as a chat log rather than a finding.
 *
 * When the answer has headings, everything before the first one is preamble by construction.
 * Otherwise, leading first-person process sentences are dropped one at a time; if that would
 * empty the text, the original is returned rather than nothing.
 */
export function stripProcessNarration(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  const heading = trimmed.search(/(^|\n)\s*#{1,6}\s/);
  if (heading > 0) {
    const fromHeading = trimmed.slice(heading).trim();
    if (fromHeading.length > 200) return fromHeading;
  }

  const NARRATION = /^(i'?ll|i will|let me|i'?m going to|first,? i'?ll|now i'?ll|i need to)\b/i;
  let rest = trimmed;
  // Bounded: a handful of preamble sentences at most, never a loop over a whole document.
  for (let i = 0; i < 4; i += 1) {
    if (!NARRATION.test(rest)) break;
    const stop = rest.search(/[.!?](\s|$)/);
    if (stop < 0) break;
    const next = rest.slice(stop + 1).trim();
    if (next.length < 200) break;
    rest = next;
  }
  return rest;
}
