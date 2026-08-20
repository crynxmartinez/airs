import { test } from "node:test";
import assert from "node:assert/strict";
import { regionFromLocation, regionFromUrl, resolveRegion, ALL_REGIONS } from "./search.ts";

// --- Location → region -------------------------------------------------------

test("maps country and city names to a region", () => {
  assert.equal(regionFromLocation("Australia"), "au-en");
  assert.equal(regionFromLocation("australia"), "au-en");
  assert.equal(regionFromLocation("Sydney"), "au-en");
  assert.equal(regionFromLocation("Philippines"), "ph-en");
  assert.equal(regionFromLocation("Metro Manila"), "ph-en");
  assert.equal(regionFromLocation("United Kingdom"), "uk-en");
});

test("matches a country named inside a longer location string", () => {
  assert.equal(regionFromLocation("Melbourne, Australia"), "au-en");
  assert.equal(regionFromLocation("serving all of New Zealand"), "nz-en");
});

test("prefers the longest matching name so short codes cannot hijack", () => {
  // "new zealand" must not be decided by a stray "nz" or by "zealand" alone.
  assert.equal(regionFromLocation("New Zealand"), "nz-en");
});

test("returns undefined for an unrecognised or empty location", () => {
  assert.equal(regionFromLocation(""), undefined);
  assert.equal(regionFromLocation(null), undefined);
  assert.equal(regionFromLocation("Atlantis"), undefined);
});

// --- URL TLD → region --------------------------------------------------------

test("infers the region from a country-coded TLD", () => {
  // The case that started this: an .au asset returned Philippine competitors.
  assert.equal(regionFromUrl("https://claytoninsurancebrokers.com.au"), "au-en");
  assert.equal(regionFromUrl("reliable-insurance.ph"), "ph-en");
  assert.equal(regionFromUrl("https://example.co.uk/pricing"), "uk-en");
  assert.equal(regionFromUrl("https://example.co.nz"), "nz-en");
});

test("a generic TLD yields no region", () => {
  assert.equal(regionFromUrl("https://example.com"), undefined);
  assert.equal(regionFromUrl("https://example.io"), undefined);
  assert.equal(regionFromUrl("not a url"), undefined);
  assert.equal(regionFromUrl(null), undefined);
});

// --- Resolution order --------------------------------------------------------

test("an explicit location beats the asset TLD", () => {
  // An Australian broker researching the Philippine market must get Philippine results.
  assert.equal(resolveRegion("Philippines", "https://clayton.com.au"), "ph-en");
});

test("falls back to the asset TLD when no location is given", () => {
  assert.equal(resolveRegion(null, "https://claytoninsurancebrokers.com.au"), "au-en");
  assert.equal(resolveRegion("", "https://claytoninsurancebrokers.com.au"), "au-en");
});

test("falls back to all regions rather than letting the server IP decide", () => {
  // Omitting `kl` makes DuckDuckGo localise by requesting IP, which is what produced
  // Philippine results for an Australian evaluation. The neutral value is explicit.
  assert.equal(resolveRegion(null, "https://example.com"), ALL_REGIONS);
  assert.equal(resolveRegion(undefined, undefined), ALL_REGIONS);
});

test("an unrecognised location still falls through to the TLD", () => {
  assert.equal(resolveRegion("Atlantis", "https://example.com.au"), "au-en");
});
