/**
 * Sessions and accounts.
 *
 * There is no sign-up route. Accounts are made with `npm run create-user`, which only runs on a
 * machine that already holds the database credentials. A registration page is a door on the
 * public internet; this way the door does not exist, so it cannot be forced, rate-limited
 * around, or forgotten about after first use.
 *
 * Sessions are rows, not signed tokens. A JWT cannot be revoked before it expires — losing a
 * laptop would mean waiting it out. A row can be deleted, so `DELETE FROM sessions` ends every
 * login everywhere, immediately.
 *
 * **No `next/headers` in this file.** Reading the current request's cookie lives in
 * `session.ts`. Keeping it out matters for a concrete reason: `scripts/create-user.ts` imports
 * this module under plain `node`, where `next/headers` does not resolve at all — importing it
 * here made the account-creation command fail with `ERR_MODULE_NOT_FOUND` before it ran a line.
 * Logic and database work here; request-scoped glue next door.
 */

import { query, queryOne, run, generateId } from "@/lib/db";
import {
  generateSessionToken,
  hashPassword,
  normaliseEmail,
  verifyPassword,
} from "@/lib/password";

export const SESSION_COOKIE = "airs_session";

/** 30 days. Long enough not to be a nuisance for one operator, short enough to expire if leaked. */
const SESSION_DAYS = 30;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
}

/**
 * `YYYY-MM-DD HH:MM:SS` — the text-timestamp shape every other table in this schema uses.
 *
 * Every timestamp in this database is TEXT, not a real `timestamptz` (see the Postgres audit
 * note in AGENTS.md). That is workable here because this format sorts chronologically as a
 * string, so `expires_at > ?` is a correct comparison rather than a lucky one.
 *
 * **UTC, and it must stay UTC.** The schema's own defaults use `to_char(NOW(), ...)`, which is
 * the *database server's* local time. So `created_at` and the values written here can be in
 * different zones. That is tolerable only because expiry compares values this function wrote
 * against a "now" this function also produced — one clock, start to finish. Comparing
 * `expires_at` against a column filled by a schema default would be wrong by the offset between
 * them, silently, and only for people in the wrong timezone.
 */
function sqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

/**
 * Create an account. Used by `scripts/create-user.ts`, never by an HTTP route.
 *
 * Returns an error string rather than throwing on a duplicate, because the caller is a CLI and
 * "that email already has an account" is information, not a crash.
 */
export async function createUser(
  email: string,
  password: string,
  name?: string
): Promise<{ id: string } | { error: string }> {
  const normalised = normaliseEmail(email);
  if (!normalised.includes("@")) return { error: "That does not look like an email address." };

  const existing = await queryOne<{ id: string }>(
    "SELECT id FROM users WHERE LOWER(email) = ?",
    [normalised]
  );
  if (existing) return { error: `${normalised} already has an account.` };

  const id = generateId();
  await run(
    "INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)",
    [id, normalised, await hashPassword(password), name ?? null]
  );
  return { id };
}

/**
 * Check an email and password, and start a session if they match.
 *
 * Deliberately gives the caller one undifferentiated failure. Saying "no such account" tells an
 * attacker which addresses are worth guessing passwords for, and with a handful of accounts that
 * is most of the work.
 *
 * A missing user still runs a hash comparison against a dummy value. Returning early would make
 * "unknown email" measurably faster than "wrong password" and leak the same fact the wording is
 * careful not to.
 */
export async function login(
  email: string,
  password: string,
  userAgent?: string
): Promise<{ token: string; user: SessionUser } | { error: string }> {
  const normalised = normaliseEmail(email);

  const user = await queryOne<{ id: string; email: string; name: string | null; password_hash: string }>(
    "SELECT id, email, name, password_hash FROM users WHERE LOWER(email) = ?",
    [normalised]
  );

  const stored =
    user?.password_hash ??
    // A well-formed hash of nothing anyone knows, so the comparison costs the same either way.
    "00000000000000000000000000000000:" + "0".repeat(128);

  const ok = await verifyPassword(password, stored);
  if (!user || !ok) return { error: "Email or password is incorrect." };

  const token = generateSessionToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);

  await run(
    "INSERT INTO sessions (id, user_id, expires_at, user_agent) VALUES (?, ?, ?, ?)",
    [token, user.id, sqlTimestamp(expires), userAgent?.slice(0, 300) ?? null]
  );
  await run("UPDATE users SET last_login_at = ? WHERE id = ?", [sqlTimestamp(new Date()), user.id]);

  // Opportunistic cleanup: expired rows are dead weight and this is the only write path that
  // runs often enough to matter. Cheap, and it means no scheduled job to forget about.
  await run("DELETE FROM sessions WHERE expires_at < ?", [sqlTimestamp(new Date())]);

  return { token, user: { id: user.id, email: user.email, name: user.name } };
}

/**
 * The user for a session token, or null.
 *
 * Expiry is checked in the query rather than in JavaScript so a stale row can never authenticate
 * anyone, even if the cleanup above has not run.
 */
export async function userForToken(token: string | undefined): Promise<SessionUser | null> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return null;

  const row = await queryOne<{ id: string; email: string; name: string | null }>(
    `SELECT u.id, u.email, u.name
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = ? AND s.expires_at > ?`,
    [token, sqlTimestamp(new Date())]
  );
  return row ?? null;
}

/** End one session. */
export async function logout(token: string | undefined): Promise<void> {
  if (!token) return;
  await run("DELETE FROM sessions WHERE id = ?", [token]);
}

/** End every session for a user — the "I lost my laptop" button. */
export async function logoutEverywhere(userId: string): Promise<number> {
  const result = await run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  return result.changes;
}

/** How many accounts exist. Used by the CLI to warn before adding a second one. */
export async function userCount(): Promise<number> {
  const rows = await query<{ n: number }>("SELECT COUNT(*)::int AS n FROM users");
  return rows[0]?.n ?? 0;
}

/**
 * Cookie options for the session.
 *
 * `httpOnly` keeps page scripts from reading it, so an injected script cannot lift the session.
 * `sameSite: lax` stops another site from making authenticated requests on your behalf while
 * still surviving an ordinary link click. `secure` only outside development, because localhost
 * is plain HTTP and a secure cookie there is simply never sent — which looks exactly like a
 * broken login.
 */
export function sessionCookieOptions(maxAgeSeconds = SESSION_DAYS * 86_400) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
