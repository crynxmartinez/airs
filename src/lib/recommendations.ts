import { query, run, generateId } from "@/lib/db";
import type { Finding, Recommendation, Evidence, Competitor } from "@/types";
import type { AnswerType } from "@/lib/coverage";

interface ActionPlanTemplate {
  indicator_code: string;
  title: string;
  generateDescription: (evidence: Evidence[], competitors: Competitor[], finding: Finding) => string;
  generateSteps: (evidence: Evidence[], competitors: Competitor[]) => string[];
  effort: "low" | "medium" | "high";
  impact: string;
}

const ACTION_PLANS: ActionPlanTemplate[] = [
  {
    indicator_code: "ST-03-I01",
    title: "Add Schema.org structured data",
    generateDescription: (ev, comps) => {
      const missing = ev.filter((e) => e.value === "false");
      const having = ev.filter((e) => e.value === "true");
      const missingNames = missing.slice(0, 3).map((e) => {
        const c = comps.find((c) => c.id === e.competitor_id);
        return c?.competitor_name || c?.url || "competitor";
      }).join(", ");
      return `${missing.length} of ${ev.length} competitors are missing Schema.org structured data (${missingNames}). ${having.length} competitor${having.length !== 1 ? "s" : ""} already have it. Adding Organization, LocalBusiness, or Service schema will help AI systems understand your content and recommend you in answers.`;
    },
    generateSteps: () => [
      "Add Organization schema with name, url, logo, and contact info",
      "Add Service or Product schema describing what you offer",
      "Add LocalBusiness schema if you have a physical location (address, hours, geo)",
      "Validate with Google's Rich Results Test (search.google.com/test/rich-results)",
      "Add FAQPage schema if you have a FAQ section (pairs with FAQ content task)",
    ],
    effort: "low",
    impact: "+10-15 points on Intent Alignment",
  },
  {
    indicator_code: "CE-03-I01",
    title: "Add a FAQ section with schema markup",
    generateDescription: (ev, comps) => {
      const missing = ev.filter((e) => e.value === "false");
      const having = ev.filter((e) => e.value === "true");
      const havingNames = having.slice(0, 3).map((e) => {
        const c = comps.find((c) => c.id === e.competitor_id);
        return c?.competitor_name || c?.url || "competitor";
      }).join(", ");
      return `${missing.length} of ${ev.length} competitors don't have a FAQ section. ${having.length} already do (${havingNames}). A FAQ section captures long-tail search traffic and gives AI systems direct Q&A content to cite. Add FAQPage schema for rich snippets.`;
    },
    generateSteps: () => [
      "List 10-15 common customer questions (ask your sales/support team)",
      "Check what questions competitors answer on their FAQ pages",
      "Write concise answers (2-3 sentences each) targeting search queries",
      "Add FAQPage schema.org markup so AI systems can parse the Q&A pairs",
      "Link to the FAQ from your homepage and navigation menu",
    ],
    effort: "low",
    impact: "+8-12 points on Content Excellence",
  },
  {
    indicator_code: "CE-02-I01",
    title: "Add pricing information",
    generateDescription: (ev) => {
      const missing = ev.filter((e) => e.value === "false");
      return `${missing.length} of ${ev.length} competitors don't display pricing. Being transparent about pricing builds trust and helps AI systems recommend your service when users ask about cost. Even a price range or 'starting from' helps.`;
    },
    generateSteps: () => [
      "Create a pricing page with clear tiers or packages",
      "If exact pricing varies, show ranges ('Starting from $X')",
      "Add a 'Get a quote' CTA for custom pricing",
      "Link to pricing from your homepage and navigation",
      "Consider adding Pricing schema.org markup",
    ],
    effort: "medium",
    impact: "+8-10 points on Content Excellence",
  },
  {
    indicator_code: "CE-01-I01",
    title: "Expand thin content to match competitors",
    generateDescription: (ev, comps) => {
      const wordCounts = ev.map((e) => ({ name: (() => {
        const c = comps.find((c) => c.id === e.competitor_id);
        return c?.competitor_name || c?.url || "competitor";
      })(), words: parseInt(e.value || "0") }));
      const avg = Math.round(wordCounts.reduce((a, b) => a + b.words, 0) / wordCounts.length);
      const max = Math.max(...wordCounts.map((w) => w.words));
      const maxComp = wordCounts.find((w) => w.words === max);
      const thin = wordCounts.filter((w) => w.words < 500);
      return `Your competitors average ${avg} words per page. The top performer is ${maxComp?.name} at ${max} words. ${thin.length} competitor${thin.length !== 1 ? "s" : ""} have thin content (under 500 words). Aim for 500+ words with comprehensive service descriptions, features, and benefits.`;
    },
    generateSteps: (ev) => {
      const avg = Math.round(ev.reduce((a, e) => a + parseInt(e.value || "0"), 0) / ev.length);
      return [
        `Current competitor average: ${avg} words — target 600+ words`,
        "Add detailed service/product descriptions (what, how, why)",
        "Include customer benefits and use cases for each service",
        "Add case studies or examples to demonstrate value",
        "Break content into sections with H2/H3 headings for readability",
      ];
    },
    effort: "medium",
    impact: "+15-20 points on Content Excellence",
  },
  {
    indicator_code: "TA-04-I01",
    title: "Display licenses and certifications",
    generateDescription: (ev, comps) => {
      const having = ev.filter((e) => e.value === "true");
      const havingNames = having.slice(0, 3).map((e) => {
        const c = comps.find((c) => c.id === e.competitor_id);
        return c?.competitor_name || c?.url || "competitor";
      }).join(", ");
      return `${ev.length - having.length} of ${ev.length} competitors don't mention licenses. ${having.length} do (${havingNames}). Displaying your credentials prominently builds trust with both users and AI systems that factor authority into recommendations.`;
    },
    generateSteps: () => [
      "List all relevant licenses, certifications, and accreditations",
      "Add credential badges or logos to your homepage and about page",
      "Create a dedicated 'Credentials' or 'Why Trust Us' section",
      "Link to official verification pages where possible",
      "Add Organization schema with hasCredential property",
    ],
    effort: "low",
    impact: "+12-18 points on Trust & Authority",
  },
  {
    indicator_code: "TA-03-I01",
    title: "Collect and display customer reviews",
    generateDescription: (ev, comps) => {
      const having = ev.filter((e) => e.value === "true");
      const havingNames = having.slice(0, 3).map((e) => {
        const c = comps.find((c) => c.id === e.competitor_id);
        return c?.competitor_name || c?.url || "competitor";
      }).join(", ");
      return `${having.length} of ${ev.length} competitors have reviews/testimonials (${havingNames}). Reviews are a strong trust signal and give AI systems social proof to reference. Add a review collection and display system.`;
    },
    generateSteps: () => [
      "Set up a review collection process (email follow-ups, on-site prompts)",
      "Add a testimonials section to your homepage",
      "Create a dedicated reviews page with star ratings",
      "Embed Google Reviews or Trustpilot widget",
      "Add Review and AggregateRating schema.org markup",
    ],
    effort: "medium",
    impact: "+10-15 points on Trust & Authority",
  },
  {
    indicator_code: "TA-02-I01",
    title: "Make contact information prominent",
    generateDescription: (ev) => {
      const missing = ev.filter((e) => e.value === "false");
      return `${missing.length} of ${ev.length} competitors don't have clear contact info. Ensure your phone, email, and address are easy to find — in the header, footer, and a dedicated contact page. AI systems use contact info to verify business legitimacy.`;
    },
    generateSteps: () => [
      "Add contact info to your site header or footer (phone, email)",
      "Create a dedicated /contact page with a form",
      "Include business address and hours if applicable",
      "Add ContactPoint schema.org markup",
      "Link to contact page from navigation menu",
    ],
    effort: "low",
    impact: "+8-10 points on Trust & Authority",
  },
  {
    indicator_code: "UX-01-I01",
    title: "Add mobile viewport meta tag",
    generateDescription: (ev) => {
      const missing = ev.filter((e) => e.value === "false");
      return `${missing.length} of ${ev.length} competitors don't have a mobile viewport meta tag. This is a basic requirement for mobile usability. Without it, your site won't render properly on phones and AI crawlers may penalize you.`;
    },
    generateSteps: () => [
      "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\"> to your <head>",
      "Test your site on mobile devices and Google's Mobile-Friendly Test",
      "Ensure tap targets are at least 48px apart",
      "Check that text is readable without zooming on mobile",
    ],
    effort: "low",
    impact: "+10-15 points on User Experience",
  },
  {
    indicator_code: "UX-02-I01",
    title: "Improve image alt text coverage",
    generateDescription: (ev) => {
      const offenders = ev.filter((e) => parseInt(e.value || "100") < 80);
      const ratios = ev.map((e) => parseInt(e.value || "100"));
      const avg = Math.round(ratios.reduce((a, b) => a + b, 0) / ratios.length);
      return `${offenders.length} of ${ev.length} competitors have incomplete alt text (average: ${avg}%). Ensure all your images have descriptive alt text for accessibility and AI image understanding.`;
    },
    generateSteps: () => [
      "Audit all images on your site with an accessibility checker",
      "Write descriptive alt text for every content image (not decorative ones)",
      "Use empty alt=\"\" for purely decorative images",
      "Include relevant keywords naturally in alt text where appropriate",
      "Re-run the audit to verify 100% coverage",
    ],
    effort: "low",
    impact: "+8-10 points on User Experience",
  },
  {
    indicator_code: "TE-01-I01",
    title: "Enable HTTPS with an SSL certificate",
    generateDescription: (ev) => {
      const missing = ev.filter((e) => e.value === "false");
      return `${missing.length} of ${ev.length} competitors don't use HTTPS. SSL is a basic security requirement and a confirmed ranking signal. Without it, browsers show 'Not Secure' warnings and AI systems may deprioritize you.`;
    },
    generateSteps: () => [
      "Get an SSL certificate (free via Let's Encrypt or your hosting provider)",
      "Install the certificate on your web server",
      "Set up HTTP to HTTPS redirect (301 permanent)",
      "Update internal links to use https://",
      "Add HSTS header for extra security",
    ],
    effort: "low",
    impact: "+10-15 points on Technical Excellence",
  },
  {
    indicator_code: "TE-02-I01",
    title: "Optimize page load speed",
    generateDescription: (ev) => {
      const loadTimes = ev.map((e) => parseInt(e.value || "0"));
      const avg = Math.round(loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length);
      const slow = ev.filter((e) => parseInt(e.value || "0") > 2000);
      return `${slow.length} of ${ev.length} competitors have load times over 2 seconds (average: ${avg}ms). Keep your page under 2 seconds to improve user experience and search rankings. Faster pages get crawled more and recommended more by AI.`;
    },
    generateSteps: () => [
      "Run Google PageSpeed Insights to identify specific bottlenecks",
      "Compress and convert images to WebP format",
      "Minify CSS and JavaScript files",
      "Enable browser caching and gzip compression",
      "Use a CDN (Cloudflare, CloudFront) for static assets",
      "Target: load time under 2000ms",
    ],
    effort: "high",
    impact: "+12-18 points on Technical Excellence",
  },
  {
    indicator_code: "TE-03-I01",
    title: "Add canonical link tags",
    generateDescription: (ev) => {
      const missing = ev.filter((e) => e.value === "false");
      return `${missing.length} of ${ev.length} competitors don't have canonical link tags. Without canonical tags, search engines and AI systems may index duplicate versions of your pages, diluting your ranking power.`;
    },
    generateSteps: () => [
      "Add <link rel=\"canonical\" href=\"[self URL]\"> to every page",
      "Ensure canonical URLs are absolute (include https:// and domain)",
      "Check for duplicate content issues with Google Search Console",
      "Set canonicals for paginated content and filter pages",
    ],
    effort: "low",
    impact: "+8-10 points on Technical Excellence",
  },
  {
    indicator_code: "EP-01-I01",
    title: "Build social media presence",
    generateDescription: (ev, comps) => {
      const missing = ev.filter((e) => parseInt(e.value || "0") === 0);
      const having = ev.filter((e) => parseInt(e.value || "0") > 0);
      const havingNames = having.slice(0, 3).map((e) => {
        const c = comps.find((c) => c.id === e.competitor_id);
        return c?.competitor_name || c?.url || "competitor";
      }).join(", ");
      return `${missing.length} of ${ev.length} competitors don't link to social media. ${having.length} do (${havingNames}). Social media links signal legitimacy and build ecosystem presence. AI systems use social signals to gauge brand authority.`;
    },
    generateSteps: () => [
      "Create profiles on Facebook, Instagram, LinkedIn, and YouTube",
      "Add social media links to your site footer and about page",
      "Post regularly (at least weekly) on your primary platforms",
      "Link your website from each social profile (bidirectional)",
      "Add SameAs property in Organization schema linking to profiles",
    ],
    effort: "medium",
    impact: "+10-15 points on Ecosystem Presence",
  },
  {
    indicator_code: "ST-02-I01",
    title: "Ensure clear navigation menu",
    generateDescription: (ev) => {
      const missing = ev.filter((e) => e.value === "false");
      return `${missing.length} of ${ev.length} competitors lack a proper navigation menu. A clear nav menu helps users and AI crawlers discover all your pages. Ensure your site has a structured navigation with logical groupings.`;
    },
    generateSteps: () => [
      "Add a <nav> element in your site header with main menu items",
      "Include links to: Home, Services/Products, About, Contact, FAQ",
      "Use descriptive labels (not just 'Click Here')",
      "Ensure nav is accessible on mobile (hamburger menu)",
      "Add breadcrumb navigation for deeper pages",
    ],
    effort: "low",
    impact: "+8-10 points on Intent Alignment",
  },
  {
    indicator_code: "TA-01-I01",
    title: "Add author bios and expertise signals",
    generateDescription: (ev) => {
      const missing = ev.filter((e) => e.value === "false");
      return `${missing.length} of ${ev.length} competitors don't have author bios. Adding author information establishes E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) signals that AI systems use to evaluate content quality.`;
    },
    generateSteps: () => [
      "Add author bylines to blog posts and content pages",
      "Create author bio pages with credentials and expertise",
      "Link authors to their LinkedIn or professional profiles",
      "Add Person schema.org markup with jobTitle and sameAs",
      "Showcase team expertise on your About page",
    ],
    effort: "low",
    impact: "+8-10 points on Trust & Authority",
  },
  {
    indicator_code: "ST-01-I02",
    title: "Use exactly one H1 per page",
    generateDescription: (ev) => {
      const counts = ev.map((e) => parseInt(e.value || "0", 10)).filter((n) => !isNaN(n));
      const avg = counts.length > 0 ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length) : 0;
      const offenders = counts.filter((n) => n !== 1).length;
      return `${offenders} of ${ev.length} competitors don't use a single clear H1 (average ${avg} per page). One H1 stating the page's subject, with H2/H3 nested beneath it, tells both readers and AI systems what the page is about.`;
    },
    generateSteps: () => [
      "Use exactly one <h1> per page, naming the page's primary subject",
      "Demote decorative or logo headings from <h1> to a styled <div> or <p>",
      "Nest section headings as <h2>, and sub-points as <h3> — never skip levels",
      "Make each heading describe the content beneath it, not the brand",
      "Check the outline renders logically with headings-only browser extensions",
    ],
    effort: "low",
    impact: "+5-8 points on Intent Alignment",
  },
  {
    indicator_code: "TE-04-I01",
    title: "Add robots meta tag",
    generateDescription: (ev) => {
      const missing = ev.filter((e) => e.value === "false");
      return `${missing.length} of ${ev.length} competitors don't have a robots meta tag. Configure robots meta to control how search engines and AI crawlers index your pages. Without it, crawlers make their own decisions which can lead to indexing issues.`;
    },
    generateSteps: () => [
      "Add <meta name=\"robots\" content=\"index, follow\"> to pages you want indexed",
      "Create a robots.txt file at your site root",
      "Submit an XML sitemap to Google Search Console",
      "Use noindex on thin or duplicate pages you don't want indexed",
    ],
    effort: "low",
    impact: "+5-8 points on Technical Excellence",
  },
];

// --- AIRS weakness-based action plans ---
// Keyed by the factor_code format AIRS-<answer_type> produced by generateWeaknessFindings.
const WEAKNESS_PLANS: Record<string, { title: string; steps: string[]; effort: "low" | "medium" | "high"; impact: string }> = {
  "AIRS-money": {
    title: "Publish pricing content with concrete figures",
    steps: [
      "Create a dedicated pricing page with clear packages or tiers",
      "State actual figures: ranges, starting prices, or per-unit rates in your currency",
      "Use a heading like 'How much does [your service] cost' to match the question shape",
      "Add FAQPage schema with the pricing Q&A pair",
      "Ensure the price passage is self-contained — no 'as mentioned above' references",
    ],
    effort: "low",
    impact: "Closes a money-type depth gap — AI assistants cannot quote you without a figure",
  },
  "AIRS-duration": {
    title: "Publish timeline and turnaround information",
    steps: [
      "Add a 'How long does it take' section to your service pages",
      "State concrete timeframes: '2-3 weeks', 'within 5 business days'",
      "Break down phases if applicable (discovery, build, delivery)",
      "Add a timeline table or list for extractability",
      "Use FAQPage schema with the timeline Q&A pair",
    ],
    effort: "low",
    impact: "Closes a duration-type depth gap — assistants hedge when no source states a timeframe",
  },
  "AIRS-count": {
    title: "Publish quantity and capacity data",
    steps: [
      "Add specific numbers: team size, projects completed, clients served",
      "Use a heading that matches the question shape (e.g. 'How many projects have we delivered')",
      "Include the number in a self-contained sentence under the heading",
      "Add Organization schema with employeeCount or numberOfEmployees",
    ],
    effort: "medium",
    impact: "Closes a count-type gap — assistants cannot cite a number nobody publishes",
  },
  "AIRS-steps": {
    title: "Publish a step-by-step process guide",
    steps: [
      "Document your process as an ordered list (Step 1, Step 2, Step 3)",
      "Use heading like 'How to [process name]' or 'Our [service] process'",
      "Make each step a self-contained sentence with a clear action",
      "Add HowTo schema markup for machine readability",
      "Link to the process guide from your service pages",
    ],
    effort: "medium",
    impact: "Closes a steps-type gap — assistants prefer citing structured process content",
  },
  "AIRS-comparison": {
    title: "Publish a comparison guide for your service category",
    steps: [
      "Research the main alternatives your buyers consider",
      "Create a comparison table: your approach vs alternatives, with criteria",
      "Use explicit comparison language: 'versus', 'compared to', 'whereas'",
      "Be honest about tradeoffs — credibility beats one-sided marketing",
      "Add a heading like '[Your service] vs [alternative]: which is right for you'",
    ],
    effort: "high",
    impact: "Closes a comparison-type gap — high effort but high demand, and first-mover advantage is strong",
  },
  "AIRS-entity": {
    title: "Publish named provider/team information",
    steps: [
      "Add a team page with named members, roles, and credentials",
      "Use headings like 'Who we are' or 'Our team'",
      "Include specific names, titles, and qualifications",
      "Add Person schema markup for each team member",
      "Link to the team page from your homepage and about page",
    ],
    effort: "low",
    impact: "Closes an entity-type gap — assistants need named entities to answer 'who' questions",
  },
  "AIRS-boolean": {
    title: "Publish direct yes/no answers to common questions",
    steps: [
      "Identify the boolean questions your buyers ask (do I need X, is Y required)",
      "Write a FAQ section with direct answers: 'Yes — you need...' or 'No, it isn't required'",
      "Make the answer the first sentence, then elaborate",
      "Add FAQPage schema with each Q&A pair",
      "Link to the FAQ from your service pages",
    ],
    effort: "low",
    impact: "Closes a boolean-type gap — assistants cite direct polarity answers over hedged prose",
  },
  "AIRS-definition": {
    title: "Publish clear definitions for key terms",
    steps: [
      "Identify terms in your industry that buyers search for definitions of",
      "Write a glossary or 'What is [term]' page with a clear definition first",
      "Use the pattern: '[Term] is a [category] that [purpose]'",
      "Add DefinedTerm schema markup if applicable",
      "Link to definitions from your service pages where terms appear",
    ],
    effort: "low",
    impact: "Closes a definition-type gap — low effort, but lower winnability since anyone can define a term",
  },
};

export async function generateRecommendations(evaluationId: string): Promise<Recommendation[]> {
  await run("DELETE FROM recommendations WHERE evaluation_id = ?", [evaluationId]);

  // Opportunities (a gap most of the field shares) rank above parity work.
  // impact_level is ordered explicitly: sorting the raw string put 'low' first.
  const findings = await query<Finding>(
    `SELECT * FROM findings
     WHERE evaluation_id = ? AND type IN ('opportunity', 'gap')
     ORDER BY
       CASE type WHEN 'opportunity' THEN 0 ELSE 1 END,
       CASE impact_level WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
    [evaluationId]
  );

  if (findings.length === 0) return [];

  const competitors = await query<Competitor>(
    "SELECT * FROM competitors WHERE evaluation_id = ?",
    [evaluationId]
  );

  const evidence = await query<Evidence>(
    "SELECT * FROM evidence WHERE evaluation_id = ?",
    [evaluationId]
  );

  const planByCode: Record<string, ActionPlanTemplate> = {};
  for (const plan of ACTION_PLANS) {
    planByCode[plan.indicator_code] = plan;
  }

  const recommendations: Recommendation[] = [];

  for (const finding of findings) {
    const indicatorCode = finding.factor_code || "";
    const plan = planByCode[indicatorCode];
    const weaknessPlan = WEAKNESS_PLANS[indicatorCode];

    const recId = generateId();
    const priority = finding.impact_level || "medium";

    let title: string;
    let description: string;

    if (plan) {
      const matchingEvidence = evidence.filter((e) => e.indicator_code === indicatorCode);
      title = plan.title;
      description = plan.generateDescription(matchingEvidence, competitors, finding);

      const steps = plan.generateSteps(matchingEvidence, competitors);
      if (steps.length > 0) {
        description += "\n\nAction steps:\n" + steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
      }
    } else if (weaknessPlan) {
      title = weaknessPlan.title;
      description = finding.description;
      if (weaknessPlan.steps.length > 0) {
        description += "\n\nAction steps:\n" + weaknessPlan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
      }
    } else {
      title = extractTitle(finding.description);
      description = finding.description;
    }

    const effort = plan?.effort || weaknessPlan?.effort || determineEffort(finding.dimension_code || "");
    const impact = plan?.impact || weaknessPlan?.impact || determineImpact(finding.dimension_code || "");

    await run(
      `INSERT INTO recommendations (id, evaluation_id, title, description, priority, effort, expected_impact, finding_ids)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [recId, evaluationId, title, description, priority, effort, impact, finding.id]
    );

    recommendations.push({
      id: recId,
      evaluation_id: evaluationId,
      title,
      description,
      priority: priority as "high" | "medium" | "low",
      effort: effort as "low" | "medium" | "high",
      expected_impact: impact,
      finding_ids: finding.id,
      created_at: new Date().toISOString(),
    });
  }

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  recommendations.sort((a, b) => priorityOrder[a.priority || "low"] - priorityOrder[b.priority || "low"]);

  return recommendations;
}

function extractTitle(description: string): string {
  const firstSentence = description.split(".")[0];
  if (firstSentence.length < 80) return firstSentence;
  return firstSentence.substring(0, 75) + "...";
}

function determineEffort(dimCode: string): string {
  const effortMap: Record<string, string> = {
    intent: "low",
    content: "medium",
    trust: "medium",
    ux: "low",
    technical: "medium",
    ecosystem: "medium",
    competitive: "high",
  };
  return effortMap[dimCode] || "medium";
}

function determineImpact(dimCode: string): string {
  const impactMap: Record<string, string> = {
    intent: "+10-15 points on Intent Alignment",
    content: "+15-20 points on Content Excellence",
    trust: "+12-18 points on Trust & Authority",
    ux: "+10-15 points on User Experience",
    technical: "+12-18 points on Technical Excellence",
    ecosystem: "+10-15 points on Ecosystem Presence",
    competitive: "+8-12 points on Competitive Position",
  };
  return impactMap[dimCode] || "+5-10 points overall";
}
