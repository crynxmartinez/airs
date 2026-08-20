import { test } from "node:test";
import assert from "node:assert/strict";
import { assessPassages, type CoverageLevel, type Passage } from "./coverage.ts";

/**
 * Labeled benchmark across unrelated industries.
 *
 * The engine was built against web-development pages, so the risk is that its
 * patterns are tuned to that vocabulary. These cases are drawn from photography,
 * dentistry, law, logistics, insurance and fitness to check the answer-type model
 * generalises rather than memorising one niche.
 *
 * Each case carries a `title`, because that is what a crawled page provides: the
 * stored record is the title plus every section, not one isolated paragraph. An
 * earlier version of this benchmark omitted it and so understated term overlap far
 * below anything the crawler would ever produce.
 *
 * Labels are what the engine *should* conclude:
 *   answered — the passages supply the required answer shape
 *   lexical  — the topic is discussed but the required fact is missing (depth gap)
 *   none     — the topic is not covered at all (coverage gap)
 */
interface Case {
  domain: string;
  title: string;
  question: string;
  passages: Passage[];
  expected: CoverageLevel;
}

const CASES: Case[] = [
  // ---- money -------------------------------------------------------------
  {
    domain: "photography",
    title: "Wedding Photography Collections | Rosewood Studio",
    question: "how much does a wedding photographer cost",
    passages: [
      { heading: "Collections", text: "Our collections begin at $2,400 for six hours and $3,800 for full-day coverage with a second shooter." },
    ],
    expected: "answered",
  },
  {
    domain: "law",
    title: "Family Law Services and Fees | Harbourside Legal",
    question: "how much does it cost to hire a family lawyer",
    passages: [
      { heading: "Our fees", text: "Every family matter is different, so our fees depend on complexity. We discuss pricing during a free consultation tailored to your circumstances." },
    ],
    expected: "lexical",
  },
  {
    domain: "dentistry",
    title: "Meet Our Dentists | Northside Dental",
    question: "how much does teeth whitening cost",
    passages: [
      { heading: "Meet the team", text: "Our clinicians trained in Melbourne and Sydney and have served the community for eighteen years." },
    ],
    expected: "none",
  },
  {
    domain: "logistics",
    title: "International Shipping Rates | Meridian Freight",
    question: "what are your shipping rates to europe",
    passages: [
      { heading: "Rates", text: "European freight is charged at £4.20 per kilogram with a £35 minimum per consignment." },
    ],
    expected: "answered",
  },

  // ---- duration ----------------------------------------------------------
  {
    domain: "dentistry",
    title: "Root Canal Treatment Explained | Northside Dental",
    question: "how long does a root canal take",
    passages: [
      { heading: "The procedure", text: "Treatment is usually completed in 60 to 90 minutes, occasionally across two visits." },
    ],
    expected: "answered",
  },
  {
    domain: "construction",
    title: "Kitchen Renovation Services | Baxter Builders",
    question: "how long does a kitchen renovation take",
    passages: [
      { heading: "Timelines", text: "Renovation timelines vary considerably depending on the scope of works, material lead times and site access." },
    ],
    expected: "lexical",
  },
  {
    domain: "logistics",
    title: "Delivery Times and Coverage | Meridian Freight",
    question: "how long does delivery take to manila",
    passages: [
      { heading: "Delivery", text: "Metro Manila orders arrive in 2-3 business days; provincial addresses take 5-7 days." },
    ],
    expected: "answered",
  },

  // ---- steps -------------------------------------------------------------
  {
    domain: "accounting",
    title: "How to Register a Business in the Philippines | Ledger & Co",
    question: "how to register a business in the philippines",
    passages: [
      { heading: "Registration", text: "Step 1: reserve your business name with DTI. Step 2: secure barangay clearance. Step 3: file with the BIR for your TIN." },
    ],
    expected: "answered",
  },
  {
    domain: "fitness",
    title: "Strength Training for Beginners | Ironhouse Gym",
    question: "how to start strength training as a beginner",
    passages: [
      { heading: "Getting started", text: "Beginning a routine is a personal journey and our coaches will guide you through a programme suited to your goals." },
    ],
    expected: "lexical",
  },

  // ---- comparison --------------------------------------------------------
  {
    domain: "saas",
    title: "Compare Starter and Pro Plans | Tavo",
    question: "difference between the starter and pro plan",
    passages: [
      { heading: "Plans compared", text: "Starter includes 3 seats and 10GB storage, whereas Pro raises this to 25 seats and 500GB with priority support." },
    ],
    expected: "answered",
  },
  {
    domain: "insurance",
    title: "Term Life vs Whole Life Insurance | Ardent Cover",
    question: "term life vs whole life insurance which is better",
    passages: [
      { heading: "Choosing cover", text: "Both policy types have their place, and the right choice depends on your individual circumstances and goals." },
    ],
    expected: "lexical",
  },

  // ---- boolean -----------------------------------------------------------
  {
    domain: "veterinary",
    title: "Preparing Your Dog for Surgery | Willow Vets",
    question: "do i need to fast my dog before surgery",
    passages: [
      { heading: "Before surgery", text: "Yes, you should withhold food for 12 hours before the procedure. Water may remain available." },
    ],
    expected: "answered",
  },
  {
    domain: "fitness",
    title: "Creatine and Supplements Guide | Ironhouse Gym",
    question: "should i take creatine",
    passages: [
      { heading: "Supplements", text: "There are many considerations around supplementation, and individual responses differ across the population." },
    ],
    expected: "lexical",
  },

  // ---- definition --------------------------------------------------------
  {
    domain: "insurance",
    title: "What Is an Excess on Car Insurance? | Ardent Cover",
    question: "what is an excess on a car insurance policy",
    passages: [
      { heading: "Excess explained", text: "An excess is the amount you contribute toward a claim before the insurer pays the remainder." },
    ],
    expected: "answered",
  },
  {
    domain: "photography",
    title: "Fine Art Print Pricing | Rosewood Studio",
    question: "what is a first look session",
    passages: [
      { heading: "Print pricing", text: "Archival prints are available in 8x10 and 16x20 sizes with museum mounting." },
    ],
    expected: "none",
  },

  // ---- count -------------------------------------------------------------
  {
    domain: "events",
    title: "Venue Capacity and Floor Plans | The Old Mill",
    question: "how many guests can the venue hold",
    passages: [
      { heading: "Capacity", text: "The main hall seats 180 guests for a formal dinner or 250 standing." },
    ],
    expected: "answered",
  },

  // ---- entity ------------------------------------------------------------
  {
    domain: "restaurant",
    title: "Our Kitchen Team | Osteria Bianca",
    question: "who is the head chef",
    passages: [
      { heading: "Kitchen", text: "Our kitchen is led by head chef Marco Fontana, previously of Aria in Brisbane." },
    ],
    expected: "answered",
  },

  // ---- multi-section: the answer must be found beside the best match -----
  {
    domain: "dentistry",
    title: "Dental Implants | Northside Dental",
    question: "how much does a dental implant cost",
    passages: [
      { heading: "About implants", text: "An implant replaces the root of a missing tooth with a titanium post." },
      { heading: "Implant pricing", text: "A single implant is $4,500 including the crown and all follow-up appointments." },
      { heading: "Aftercare", text: "Brush twice daily and attend a review at six months." },
    ],
    expected: "answered",
  },
  {
    domain: "construction",
    title: "House Extensions | Baxter Builders",
    question: "how much does a house extension cost",
    passages: [
      { heading: "About extensions", text: "An extension adds floor area to your existing home, typically at the rear." },
      { heading: "Investment", text: "Extension costs depend on footprint, finishes and council requirements, so we quote each project individually." },
    ],
    expected: "lexical",
  },
];

/** Mirrors a stored page: the title plus every section. */
function pageOf(c: Case): Passage[] {
  return [{ heading: c.title, text: "" }, ...c.passages];
}

test("generalises across unrelated industries", () => {
  const results = CASES.map((c) => ({ ...c, actual: assessPassages(c.question, pageOf(c)).level }));

  const correct = results.filter((r) => r.actual === r.expected);
  const accuracy = correct.length / results.length;

  const byLabel = (label: CoverageLevel) => {
    const subset = results.filter((r) => r.expected === label);
    const hit = subset.filter((r) => r.actual === label).length;
    return { label, n: subset.length, hit, recall: subset.length ? hit / subset.length : 1 };
  };

  const report = [
    `\n  accuracy: ${correct.length}/${results.length} (${Math.round(accuracy * 100)}%)`,
    ...(["answered", "lexical", "none"] as CoverageLevel[]).map((l) => {
      const s = byLabel(l);
      return `  ${l.padEnd(9)} ${s.hit}/${s.n} recall ${Math.round(s.recall * 100)}%`;
    }),
    ...results
      .filter((r) => r.actual !== r.expected)
      .map((r) => `  MISS [${r.domain}] "${r.question}" expected ${r.expected}, got ${r.actual}`),
  ].join("\n");
  console.log(report);

  // A regression guard, not a target to tune to. Raise it deliberately.
  assert.ok(accuracy >= 0.75, `accuracy ${Math.round(accuracy * 100)}% fell below 75%${report}`);
  // The depth gap is the product's core signal — it must not collapse.
  assert.ok(byLabel("lexical").recall >= 0.6, `depth-gap recall too low${report}`);
});
