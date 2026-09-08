import { NextRequest, NextResponse } from "next/server";
import { login, sessionCookieOptions, SESSION_COOKIE } from "@/lib/auth";

/**
 * POST /api/auth/login — `{ email, password }`.
 *
 * The only route that can create a session. There is no sign-up counterpart: accounts come from
 * `npm run create-user`, which runs on a machine that already has the database credentials.
 */

/**
 * Failed attempts per IP per window.
 *
 * In-process and therefore per-server-instance — it resets on restart and does not span
 * replicas. That is a real limitation and still worth having: with a handful of accounts, any
 * burst of failures is someone guessing, and 10 tries a minute makes that pointless. A shared
 * store would be the upgrade if this ever runs on more than one instance.
 */
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    // Bound the map so a flood of spoofed addresses cannot grow it without limit.
    if (attempts.size > 10_000) {
      for (const [key, value] of attempts) if (now > value.resetAt) attempts.delete(key);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "local";

  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429 }
    );
  }

  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const result = await login(email, password, req.headers.get("user-agent") ?? undefined);

  // 401 with the same wording whether the email is unknown or the password is wrong. Telling
  // them apart hands an attacker a list of which addresses are worth attacking.
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 401 });
  }

  const response = NextResponse.json({ user: result.user });
  response.cookies.set(SESSION_COOKIE, result.token, sessionCookieOptions());
  return response;
}
