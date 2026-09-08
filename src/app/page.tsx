import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";

/**
 * The homepage.
 *
 * This route used to be `redirect("/dashboard")` and nothing else, from when AIRS was a
 * localhost-only tool with no front door. Now it is the front door — but only for people who are
 * not signed in. Someone with a session came here to work, so send them to the dashboard rather
 * than making them click past a sales page every time.
 *
 * The claims below are deliberately narrow. Every one of them is something the tool actually
 * produces, because the whole pitch is evidence rather than a score, and a homepage that
 * over-promises undermines exactly that.
 */
export default async function Home() {
  if (await currentUser()) redirect("/dashboard");

  return (
    <div>
      {/* Hero */}
      <section className="mx-auto max-w-4xl px-6 py-24 text-center">
        <p className="text-sm font-medium uppercase tracking-widest text-slate-400">
          AI search visibility
        </p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
          When someone asks an AI assistant who to hire, does your name come up?
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
          AIRS asks the questions your customers ask, records which businesses the assistant
          actually retrieves, and reads the pages it chose. You get the specific missing fact —
          not a score out of a hundred.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/contact"
            className="rounded-md bg-slate-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            Request an audit
          </Link>
          <Link
            href="/about"
            className="rounded-md border border-slate-300 px-6 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-slate-50"
          >
            How it works
          </Link>
        </div>
      </section>

      {/* The gates */}
      <section className="border-t border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <h2 className="text-center text-2xl font-semibold tracking-tight text-slate-900">
            Four things have to be true before an assistant will name you
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-slate-600">
            Most visibility tools measure the last one. The first is where the real failures are,
            and it is usually a single line in a file.
          </p>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: "1",
                title: "Crawlable",
                body: "The assistant's crawler is allowed to fetch your site at all. A robots.txt rule here makes everything below irrelevant.",
              },
              {
                n: "2",
                title: "Retrieved",
                body: "It pulls your page in while answering the question — not just the ones you rank for in ordinary search.",
              },
              {
                n: "3",
                title: "Quotable",
                body: "The page contains the actual answer: a figure, a timeframe, a yes or no. 'Contact us for a quote' is not an answer.",
              },
              {
                n: "4",
                title: "Preferred",
                body: "Given several sources that answer it, yours is the one worth citing.",
              },
            ].map((gate) => (
              <div
                key={gate.n}
                className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-white">
                  {gate.n}
                </span>
                <h3 className="mt-4 font-semibold text-slate-900">{gate.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{gate.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="mx-auto max-w-5xl px-6 py-20">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
          What an audit actually contains
        </h2>

        <div className="mt-10 grid gap-8 sm:grid-cols-3">
          {[
            {
              title: "The blocked-crawler check",
              body: "Read live, at the moment the report is made. One recent audit found eight AI platforms blocked — by a CDN default the owner did not know was on.",
            },
            {
              title: "The question your page does not answer",
              body: "Per question, per competitor: who answers it, who only mentions it, and the passage where the cited source stops short.",
            },
            {
              title: "The fix, written out",
              body: "A heading, the format the answer needs, and the fact that has to appear in it. Something you can hand to whoever edits the site.",
            },
          ].map((item) => (
            <div key={item.title}>
              <h3 className="font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Close */}
      <section className="border-t border-slate-200">
        <div className="mx-auto max-w-3xl px-6 py-20 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
            Want to see one for your market?
          </h2>
          <p className="mt-3 text-slate-600">
            Tell me the business and the city. I will send back the crawlability check and the
            three highest-value gaps.
          </p>
          <Link
            href="/contact"
            className="mt-8 inline-block rounded-md bg-slate-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            Get in touch
          </Link>
        </div>
      </section>
    </div>
  );
}
