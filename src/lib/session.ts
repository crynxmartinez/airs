import { cookies } from "next/headers";
import { cache } from "react";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, userForToken, type SessionUser } from "@/lib/auth";

/**
 * Reading the session for the current request — the Data Access Layer the Next docs recommend.
 *
 * Separate from `auth.ts` because this imports `next/headers`, which only exists inside a Next
 * request. `scripts/create-user.ts` imports `auth.ts` under plain `node`, and having these two
 * in one file broke that script outright.
 *
 * The docs are explicit that Proxy should not be the only line of defence: "the majority of
 * security checks should be performed as close as possible to your data source". `proxy.ts` is
 * the gate; these are the checks next to the data.
 */

/**
 * The signed-in user, or null.
 *
 * Wrapped in React's `cache` so several server components in one render share a single database
 * lookup instead of each making their own. Per-request, not a cross-request cache — a signed-out
 * user never sees a cached signed-in result.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const store = await cookies();
  return userForToken(store.get(SESSION_COOKIE)?.value);
});

/**
 * The signed-in user, or redirect to the login page.
 *
 * For pages. `proxy.ts` should already have caught this, so reaching the redirect means either
 * the proxy matcher missed the route or the proxy is not running — which is exactly the case
 * worth surviving, because it is silent otherwise.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

/**
 * The signed-in user, or null, for API routes that must not redirect.
 *
 * Used by the handlers that spend money. `proxy.ts` covers them already; this is the second
 * lock, because the proxy is one config edit away from not running and the cost of that edit
 * should not be an API bill.
 */
export async function apiUser(): Promise<SessionUser | null> {
  return currentUser();
}
