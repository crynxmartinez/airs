import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createUser } from "@/lib/auth";
import { checkPasswordStrength } from "@/lib/password";

/**
 * POST /api/auth/register — `{ token, email, password, name? }`.
 *
 * The private account-creation route behind `/register`. `npm run create-user` remains the
 * safer path and still exists; this is the browser equivalent for when a terminal is not to
 * hand.
 *
 * ## The token is the only lock, and that is a change worth knowing about
 *
 * The original plan had two locks: a secret token *and* a rule that the route only works while
 * zero accounts exist — the second being the good one, because it disables itself and cannot be
 * forgotten. That is no longer available: an account already exists, so the rule would make this
 * route permanently dead.
 *
 * So `SIGNUP_TOKEN` carries the whole weight. It is 24 random bytes, which is not guessable, but
 * it does not expire and it does not disable itself. Two consequences:
 *
 *   - **Treat it like a password.** Anyone holding it can create an account with full access.
 *   - **Rotate it by editing `.env.local` and restarting.** Worth doing after the site is public,
 *     and any time the value has been somewhere it should not be.
 *
 * If the token is unset the route returns 503 rather than accepting anything. Failing closed
 * matters most in the case where configuration is missing.
 */

/** Attempts per IP per window. The token cannot be brute-forced, but there is no reason to allow trying. */
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 600_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    if (attempts.size > 5_000) {
      for (const [key, value] of attempts) if (now > value.resetAt) attempts.delete(key);
    }
    return false;
  }

  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

/**
 * Constant-time token comparison.
 *
 * `a === b` on strings returns as soon as it finds a differing character, so the time it takes
 * leaks how many leading characters were right — which is enough, over many attempts, to recover
 * the token one character at a time. Lengths are compared first because `timingSafeEqual` throws
 * on mismatched buffers, and length alone is not a useful thing to learn.
 */
function tokenMatches(supplied: string, expected: string): boolean {
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.SIGNUP_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { error: "Registration is not configured on this server." },
      { status: 503 }
    );
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "local";

  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
  }

  let body: { token?: unknown; email?: unknown; password?: unknown; name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  if (!tokenMatches(token, expected)) {
    // No hint about whether the token was close, wrong length, or missing.
    return NextResponse.json({ error: "Invalid setup key." }, { status: 403 });
  }

  const email = typeof body.email === "string" ? body.email : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : undefined;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }

  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    return NextResponse.json({ error: strength.reason }, { status: 400 });
  }

  const result = await createUser(email, password, name);
  if ("error" in result) {
    // A duplicate-email message is safe here: the caller already proved they hold the token.
    return NextResponse.json({ error: result.error }, { status: 409 });
  }

  // Deliberately does *not* sign the new account in. Creating an account and using one are
  // separate acts, and auto-login would mean this route could hand out a session — a much bigger
  // thing to get wrong than a row in a table.
  return NextResponse.json({ created: true, email });
}
