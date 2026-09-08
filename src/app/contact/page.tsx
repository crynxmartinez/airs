"use client";

import { useState, useRef, useEffect } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";

/**
 * Contact form.
 *
 * Messages land in the database and are read at `/messages` behind the login. No captcha: it is
 * a stranger-trust feature that annoys real people, and a honeypot plus a timing check catches
 * the bots that bother with a form this small.
 */
export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", company: "", message: "" });
  const [website, setWebsite] = useState(""); // honeypot
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  /**
   * When the form was first shown.
   *
   * A submission arriving within two seconds of the form appearing was not typed by a person.
   * Cheaper than a captcha and invisible to anyone real.
   *
   * Set in an effect rather than as `useRef(Date.now())`, which React 19 rejects as an impure
   * call during render — and rightly: render can run more than once, so the "opened at" instant
   * would silently move.
   */
  const openedAt = useRef<number | null>(null);
  useEffect(() => {
    openedAt.current = Date.now();
  }, []);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    // A null ref means the effect has not run, so there is no measurement to judge by. Let it
    // through: refusing a real person because a timer did not start is the worse failure.
    if (openedAt.current !== null && Date.now() - openedAt.current < 2000) {
      setError("That was quick — give it a moment and try again.");
      return;
    }

    setStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, website }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not send that.");
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch {
      setError("Could not reach the server.");
      setStatus("idle");
    }
  }

  if (status === "sent") {
    return (
      <div className="mx-auto max-w-md px-6 py-28 text-center">
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight text-slate-900">Got it</h1>
        <p className="mt-3 text-slate-600">
          Thanks {form.name.split(" ")[0]} — I will come back to you at {form.email}.
        </p>
      </div>
    );
  }

  const field =
    "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

  return (
    <div className="mx-auto max-w-xl px-6 py-20">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-900">Get in touch</h1>
      <p className="mt-3 text-slate-600">
        Tell me the business and the city, and I will send back the crawlability check and the
        three highest-value gaps.
      </p>

      <form onSubmit={submit} className="mt-10 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">
              Your name
            </label>
            <input id="name" required value={form.name} onChange={set("name")} className={field} />
          </div>
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={form.email}
              onChange={set("email")}
              className={field}
            />
          </div>
        </div>

        <div>
          <label htmlFor="company" className="block text-sm font-medium text-slate-700">
            Business or website <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input id="company" value={form.company} onChange={set("company")} className={field} />
        </div>

        <div>
          <label htmlFor="message" className="block text-sm font-medium text-slate-700">
            What would you like to know?
          </label>
          <textarea
            id="message"
            required
            rows={6}
            value={form.message}
            onChange={set("message")}
            placeholder="e.g. I run an insurance brokerage in Brisbane and want to know whether AI assistants mention us."
            className={field}
          />
        </div>

        {/*
          Honeypot. Hidden from people and from screen readers, so nobody real can fill it in;
          a bot that fills every input will. `tabIndex={-1}` keeps it out of keyboard order.
        */}
        <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
          <label htmlFor="website">Website</label>
          <input
            id="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={status === "sending"}
          className="flex items-center justify-center gap-2 rounded-md bg-slate-900 px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:opacity-50"
        >
          {status === "sending" && <Loader2 className="h-4 w-4 animate-spin" />}
          {status === "sending" ? "Sending…" : "Send message"}
        </button>
      </form>
    </div>
  );
}
