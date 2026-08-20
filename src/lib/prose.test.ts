/**
 * Quote hygiene.
 *
 * Both cases below are verbatim from the first Tier 1 export. The navigation menu was quoted
 * three times as "the closest any source comes", and the truncation cut mid-word. Either one
 * in a document an agency forwards under their own logo costs more credibility than the
 * finding buys.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { looksLikeProse, stripProcessNarration, trimToBoundary } from "./prose.ts";

const NAV_MENU =
  "Very proudly one of the largest Australian owned Insurance Brokers. CONTACT US Business " +
  "Insurance Commerical Insurance Commercial Vehicle Insurance Construction Insurance Corporate " +
  "Travel Insurance Cyber Insurance Farm Insurance Home Indemnity Labour Hire Liability Insurance";

const REAL_PROSE =
  "Commercial Property Insurance, also known as Commercial Building insurance, provides " +
  "coverage for loss or damage to the buildings your business operates from.";

// --- the menu that got quoted -------------------------------------------------

test("a navigation menu rendered as text is not quotable", () => {
  assert.equal(looksLikeProse(NAV_MENU), false);
});

test("ordinary prose is quotable", () => {
  assert.equal(looksLikeProse(REAL_PROSE), true);
});

test("a short direct answer is quotable", () => {
  assert.equal(
    looksLikeProse("Yes - we are authorised agents of QBE and Allianz in relation to CTP/Green Slips in NSW."),
    true
  );
});

test("a run of title-case terms is rejected even with a full stop", () => {
  assert.equal(
    looksLikeProse("Home Business Insurance Public Liability Professional Indemnity Cyber Marine Strata Farm."),
    false
  );
});

test("a fragment too short to be a quote is rejected", () => {
  assert.equal(looksLikeProse("Contact us for a quote."), false);
});

test("text with no sentence punctuation is rejected", () => {
  assert.equal(
    looksLikeProse("our commission is competitive and tailored to your property and your needs"),
    false
  );
});

test("a proper noun or two does not disqualify real prose", () => {
  // The title-case rule must not fire on ordinary named entities.
  assert.equal(
    looksLikeProse(
      "Our team in New South Wales works with QBE and Allianz to place cover for transport operators."
    ),
    true
  );
});

// --- truncation ---------------------------------------------------------------

test("truncation prefers a sentence boundary", () => {
  const text = "We charge a flat rate. The second sentence runs on well past the limit and keeps going.";
  const cut = trimToBoundary(text, 40);
  assert.equal(cut, "We charge a flat rate.");
});

test("truncation falls back to a word boundary, never mid-word", () => {
  const text = "Strata Insurance and commercial vehicle cover for operators across the eastern seaboard";
  const cut = trimToBoundary(text, 30);
  assert.ok(!cut.replace("…", "").endsWith(" "), "trailing space");
  assert.ok(text.startsWith(cut.replace("…", "")), "invented text");
  assert.ok(cut.endsWith("…"), "no ellipsis to mark the cut");
});

test("text under the limit is returned whole, without an ellipsis", () => {
  assert.equal(trimToBoundary("Short enough.", 100), "Short enough.");
});

test("whitespace is collapsed so a quote block stays one paragraph", () => {
  assert.equal(trimToBoundary("line one\n\n   line two", 100), "line one line two");
});

// --- process narration --------------------------------------------------------

test("the model's own process narration is stripped", () => {
  // Verbatim opening of a real capture. Quoted in a client document it reads as a chat log.
  const captured =
    "I'll search for current information on commercial insurance costs in Australia. " +
    "Let me search for more specific breakdowns and check for additional broker sources. " +
    "# How Much Does Commercial Insurance Cost in Australia?\n\n" +
    "There's no single price — it is built from separate policies, each priced on industry " +
    "risk, turnover, location, employee numbers and claims history. Most Australian small " +
    "businesses pay between $600 and $2,000 a year for core cover, and a busy cafe with " +
    "staff and fit-out can exceed $3,000 annually.";

  const cleaned = stripProcessNarration(captured);
  assert.ok(cleaned.startsWith("# How Much Does"), cleaned.slice(0, 60));
  assert.ok(!cleaned.includes("I'll search"));
});

test("an answer with no preamble is returned unchanged", () => {
  const text =
    "Commercial insurance in Australia typically runs $600 to $2,000 per year for a small " +
    "business, with public liability alone at $30 to $80 per month depending on trade and " +
    "turnover. Larger operations with specialised cover pay considerably more than that.";
  assert.equal(stripProcessNarration(text), text);
});

test("stripping never returns empty when the answer is only narration", () => {
  // Better to show scaffolding than a blank section — an empty quote reads as a broken tool.
  const onlyNarration = "I'll search for that now. Let me check a few sources.";
  assert.ok(stripProcessNarration(onlyNarration).length > 0);
});

test("a heading too early to be a real answer does not truncate the content", () => {
  const shortHeading = "Intro sentence here. # Tiny\n\nToo short to stand alone.";
  assert.ok(stripProcessNarration(shortHeading).includes("Intro sentence"));
});
