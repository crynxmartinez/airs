import Link from "next/link";
import { publicMetadata } from "@/lib/seo";
export const metadata = publicMetadata("About AIRS CRM | From Competitor Research to Action", "Learn how AIRS uses AI search discovery and page analysis to find competitor weaknesses, build content briefs, and track website improvements.", "/about");
export default function AboutPage() {
  return <article className="mx-auto max-w-3xl px-6 py-20 text-slate-900">
    <p className="text-sm font-medium uppercase tracking-widest text-emerald-800">About AIRS CRM</p>
    <h1 className="mt-5 text-4xl font-semibold tracking-tight">Better website decisions start with understanding the competition.</h1>
    <div className="mt-8 space-y-6 text-base leading-8 text-slate-700">
      <p>AIRS helps business owners and agencies find weaknesses in competing pages and turn those findings into practical website improvements. You can see what your own pages do well, what customers still need to know, and where to focus next.</p>
      <h2 className="pt-5 text-2xl font-semibold text-slate-900">Competitor analysis for AI search</h2>
      <p>Start with your website, target market, and customer questions. AIRS uses AI web search to discover up to 10 competing sources. These may include businesses, directories, and information pages. The field depends on the questions and the search run.</p>
      <h2 className="pt-5 text-2xl font-semibold text-slate-900">Find the missing answers</h2>
      <p>AIRS reads available pages and uses its own scoring and coverage rules to assess their answers. A page may answer a question clearly, mention it without enough detail, or leave it unanswered. Stored page evidence helps you review those findings.</p>
      <p>This content gap analysis focuses on useful customer information, such as costs, service inclusions, timelines, and next steps. Your website is part of the comparison too.</p>
      <h2 className="pt-5 text-2xl font-semibold text-slate-900">Turn research into a content improvement plan</h2>
      <p>Evaluations bring the comparisons together. Coverage highlights questions to address. Content briefs suggest what a page should include, and missions organise the work into tasks. Your team supplies accurate business facts and publishes the changes.</p>
      <h2 className="pt-5 text-2xl font-semibold text-slate-900">Check progress with competitor benchmarking</h2>
      <p>Run the analysis again to compare saved results. Benchmarks help you see gaps closed, answers lost, and changes among competitors. Your dashboard shows the current snapshot.</p>
      <h2 className="pt-5 text-2xl font-semibold text-slate-900">What the findings can tell you</h2>
      <p>AI search results vary. A retrieved page is not automatically a cited or recommended source. Missing page access limits the evidence, and automated findings should be reviewed in the context of the business.</p>
      <p>These practices support work often called answer engine optimization (AEO) or generative engine optimization (GEO). AIRS provides a direction for improving content; it does not guarantee rankings, citations, or more enquiries.</p>
    </div>
    <div className="mt-12 flex flex-wrap gap-5"><Link href="/contact" className="rounded-md bg-slate-900 px-6 py-3 font-medium text-white">Request an analysis</Link><Link href="/#comparison" className="px-2 py-3 font-medium text-emerald-800">See an example comparison →</Link></div>
  </article>;
}
