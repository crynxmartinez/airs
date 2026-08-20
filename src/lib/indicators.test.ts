import { test } from "node:test";
import assert from "node:assert/strict";
import * as cheerio from "cheerio";
import { SIGNALS, countLinks, extractEvidence, extractContent } from "./indicators.ts";

function signals(html: string) {
  const $ = cheerio.load(html);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  return { $, html, bodyText };
}

const page = (body: string, head = "") => `<html><head>${head}</head><body>${body}</body></html>`;

function valueOf(html: string, code: string, url = "https://example.com/") {
  const ev = extractEvidence({ html, url, loadTime: 100 });
  return ev.find((e) => e.indicator_code === code)?.value;
}

// --- Regressions: unanchored substrings used to fire these detectors ----------

test("'get started' is not social proof", () => {
  assert.equal(SIGNALS.reviews(signals(page("<p>Get started with our platform today.</p>"))), false);
});

test("'typically' is not contact information", () => {
  assert.equal(SIGNALS.contact(signals(page("<p>We typically deliver in 5 days.</p>"))), false);
});

test("'cost-effective' is not published pricing", () => {
  assert.equal(SIGNALS.pricing(signals(page("<p>Our service is cost-effective.</p>"))), false);
});

test("'Authorized dealer' is not an author byline", () => {
  assert.equal(SIGNALS.author(signals(page("<p>Authorized dealer for the region.</p>"))), false);
});

// --- True positives still detected -------------------------------------------

test("detects a real testimonial section", () => {
  assert.equal(SIGNALS.reviews(signals(page('<section class="testimonials"><p>Great work!</p></section>'))), true);
});

test("detects AggregateRating schema", () => {
  const html = page("<p>Nothing in the copy.</p>", '<script type="application/ld+json">{"@type":"AggregateRating","ratingValue":4.8}</script>');
  assert.equal(SIGNALS.reviews(signals(html)), true);
});

test("detects contact details from tel: and mailto: links", () => {
  assert.equal(SIGNALS.contact(signals(page('<a href="tel:+15551234567">Call</a>'))), true);
  assert.equal(SIGNALS.contact(signals(page('<a href="mailto:hi@example.com">Mail</a>'))), true);
});

test("detects a real price", () => {
  assert.equal(SIGNALS.pricing(signals(page("<p>Plans start at $49 per month.</p>"))), true);
});

test("detects pricing from the word 'pricing'", () => {
  assert.equal(SIGNALS.pricing(signals(page("<h2>Pricing</h2>"))), true);
});

test("detects FAQ from FAQPage schema", () => {
  const html = page("<p>x</p>", '<script type="application/ld+json">{"@type":"FAQPage"}</script>');
  assert.equal(SIGNALS.faq(signals(html)), true);
});

test("detects FAQ from an accordion of disclosure widgets", () => {
  assert.equal(
    SIGNALS.faq(signals(page("<details><summary>a</summary>1</details><details><summary>b</summary>2</details><details><summary>c</summary>3</details>"))),
    true
  );
});

test("detects a byline with a real name", () => {
  assert.equal(SIGNALS.author(signals(page("<p>Written by Jane Smith</p>"))), true);
});

test("detects credentials", () => {
  assert.equal(SIGNALS.license(signals(page("<p>Fully licensed and insured.</p>"))), true);
});

// --- Link classification -----------------------------------------------------

test("classifies links by resolved host, not href prefix", () => {
  const html = page(`
    <a href="/about">relative root</a>
    <a href="about-us">relative bare</a>
    <a href="https://example.com/services">absolute same-host</a>
    <a href="https://www.example.com/team">absolute www same-host</a>
    <a href="https://other.com/x">external</a>
    <a href="https://linkedin.com/company/acme">social</a>
    <a href="mailto:a@b.com">mail</a>
    <a href="#section">anchor</a>
  `);
  const { internal, external, social } = countLinks(cheerio.load(html), "https://example.com/");
  // The old prefix test counted the two absolute same-host links as external.
  assert.equal(internal, 4);
  assert.equal(external, 2);
  assert.equal(social, 1);
});

// --- Indicator emission ------------------------------------------------------

test("emits H1 count separately from total heading count", () => {
  const html = page("<h1>One</h1><h2>a</h2><h2>b</h2><h3>c</h3>");
  assert.equal(valueOf(html, "ST-01-I02"), "1", "H1 count");
  assert.equal(valueOf(html, "ST-01-I01"), "4", "total headings");
});

test("flags multiple H1s without being confused by H2/H3 volume", () => {
  const html = page("<h1>a</h1><h1>b</h1><h2>c</h2>");
  assert.equal(valueOf(html, "ST-01-I02"), "2");
});

test("a page with many headings is not reported as having too many H1s", () => {
  const html = page("<h1>only one</h1>" + "<h2>s</h2>".repeat(12));
  assert.equal(valueOf(html, "ST-01-I02"), "1");
});

// --- Content extraction (coverage-analysis input) -----------------------------

test("captures the heading outline in document order with levels", () => {
  const html = page("<h1>What is X</h1><h2>How much does X cost</h2><h3>Regional pricing</h3>");
  const { headings } = extractContent({ html });
  assert.deepEqual(headings, [
    { level: 1, text: "What is X" },
    { level: 2, text: "How much does X cost" },
    { level: 3, text: "Regional pricing" },
  ]);
});

test("excludes navigation headings from the outline", () => {
  // A docs-site mega-menu marks its link labels up as headings. Left in, the outline
  // describes the site's nav instead of what the page answers.
  const html = page(`
    <nav><h1>Tutorials</h1><h4>HTML</h4><h4>CSS</h4><h4>Python</h4></nav>
    <div class="sidebar-menu"><h3>References</h3><h4>SQL</h4></div>
    <main><h1>What is Full Stack</h1><h2>How much does it cost</h2></main>
  `);
  const { headings } = extractContent({ html });
  assert.deepEqual(headings, [
    { level: 1, text: "What is Full Stack" },
    { level: 2, text: "How much does it cost" },
  ]);
});

test("excludes link-only headings — div-built nav that no tag selector catches", () => {
  // Blanket class matching ([class*="nav"]) was rejected: it deletes real article
  // bodies on sites whose content wrapper carries a matching class. Link density
  // catches the same chrome and fails safe.
  const html = page(
    '<div class="MainNav"><h2><a href="/p">Products</a></h2><h2><a href="/d">Docs</a></h2></div>' +
      "<h2>How much does it cost</h2>"
  );
  assert.deepEqual(extractContent({ html }).headings, [{ level: 2, text: "How much does it cost" }]);
});

test("keeps a content heading that merely contains a link", () => {
  const html = page('<h2>Compare <a href="/x">our pricing</a> against the market average</h2>');
  assert.equal(extractContent({ html }).headings.length, 1);
});

test("strips nav, header, footer and script from main text", () => {
  const html = page(`
    <nav>Home Services Contact</nav>
    <header>Site Title</header>
    <main><p>The actual answer is forty-two dollars.</p></main>
    <footer>Copyright 2026</footer>
    <script>var x = "tracking";</script>
  `);
  const { mainText } = extractContent({ html });
  assert.equal(mainText, "The actual answer is forty-two dollars.");
});

test("prefers <article> as the content root", () => {
  const html = page("<div>sidebar junk</div><article><p>Real content here.</p></article>");
  assert.equal(extractContent({ html }).mainText, "Real content here.");
});

test("reads dates from schema.org, falling back to meta tags", () => {
  const schema = page(
    "<p>x</p>",
    '<script type="application/ld+json">{"@type":"Article","datePublished":"2026-03-01","dateModified":"2026-06-15"}</script>'
  );
  const fromSchema = extractContent({ html: schema });
  assert.equal(fromSchema.publishedAt?.slice(0, 10), "2026-03-01");
  assert.equal(fromSchema.modifiedAt?.slice(0, 10), "2026-06-15");

  const meta = page("<p>x</p>", '<meta property="article:published_time" content="2025-01-20T10:00:00Z">');
  assert.equal(extractContent({ html: meta }).publishedAt?.slice(0, 10), "2025-01-20");
});

test("leaves dates null when the page declares none", () => {
  const { publishedAt, modifiedAt } = extractContent({ html: page("<p>undated</p>") });
  assert.equal(publishedAt, null);
  assert.equal(modifiedAt, null);
});

test("ignores unparseable date values rather than emitting Invalid Date", () => {
  const html = page("<p>x</p>", '<meta property="article:published_time" content="last Tuesday">');
  assert.equal(extractContent({ html }).publishedAt, null);
});

test("word count reflects stripped content, not raw markup", () => {
  const html = page("<nav>one two three four five</nav><main><p>alpha beta gamma</p></main>");
  assert.equal(extractContent({ html }).wordCount, 3);
});

test("an empty body yields zero words, not one", () => {
  assert.equal(extractContent({ html: page("") }).wordCount, 0);
});
