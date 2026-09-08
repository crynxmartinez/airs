"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Search, Mail, LogOut, Loader2 } from "lucide-react";

interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

export function TopBar() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setUser(d.user ?? null))
      .catch(() => {});
  }, []);

  async function signOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});

    // A full page load, same reasoning as the login page. `router.refresh()` followed by
    // `router.push()` did not navigate at all here either — it left you on the page you had just
    // signed out of, still showing data, which is a far worse bug than a slow redirect. A hard
    // navigation also drops every cached server render made while signed in, and there is no
    // reason to preserve any of it.
    window.location.assign("/login");
  }

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--card-border)] bg-white px-6">
      {/* Search */}
      <div className="relative w-full max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search evaluations..."
          className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-10 pr-4 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Right Actions */}
      <div className="flex items-center gap-3">
        {/*
          Replaces the old bell, which was a button that did nothing. Contact-form messages are
          stored rather than emailed, so this link is the only way anyone finds out one arrived.
        */}
        <Link
          href="/messages"
          title="Contact messages"
          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          <Mail className="h-5 w-5" />
        </Link>

        <div className="h-6 w-px bg-slate-200" />

        {user ? (
          <>
            <span className="text-sm font-medium text-slate-600" title={user.email}>
              {user.name || user.email}
            </span>
            <button
              onClick={signOut}
              disabled={signingOut}
              title="Sign out"
              className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
            >
              {signingOut ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogOut className="h-4 w-4" />
              )}
            </button>
          </>
        ) : (
          // Placeholder rather than nothing, so the bar does not visibly reflow once /me answers.
          <span className="text-sm font-medium text-slate-400">…</span>
        )}
      </div>
    </header>
  );
}
