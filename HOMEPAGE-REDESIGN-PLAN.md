# AIRS homepage redesign

Status: implemented locally, ready for user review; not published. Updated 2026-09-08.
Validation: touched-file ESLint and production build passed. Browser checks confirmed seven sections, ten FAQ answers, minimum screen-height sections, and no page overflow at 390px. Desktop/mobile screenshots reviewed. FAQ disclosure tested.
This is the current homepage design plan. PUBLIC-SITE-PLAN.md remains historical auth/public-site implementation context.

## Message and audience

Understand your competitors. Find their weaknesses. Know what to improve next.
For business owners and agencies who need practical website improvements backed by competitor page evidence.
AI search supplies competing sources; the main story is customer questions, competitor weaknesses, useful actions, and progress.

## Seven sections

1. Hero: "Understand your competitors. Make your next move count." Explain competitor analysis for AI search. Show an illustrative weakness → opportunity → action. Buttons: Request an analysis (/contact), See how it works (section anchor).
2. Competitor comparison: "See what competing pages do well—and where they fall short." Show customer questions against your site and competing sources, using Answered / Incomplete / Unanswered. Explain website, market, question selection and up to 10 competing sources; not a universal AI ranking.
3. Opportunities: "Find the questions you could answer better." Show a customer question, a competitor's missing details, and a useful answer the business could provide. Include illustrative page evidence. Check whether the user's website already fills the gap.
4. Action: "Know what to change, where to change it, and what to include." Explain evaluation → coverage → brief → mission with a sample brief and task list. The business supplies real prices, timelines and claims; AIRS provides direction.
5. Progress: "See what changed after you did the work." Show before/after coverage and competitor changes. Dashboard = today's snapshot; benchmarks = changes between runs. Separate page improvements from observed AI appearances; do not claim causation.
6. FAQ: "Questions before you get started?" Ten questions and draft answers below.
7. Contact: "Find what your competitors are missing." Ask for website and target market. Button: Request an analysis (/contact). No public registration link.

## Visual and accessibility rules

- Full-width backgrounds; each section minimum one available screen height (account for navigation), never fixed height that clips content.
- Large headings, short paragraphs, one focused visual per section; navy, white and a restrained accent.
- Weakness/incomplete/improved states use text labels as well as colour.
- Normal scrolling, no mandatory snapping or nested FAQ scrolling. Mobile and expanded FAQ sections grow naturally.
- FAQ uses keyboard-accessible disclosure controls, visible focus, and answers included in page HTML. Multiple answers may remain open; first answer open initially.
- Respect reduced motion; keep animations subtle. No heavy video dependency.
- Clearly label fabricated comparison data as Illustrative example. No invented testimonials or performance numbers.

## FAQ: 10 questions and draft answers

1. **What does AIRS do?**
   AIRS compares your website with competing pages found through AI search. It identifies missing or incomplete answers and turns those findings into a practical website improvement plan.
2. **How does AIRS find my competitors?**
   AIRS uses your selected customer questions and target market to search with AI, then gathers up to 10 competing sources. These can include business websites, directories, or information pages. The sources can change with the question and search run.
3. **How does AIRS find competitor weaknesses?**
   It reads the available pages and checks whether they answer the selected questions clearly, mention the topic without enough detail, or leave it unanswered. Page evidence helps you review the findings.
4. **Does AIRS compare my website too?**
   Yes. It compares your available pages with the competing pages so you can see your strengths, your own missing answers, and opportunities you have already covered. Pages that cannot be read should be treated as missing evidence, not proof of weakness.
5. **What is content gap analysis?**
   Content gap analysis looks for information your audience needs that existing pages do not adequately cover. AIRS focuses on customer questions and the details needed to answer them, such as costs, timelines, inclusions, and next steps.
6. **What do I get after an analysis?**
   You get an evaluation with comparisons and findings, a coverage view of customer questions, and recommended improvements. Content briefs explain what to include, while missions organise the work into tasks.
7. **Can AIRS work for my industry and location?**
   AIRS is designed to work across industries using your website, questions, and target market. The usefulness of the findings depends on the questions selected and the pages available. Industry-specific facts still need review by someone who knows the business.
8. **Does AIRS make the website changes for me?**
   AIRS provides guidance, content briefs, and tasks. You or your website team review the recommendations, add accurate business information, and publish the changes.
9. **How do I know whether my improvements helped?**
   Run the analysis again after publishing your changes. Benchmarks compare saved runs to show questions answered, gaps closed, and competitor changes. Better page coverage alone does not prove that AI systems are recommending your business more often.
10. **Can AIRS guarantee that I will beat competitors or appear in AI answers?**
    No. AIRS helps you identify opportunities and make informed improvements. AI answers vary, and stronger content does not guarantee a particular ranking or recommendation.

## Keyword research and placement

Research date: 2026-09-08. These priorities reflect product fit and observed terminology on relevant product pages, not measured search volume, keyword difficulty, or conversion data. No keyword account or Search Console data was accessed.

| Priority | Phrase | Placement and purpose |
|---|---|---|
| Primary | competitor analysis for AI search | Title, hero description; accurately identifies AIRS's purpose |
| Supporting | website competitor analysis | Comparison section; plain description of the task |
| Supporting | content gap analysis | Opportunities section and FAQ 5; explain question-level gaps rather than claiming a keyword ranking database |
| Supporting | AI search visibility | Hero description or progress explanation; broader category, no unsupported multi-engine monitoring claim |
| Supporting | competitor benchmarking | Progress section, alongside the plain-English explanation |
| Supporting | content improvement plan | Action section and closing description |
| Secondary educational | answer engine optimization (AEO); generative engine optimization (GEO) | About/method content; explain once where useful, not repeated throughout the homepage |

Suggested title: AIRS | Competitor Analysis for AI Search
Suggested description: Compare your website with competitors found through AI search. Find content gaps and turn their weaknesses into a clear website improvement plan with AIRS.
H1: Understand your competitors. Make your next move count.
Hero eyebrow: Competitor analysis for AI search.

Use natural variants, not exact phrases in every heading. Do not add meta keywords or a keyword-density target. Do not target "free", "best", guaranteed rankings, or named AI platform tracking unless supported by the actual service. Broad "AI competitor analysis" can suggest AI does all the analysis; describe AI discovery and rule-based page assessment accurately.

Sources supporting category vocabulary (not search demand):
- https://ahrefs.com/content-gap — competitor/content gap terminology; traditional keyword gaps differ from AIRS question coverage.
- https://peec.ai/product/ai-visibility — AI visibility and competitor comparison terminology; this does not imply AIRS has equivalent features.
- https://www.revintel.io/ — answer engine optimization and AI search category terminology.

After launch: when Search Console is available, review relevant query impressions, clicks and CTR, then compare with contact enquiries. Use that evidence to refine phrases; do not promise traffic from this initial shortlist.

## Implementation and checks

1. Verify product claims against current routes and features before publishing FAQ answers.
2. Implement seven sections and labelled example visuals, preserving login and contact flows.
3. Add page-specific title/description and sensible heading hierarchy; verify production canonical only once the live domain is known.
4. Keep FAQ useful and readable; no promise of FAQ search enhancements or automatic AI citations.
5. Check desktop and mobile, expanded FAQs, keyboard operation, contrast, reduced motion, scrolling and CTA destinations.
6. Run touched-file lint and production build, preview locally for user review before publishing.
