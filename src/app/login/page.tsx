import { Suspense } from "react";
import { LoginForm } from "./login-form";

/**
 * Sign in.
 *
 * A server component, so the heading below is real prerendered HTML. The form is a client
 * component inside a `<Suspense>` boundary because it calls `useSearchParams()` to read the
 * `?next=` the proxy adds — search params are only known per request, so anything using them
 * cannot be prerendered.
 *
 * Without the boundary, `next build` fails with "useSearchParams() should be wrapped in a
 * suspense boundary at page /login". Development never shows it: dev renders routes on demand,
 * so `useSearchParams` does not suspend there and the page appears to work perfectly.
 *
 * There is no "create account" link and no "forgot password" link, because neither exists.
 * Accounts come from `npm run create-user` or the unlinked `/register` page; a lost password
 * means deleting the row and making a new account. A link that goes nowhere would be worse than
 * no link.
 */
export const metadata = {
  title: "Sign in — AIRS",
};

export default function LoginPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col justify-center px-6 py-20">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">AIRS is invite-only. There is no public sign-up.</p>

      {/*
        The fallback mirrors the form's own height so the page does not jump when the real form
        replaces it. It is visible for a moment on first load, so it should not look like an
        error or an empty page.
      */}
      <Suspense
        fallback={
          <div className="mt-8 space-y-4" aria-busy="true">
            <div className="h-16 rounded-md bg-slate-100" />
            <div className="h-16 rounded-md bg-slate-100" />
            <div className="h-10 rounded-md bg-slate-200" />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </div>
  );
}
