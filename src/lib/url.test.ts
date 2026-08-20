import { test } from "node:test";
import assert from "node:assert/strict";
import { hostOf, sameHost, normaliseUrl } from "./url.ts";

test("hostOf strips www and lowercases", () => {
  assert.equal(hostOf("https://www.Example.COM/pricing"), "example.com");
  assert.equal(hostOf("http://example.com"), "example.com");
});

test("hostOf tolerates a missing scheme", () => {
  // This is the divergence the extraction existed to fix. The old `safeHost` did not
  // prepend a scheme, so `new URL()` threw and it returned the *whole string* — meaning
  // "example.com/pricing" and "https://example.com/pricing" were two different businesses.
  assert.equal(hostOf("example.com"), "example.com");
  assert.equal(hostOf("example.com/pricing"), "example.com");
  assert.equal(hostOf("www.example.com/pricing?utm=x"), "example.com");
});

test("hostOf groups the same business across paths, schemes and query strings", () => {
  const forms = [
    "https://www.acme-insurance.com.au/",
    "http://acme-insurance.com.au/quote",
    "acme-insurance.com.au/contact?ref=ai",
    "https://ACME-Insurance.com.au",
  ];
  const hosts = new Set(forms.map((f) => hostOf(f)));
  assert.equal(hosts.size, 1, `expected one business, got ${[...hosts].join(", ")}`);
});

test("hostOf returns empty for what is not a business", () => {
  // Callers filter on this — `analysis/route.ts` with `.filter(Boolean)` and the discover
  // route with an explicit skip. Returning the raw input here (as four of the six old copies
  // did) invented a phantom competitor out of a malformed citation.
  assert.equal(hostOf(""), "");
  assert.equal(hostOf("   "), "");
  assert.equal(hostOf(null), "");
  assert.equal(hostOf(undefined), "");
  assert.equal(hostOf("not a url at all"), "");

  // `new URL("https://garbage")` succeeds and reports the hostname "garbage". A dotless host
  // is never a public website, so it must not become a row in the grid.
  assert.equal(hostOf("garbage"), "");
  assert.equal(hostOf("N/A"), "");
});

test("hostOf keeps distinct subdomains distinct", () => {
  // Only `www.` is noise. A business on a subdomain is its own retrieval target.
  assert.notEqual(hostOf("https://blog.example.com"), hostOf("https://example.com"));
  assert.equal(hostOf("https://www.blog.example.com"), "blog.example.com");
});

test("sameHost is false when either side is unparseable", () => {
  assert.ok(sameHost("https://www.example.com/a", "example.com/b"));
  assert.ok(!sameHost("", ""));
  assert.ok(!sameHost("garbage", "garbage"));
  assert.ok(!sameHost("https://example.com", "https://other.com"));
});

test("normaliseUrl is for fetching, not identity", () => {
  assert.equal(normaliseUrl("example.com/x"), "https://example.com/x");
  assert.equal(normaliseUrl("https://example.com/x"), "https://example.com/x");
  assert.equal(normaliseUrl("  example.com  "), "https://example.com");
});
