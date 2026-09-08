"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";

/**
 * The sign-in form.
 *
 * Split out of `page.tsx` so it can sit inside a `<Suspense>` boundary. `useSearchParams()`
 * forces client-side rendering of everything up to the nearest boundary, and without one the
 * production build fails outright:
 *
 *     useSearchParams() should be wrapped in a suspense boundary at page "/login"
 *
 * It passed every check in development because dev renders routes on demand, so
 * `useSearchParams` never suspends there. Only `next build` catches it — which is the lesson:
 * a page using search params is not verified until it has been through a production build.
 */
export function LoginForm() {
  const params = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /**
   * Where to go after signing in.
   *
   * `next` comes from the proxy redirect, so it is attacker-controllable in a link. Only
   * same-site paths are accepted — without the check, `?next=https://evil.example` would make
   * this page a redirect that borrows the trust of your domain, which is how phishing links get
   * their credibility.
   */
  function destination(): string {
    const next = params.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) return next;
    return "/dashboard";
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not sign in.");
        setBusy(false);
        return;
      }

      // A full page load, not `router.push`.
      //
      // `router.refresh()` followed by `router.push()` was the obvious version and it does not
      // work: the refresh re-renders the current route and the push is lost, so a correct
      // password left you sitting on the login page with no error — the worst kind of failure,
      // because it looks like the password was wrong.
      //
      // A hard navigation is also the right thing on its own merits. The session cookie changes
      // what every server component renders, and this guarantees the whole app re-renders with
      // it rather than reusing a client router cache populated while signed out. It happens once
      // per session, so a full reload costs nothing that matters.
      window.location.assign(destination());
    } catch {
      setError("Could not reach the server. Is it running?");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
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
        disabled={busy || !email || !password}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {busy ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
