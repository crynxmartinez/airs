import * as cheerio from "cheerio";

export interface AuditCheck {
  category: string;
  name: string;
  status: "pass" | "warn" | "fail";
  score: number;
  value: string;
  detail: string;
  recommendation: string;
}

export interface AuditResult {
  url: string;
  title: string;
  description: string;
  total_score: number;
  checks: AuditCheck[];
  summary: {
    passed: number;
    warnings: number;
    failed: number;
  };
}

export async function auditWebsite(url: string): Promise<AuditResult> {
  const startTime = Date.now();

  const normalizedUrl = /^https?:\/\//i.test(url) ? url : `https://${url}`;

  const response = await fetch(normalizedUrl, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    signal: AbortSignal.timeout(30000),
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const html = await response.text();
  const loadTime = Date.now() - startTime;
  const $ = cheerio.load(html);
  const pageUrl = normalizedUrl;

  const checks: AuditCheck[] = [];

  // --- TECHNICAL ---

  // HTTPS
  const isHttps = normalizedUrl.startsWith("https://");
  checks.push({
    category: "Technical",
    name: "HTTPS / SSL",
    status: isHttps ? "pass" : "fail",
    score: isHttps ? 100 : 0,
    value: isHttps ? "Enabled" : "Not enabled",
    detail: isHttps ? "Site is served over HTTPS." : "Site is NOT using HTTPS. This is a critical security and SEO issue.",
    recommendation: isHttps ? "" : "Install an SSL certificate and redirect all HTTP traffic to HTTPS.",
  });

  // Loading speed
  let speedStatus: "pass" | "warn" | "fail" = "pass";
  let speedScore = 100;
  if (loadTime > 3000) { speedStatus = "fail"; speedScore = 30; }
  else if (loadTime > 1500) { speedStatus = "warn"; speedScore = 60; }
  checks.push({
    category: "Technical",
    name: "Page Loading Speed",
    status: speedStatus,
    score: speedScore,
    value: `${loadTime}ms`,
    detail: `Page loaded in ${(loadTime / 1000).toFixed(2)} seconds.`,
    recommendation: loadTime > 1500
      ? "Optimize images, minify CSS/JS, enable compression (gzip/brotli), use a CDN, and reduce server response time (TTFB). Target: under 1.5s."
      : "Loading speed is good.",
  });

  // HTML page size
  const htmlSizeKB = Math.round(html.length / 1024);
  let sizeStatus: "pass" | "warn" | "fail" = "pass";
  let sizeScore = 100;
  if (htmlSizeKB > 500) { sizeStatus = "fail"; sizeScore = 30; }
  else if (htmlSizeKB > 200) { sizeStatus = "warn"; sizeScore = 60; }
  checks.push({
    category: "Technical",
    name: "HTML Page Size",
    status: sizeStatus,
    score: sizeScore,
    value: `${htmlSizeKB} KB`,
    detail: `HTML document is ${htmlSizeKB} KB.`,
    recommendation: htmlSizeKB > 200
      ? "Page HTML is large. Consider lazy-loading below-the-fold content, removing inline styles/scripts, and splitting large pages."
      : "Page size is reasonable.",
  });

  // Canonical tag
  const hasCanonical = $('link[rel="canonical"]').length > 0;
  const canonicalUrl = $('link[rel="canonical"]').attr("content") || $('link[rel="canonical"]').attr("href") || "";
  checks.push({
    category: "Technical",
    name: "Canonical Tag",
    status: hasCanonical ? "pass" : "warn",
    score: hasCanonical ? 100 : 50,
    value: hasCanonical ? canonicalUrl : "Missing",
    detail: hasCanonical ? `Canonical URL set to ${canonicalUrl}.` : "No canonical tag found. This can cause duplicate content issues.",
    recommendation: hasCanonical ? "" : "Add <link rel='canonical' href='https://yourdomain.com/page' /> to prevent duplicate content issues.",
  });

  // Robots meta
  const hasRobots = $('meta[name="robots"]').length > 0;
  const robotsContent = $('meta[name="robots"]').attr("content") || "";
  checks.push({
    category: "Technical",
    name: "Robots Meta Tag",
    status: hasRobots ? "pass" : "warn",
    score: hasRobots ? 100 : 50,
    value: hasRobots ? robotsContent : "Missing",
    detail: hasRobots ? `Robots directive: ${robotsContent}.` : "No robots meta tag found.",
    recommendation: hasRobots ? "" : "Add <meta name='robots' content='index, follow' /> to explicitly control indexing.",
  });

  // --- STRUCTURAL ---

  // H1 count
  const h1Count = $("h1").length;
  let h1Status: "pass" | "warn" | "fail" = "pass";
  let h1Score = 100;
  if (h1Count === 0) { h1Status = "fail"; h1Score = 0; }
  else if (h1Count > 1) { h1Status = "warn"; h1Score = 50; }
  checks.push({
    category: "Structural",
    name: "H1 Heading",
    status: h1Status,
    score: h1Score,
    value: `${h1Count} H1 tag${h1Count !== 1 ? "s" : ""}`,
    detail: h1Count === 0
      ? "No H1 tag found. The H1 is the most important heading for SEO."
      : h1Count > 1
      ? `${h1Count} H1 tags found. Best practice is exactly 1 H1 per page.`
      : "Exactly 1 H1 tag found. Perfect.",
    recommendation: h1Count === 0
      ? "Add a single H1 tag with your primary keyword."
      : h1Count > 1
      ? `Reduce to 1 H1 tag. Convert extra H1s to H2s. Current H1s: ${$("h1").map((_, el) => $(el).text().trim()).get().slice(0, 3).join(" | ")}`
      : "",
  });

  // Heading hierarchy
  const h2Count = $("h2").length;
  const h3Count = $("h3").length;
  const hasHierarchy = h2Count > 0;
  checks.push({
    category: "Structural",
    name: "Heading Hierarchy (H2/H3)",
    status: hasHierarchy ? "pass" : "warn",
    score: hasHierarchy ? 100 : 50,
    value: `${h2Count} H2, ${h3Count} H3`,
    detail: hasHierarchy
      ? `${h2Count} H2 and ${h3Count} H3 tags found. Good structure for content organization.`
      : "No H2 tags found. Headings help search engines understand your content structure.",
    recommendation: hasHierarchy ? "" : "Add H2 tags for main sections of your content.",
  });

  // Schema.org structured data
  const schemaCount = $('script[type="application/ld+json"]').length;
  checks.push({
    category: "Structural",
    name: "Schema.org Structured Data",
    status: schemaCount > 0 ? "pass" : "fail",
    score: schemaCount > 0 ? 100 : 0,
    value: schemaCount > 0 ? `${schemaCount} JSON-LD block${schemaCount !== 1 ? "s" : ""}` : "None found",
    detail: schemaCount > 0
      ? `${schemaCount} structured data block${schemaCount !== 1 ? "s" : ""} found. AI systems use this to understand your content.`
      : "No structured data found. Schema.org helps AI systems and search engines understand your content.",
    recommendation: schemaCount > 0
      ? ""
      : "Add JSON-LD structured data. Start with Organization schema (name, logo, contact, sameAs social links). Add Service/Product schema for offering pages.",
  });

  // Navigation
  const navPresent = $("nav").length > 0 || $("header nav").length > 0;
  checks.push({
    category: "Structural",
    name: "Navigation Menu",
    status: navPresent ? "pass" : "warn",
    score: navPresent ? 100 : 50,
    value: navPresent ? "Present" : "Missing",
    detail: navPresent ? "Navigation menu found." : "No navigation menu found.",
    recommendation: navPresent ? "" : "Add a clear navigation menu to help users and crawlers find your pages.",
  });

  // --- META TAGS ---

  // Title tag
  const title = $("title").text().trim();
  const titleLen = title.length;
  let titleStatus: "pass" | "warn" | "fail" = "pass";
  let titleScore = 100;
  if (titleLen === 0) { titleStatus = "fail"; titleScore = 0; }
  else if (titleLen < 30 || titleLen > 60) { titleStatus = "warn"; titleScore = 60; }
  checks.push({
    category: "Meta Tags",
    name: "Title Tag",
    status: titleStatus,
    score: titleScore,
    value: titleLen > 0 ? `${titleLen} chars` : "Missing",
    detail: titleLen === 0
      ? "No title tag found. This is critical for SEO."
      : `"${title.substring(0, 60)}" (${titleLen} chars)`,
    recommendation: titleLen === 0
      ? "Add a <title> tag with your primary keyword. Target 50-60 characters."
      : titleLen < 30
      ? "Title is too short. Aim for 50-60 characters to include keywords and brand."
      : titleLen > 60
      ? "Title is too long. Search engines truncate at ~60 chars. Shorten it."
      : "",
  });

  // Meta description
  const metaDesc = $('meta[name="description"]').attr("content") || "";
  const metaDescLen = metaDesc.length;
  let descStatus: "pass" | "warn" | "fail" = "pass";
  let descScore = 100;
  if (metaDescLen === 0) { descStatus = "fail"; descScore = 0; }
  else if (metaDescLen < 70 || metaDescLen > 160) { descStatus = "warn"; descScore = 60; }
  checks.push({
    category: "Meta Tags",
    name: "Meta Description",
    status: descStatus,
    score: descScore,
    value: metaDescLen > 0 ? `${metaDescLen} chars` : "Missing",
    detail: metaDescLen === 0
      ? "No meta description found. This is what appears in search results."
      : `"${metaDesc.substring(0, 80)}..." (${metaDescLen} chars)`,
    recommendation: metaDescLen === 0
      ? "Add a <meta name='description'> tag. Target 150-160 characters with a compelling summary."
      : metaDescLen < 70
      ? "Meta description is too short. Aim for 150-160 characters."
      : metaDescLen > 160
      ? "Meta description is too long. Search engines truncate at ~160 chars."
      : "",
  });

  // Viewport / mobile
  const hasViewport = $('meta[name="viewport"]').length > 0;
  checks.push({
    category: "Meta Tags",
    name: "Mobile Viewport",
    status: hasViewport ? "pass" : "fail",
    score: hasViewport ? 100 : 0,
    value: hasViewport ? "Present" : "Missing",
    detail: hasViewport ? "Viewport meta tag is set for mobile responsiveness." : "No viewport meta tag. Your site won't render properly on mobile.",
    recommendation: hasViewport ? "" : "Add <meta name='viewport' content='width=device-width, initial-scale=1' />.",
  });

  // Open Graph tags
  const ogTitle = $('meta[property="og:title"]').attr("content");
  const ogDesc = $('meta[property="og:description"]').attr("content");
  const ogImage = $('meta[property="og:image"]').attr("content");
  const ogCount = [ogTitle, ogDesc, ogImage].filter(Boolean).length;
  checks.push({
    category: "Meta Tags",
    name: "Open Graph Tags",
    status: ogCount === 3 ? "pass" : ogCount > 0 ? "warn" : "fail",
    score: ogCount === 3 ? 100 : ogCount > 0 ? 50 : 0,
    value: `${ogCount}/3 tags`,
    detail: `${ogCount} of 3 essential Open Graph tags found (title, description, image).`,
    recommendation: ogCount < 3
      ? "Add Open Graph tags (og:title, og:description, og:image) for better social media sharing."
      : "",
  });

  // --- CONTENT ---

  // Word count
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
  let wcStatus: "pass" | "warn" | "fail" = "pass";
  let wcScore = 100;
  if (wordCount < 300) { wcStatus = "fail"; wcScore = 20; }
  else if (wordCount < 600) { wcStatus = "warn"; wcScore = 60; }
  checks.push({
    category: "Content",
    name: "Content Depth (Word Count)",
    status: wcStatus,
    score: wcScore,
    value: `${wordCount} words`,
    detail: wordCount < 300
      ? `Only ${wordCount} words. Thin content ranks poorly.`
      : wordCount < 600
      ? `${wordCount} words. Consider expanding for better rankings.`
      : `${wordCount} words. Good content depth.`,
    recommendation: wordCount < 600
      ? "Expand your content. Aim for 600+ words covering the topic comprehensively."
      : "",
  });

  // Pricing info
  const hasPricing = /price|pricing|\$\d|cost|quote|estimate/i.test(bodyText);
  checks.push({
    category: "Content",
    name: "Pricing Information",
    status: hasPricing ? "pass" : "warn",
    score: hasPricing ? 100 : 40,
    value: hasPricing ? "Found" : "Not found",
    detail: hasPricing ? "Pricing information detected on page." : "No pricing information found. Users searching for transactional intent expect pricing.",
    recommendation: hasPricing ? "" : "Add pricing information or a clear pricing table. Users want to know costs upfront.",
  });

  // FAQ section
  const hasFaq = /faq|frequently asked/i.test(bodyText) || $("section").filter((_, el) => /faq/i.test($(el).text())).length > 0;
  checks.push({
    category: "Content",
    name: "FAQ Section",
    status: hasFaq ? "pass" : "warn",
    score: hasFaq ? 100 : 40,
    value: hasFaq ? "Found" : "Not found",
    detail: hasFaq ? "FAQ section detected." : "No FAQ section found. FAQs help capture long-tail queries and featured snippets.",
    recommendation: hasFaq ? "" : "Add an FAQ section answering common questions about your service/product.",
  });

  // --- TRUST ---

  // Contact info
  const hasContact = /contact|email|phone|call|address/i.test(bodyText);
  const emailMatch = bodyText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const phoneMatch = bodyText.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/);
  checks.push({
    category: "Trust",
    name: "Contact Information",
    status: hasContact ? "pass" : "warn",
    score: hasContact ? 100 : 40,
    value: [emailMatch ? "email" : null, phoneMatch ? "phone" : null, hasContact ? "contact page" : null].filter(Boolean).join(", ") || "None",
    detail: hasContact ? "Contact information found on page." : "No contact information found. This reduces trust.",
    recommendation: hasContact ? "" : "Add contact information — email, phone, or a link to a contact page.",
  });

  // Reviews/testimonials
  const hasReviews = /review|testimonial|rating|star/i.test(bodyText);
  checks.push({
    category: "Trust",
    name: "Reviews / Testimonials",
    status: hasReviews ? "pass" : "warn",
    score: hasReviews ? 100 : 40,
    value: hasReviews ? "Found" : "Not found",
    detail: hasReviews ? "Reviews or testimonials detected." : "No reviews or testimonials found. Social proof increases conversions.",
    recommendation: hasReviews ? "" : "Add customer reviews, testimonials, or ratings to build trust.",
  });

  // License/certification
  const hasLicense = /license|licensed|certified|certification/i.test(bodyText);
  checks.push({
    category: "Trust",
    name: "License / Certification",
    status: hasLicense ? "pass" : "warn",
    score: hasLicense ? 100 : 40,
    value: hasLicense ? "Found" : "Not found",
    detail: hasLicense ? "License or certification mentioned." : "No license or certification mentioned.",
    recommendation: hasLicense ? "" : "If applicable, display your licenses, certifications, or accreditations.",
  });

  // --- UX ---

  // Image alt text
  const imgCount = $("img").length;
  const imgWithAlt = $('img[alt]').length;
  const imgAltRatio = imgCount > 0 ? Math.round((imgWithAlt / imgCount) * 100) : 100;
  let altStatus: "pass" | "warn" | "fail" = "pass";
  let altScore = 100;
  if (imgCount > 0 && imgAltRatio < 50) { altStatus = "fail"; altScore = 20; }
  else if (imgCount > 0 && imgAltRatio < 90) { altStatus = "warn"; altScore = 60; }
  checks.push({
    category: "UX",
    name: "Image Alt Text",
    status: altStatus,
    score: altScore,
    value: imgCount > 0 ? `${imgWithAlt}/${imgCount} (${imgAltRatio}%)` : "No images",
    detail: imgCount === 0
      ? "No images found on page."
      : `${imgWithAlt} of ${imgCount} images have alt text (${imgAltRatio}%).`,
    recommendation: imgCount > 0 && imgAltRatio < 100
      ? `Add alt text to ${imgCount - imgWithAlt} images. Alt text improves accessibility and SEO.`
      : "",
  });

  // Internal links
  const internalLinks = $('a[href^="/"], a[href^="' + pageUrl + '"]').length;
  checks.push({
    category: "UX",
    name: "Internal Links",
    status: internalLinks >= 3 ? "pass" : internalLinks > 0 ? "warn" : "fail",
    score: internalLinks >= 3 ? 100 : internalLinks > 0 ? 50 : 0,
    value: `${internalLinks} links`,
    detail: `${internalLinks} internal links found.`,
    recommendation: internalLinks < 3
      ? "Add more internal links to help users navigate and search engines discover your pages."
      : "",
  });

  // --- ECOSYSTEM ---

  // Social media links
  const socialLinks = $('a[href*="facebook"], a[href*="twitter"], a[href*="instagram"], a[href*="linkedin"], a[href*="youtube"]');
  const socialCount = socialLinks.length;
  checks.push({
    category: "Ecosystem",
    name: "Social Media Links",
    status: socialCount > 0 ? "pass" : "warn",
    score: socialCount > 0 ? 100 : 40,
    value: `${socialCount} link${socialCount !== 1 ? "s" : ""}`,
    detail: socialCount > 0 ? `${socialCount} social media links found.` : "No social media links found.",
    recommendation: socialCount === 0
      ? "Add links to your social media profiles (Facebook, Twitter, LinkedIn, Instagram, YouTube)."
      : "",
  });

  // External links
  const externalLinks = $('a[href^="http"]').not(`a[href^="${pageUrl}"]`).length;
  checks.push({
    category: "Ecosystem",
    name: "External Links",
    status: externalLinks > 0 ? "pass" : "warn",
    score: externalLinks > 0 ? 100 : 40,
    value: `${externalLinks} links`,
    detail: externalLinks > 0 ? `${externalLinks} external links found.` : "No external links found.",
    recommendation: externalLinks === 0
      ? "Link to authoritative external sources to build credibility."
      : "",
  });

  // Calculate totals
  const totalScore = Math.round(checks.reduce((sum, c) => sum + c.score, 0) / checks.length);
  const passed = checks.filter((c) => c.status === "pass").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const failed = checks.filter((c) => c.status === "fail").length;

  return {
    url: pageUrl,
    title,
    description: metaDesc,
    total_score: totalScore,
    checks,
    summary: { passed, warnings, failed },
  };
}
