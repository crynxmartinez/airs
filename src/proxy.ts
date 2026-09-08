import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { userForToken } from "@/lib/auth";

/**
 * The gate. Everything is closed unless it is on the list below.
 *
 * **This file is `proxy.ts`, not `middleware.ts`.** Next.js 16 renamed the convention; the
 * behaviour is the same. A `middleware.ts` here would simply never run, which is the worst
 * possible failure for a file whose job is access control — the app would look protected and be
 * wide open.
 *
 * ## Why this does a real database check
 *
 * The Next docs advise keeping Proxy to "optimistic checks" — read the cookie, do not touch the
 * database — because Proxy runs on every request including prefetches. That advice is about
 * performance, and it assumes a signed cookie that can be verified without I/O.
 *
 * Here the session cookie is an opaque random token, so there is nothing to verify offline: the
 * only way to know a token is real is to look it up. Stopping at "a cookie is present" would
 * mean anyone who sets `airs_session` to 64 arbitrary hex characters walks past this gate, and
 * then only the routes that happen to re-check would stop them. There are 50 API routes.
 *
 * Two things make the cost acceptable:
 *
 *   1. **Anonymous traffic never reaches the database.** No cookie, or a wrong-shaped one, is
 *      rejected on the spot. That is every prefetch, every bot, every drive-by.
 *   2. **A valid session costs one indexed primary-key lookup.** For one operator and a few
 *      invited people, that is not a load problem.
 *
 * As Next 16 runs Proxy on the Node.js runtime by default, `pg` works here. On the old Edge
 * runtime it would not have, and this design would have been impossible.
 *
 * Belt and braces: the routes that spend money re-check the session themselves. This file is one
 * config edit away from not running, and the cost of that edit should not be a bill.
 */

/**
 * Open to the world. An allowlist, deliberately — a blocklist fails open, and it fails silently
 * the moment somebody adds a route and forgets to list it.
 */
const PUBLIC_PAGES = new Set([
  "/",
  "/about",
  "/contact",
  "/login",
  // Unlinked, but still a public URL — it has to be, because you cannot be signed in while
  // creating the account you would sign in with. Its `SIGNUP_TOKEN` is the lock, not this list.
  "/register",
]);

/** Public API: the login attempt itself, and the contact form. Nothing else. */
const PUBLIC_API = new Set([
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/me",
  "/api/auth/register",
  "/api/contact",
]);

/** A session token is 32 random bytes as hex. Anything else cannot be one. */
const TOKEN_SHAPE = /^[0-9a-f]{64}$/;

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PAGES.has(pathname) || PUBLIC_API.has(pathname)) {
    const response = NextResponse.next();
    if (!["/", "/about", "/contact"].includes(pathname)) response.headers.set("X-Robots-Tag", "noindex, nofollow");
    return response;
  }

  const isApi = pathname.startsWith("/api/");
  const token = req.cookies.get(SESSION_COOKIE)?.value;

  // The cheap path. No database, no await — this is where all unauthenticated traffic ends.
  if (!token || !TOKEN_SHAPE.test(token)) return deny(req, isApi);

  const user = await userForToken(token);
  if (!user) {
    // Well-formed but not real, or expired. Clear it so the browser stops sending a dead token
    // on every subsequent request.
    const response = deny(req, isApi);
    response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
    return response;
  }

  const response = NextResponse.next();
  response.headers.set("X-Robots-Tag", "noindex, nofollow");
  return response;
}

/**
 * How a refusal looks.
 *
 * An API gets JSON with 401. It must not get a redirect: a `fetch()` handed a login page as HTML
 * will try to `JSON.parse` it and fail with a syntax error that says nothing about
 * authentication, a long way from the actual cause.
 *
 * A page gets a redirect to the login screen, carrying where it was headed so the login can
 * return there.
 */
function deny(req: NextRequest, isApi: boolean): NextResponse {
  if (isApi) {
    return NextResponse.json(
      { error: "Not signed in.", code: "unauthenticated" },
      { status: 401 }
    );
  }

  const login = new URL("/login", req.nextUrl.origin);
  const from = req.nextUrl.pathname + req.nextUrl.search;
  if (from !== "/") login.searchParams.set("next", from);
  return NextResponse.redirect(login);
}

/**
 * Everything except Next's own internals and static files.
 *
 * The negative lookahead is what keeps `/_next/static`, the favicon and images out — running a
 * session check for every stylesheet would be pure waste. Nothing in the matcher decides *what*
 * is protected; that is the allowlist above. This only decides what is worth looking at.
 */
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|css|js|woff|woff2|ttf)$).*)"],
};
