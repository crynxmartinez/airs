import Link from "next/link";

/**
 * About.
 *
 * Written as method rather than biography. The differentiator is not who runs it — it is that
 * every claim traces back to a database row or a live page, which is checkable in a way a score
 * is not. Says what the tool cannot do as well, because a page that only claims strengths reads
 * like every other vendor page and earns no trust.
 */
export const metadata = {
  title: "About — AIRS",
  description: "How AIRS measures AI search visibility, and what it cannot measure.",
};

export default function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">
        Evidence, not a score
      </h1>

      <div className="mt-8 space-y-6 text-base leading-relaxed text-slate-700">
        <p>
          Most AI-visibility tools give you a number out of a hundred. A number tells you
          something is wrong; it does not tell you what to change on Tuesday morning. AIRS is
          built the other way round: every finding names the missing fact and points at the page
          where a competitor supplied it.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">How it works</h2>
        <p>
          It starts with the questions a buyer actually types — how much something costs, who is
          best in a city, whether a service is worth using. Each one is put to an AI assistant
          with live web search, and the sources it pulls in are recorded. Those sources are your
          real competitors in AI search, which is often not the same list as the businesses you
          think you compete with.
        </p>
        <p>
          Then every one of those pages is read, and each question is graded three ways: the page
          answers it, mentions it without answering, or is silent. That middle verdict is the
          useful one. A page that says &ldquo;contact us for a quote&rdquo; on a pricing question
          is not missing the topic — it is missing the number, and that is a much smaller fix
          than it sounds.
        </p>
        <p>
          Nothing is asserted that cannot be checked. Every prevalence figure states the number
          it was computed over, every quote comes from a stored passage, and the crawlability
          check is fetched live at the moment the report is made — because that is the one finding
          a client may already have acted on.
        </p>

        <h2 className="pt-4 text-xl font-semibold text-slate-900">What it cannot tell you</h2>
        <p>
          The assistant returns the sources it retrieved, not which of them it quoted in its
          answer. That distinction is not recoverable, so nothing here claims it. When a report
          says &ldquo;retrieved&rdquo;, it means retrieved.
        </p>
        <p>
          Answers also vary between runs. A business that shows up once might not show up again,
          which is why questions are asked several times and the report says &ldquo;retrieved in
          two of three runs&rdquo; rather than pretending one observation is a fact.
        </p>
        <p>
          And no audit can promise a citation. What it can do is remove the specific reasons you
          are not getting one.
        </p>
      </div>

      <div className="mt-12 rounded-xl border border-slate-200 bg-slate-50 p-6">
        <h2 className="font-semibold text-slate-900">Want one for your market?</h2>
        <p className="mt-2 text-sm text-slate-600">
          Tell me the business and the city.
        </p>
        <Link
          href="/contact"
          className="mt-4 inline-block rounded-md bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700"
        >
          Get in touch
        </Link>
      </div>
    </div>
  );
}
