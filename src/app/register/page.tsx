"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, KeyRound } from "lucide-react";

/**
 * Create an account.
 *
 * **Deliberately unlinked.** Nothing navigates here — not the marketing nav, not the login page,
 * not the sidebar. You reach it by typing the address. It also renders with no navigation of its
 * own, so it is not a route back into the rest of the site either.
 *
 * That is not security by itself — an unlinked page is still a public URL, and the setup key is
 * what actually protects it. But being unlinked means it is never crawled, never indexed, and
 * never something a visitor stumbles onto and starts guessing at.
 *
 * No "sign in instead" link, on purpose: this page should not advertise where the front door is.
 */
export default function RegisterPage() {
  const [form, setForm] = useState({ token: "", email: "", password: "", name: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Could not create the account.");
        setBusy(false);
        return;
      }
      setCreated(data.email);
    } catch {
      setError("Could not reach the server.");
      setBusy(false);
    }
  }

  const field =
    "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900";

  if (created) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <CheckCircle2 className="mx-auto h-10 w-10 text-green-600" />
          <h1 className="mt-5 text-xl font-semibold text-slate-900">Account created</h1>
          <p className="mt-2 text-sm text-slate-600">
            <span className="font-medium text-slate-900">{created}</span> can now sign in.
          </p>
          {/* A plain address rather than a link. This page does not navigate anywhere. */}
          <p className="mt-6 text-xs text-slate-400">Sign in at /login</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-slate-400" />
          <h1 className="text-xl font-semibold text-slate-900">Create an account</h1>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Private page. Requires the setup key from <code className="text-slate-700">.env.local</code>.
        </p>

        <form onSubmit={submit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="token" className="block text-sm font-medium text-slate-700">
              Setup key
            </label>
            <input
              id="token"
              type="password"
              autoComplete="off"
              required
              value={form.token}
              onChange={set("token")}
              className={`${field} font-mono`}
            />
            <p className="mt-1 text-xs text-slate-400">
              The <code>SIGNUP_TOKEN</code> line in <code>.env.local</code>.
            </p>
          </div>

          <hr className="border-slate-200" />

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-700">
              Name <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input id="name" value={form.name} onChange={set("name")} className={field} />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="off"
              required
              value={form.email}
              onChange={set("email")}
              className={field}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={form.password}
              onChange={set("password")}
              className={field}
            />
            <p className="mt-1 text-xs text-slate-400">
              At least 12 characters. A long phrase beats a short complicated one.
            </p>
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
            disabled={busy || !form.token || !form.email || !form.password}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {busy ? "Creating…" : "Create account"}
          </button>

          <p className="text-center text-xs text-slate-400">
            Every account has full access. There are no roles.
          </p>
        </form>
      </div>
    </div>
  );
}
