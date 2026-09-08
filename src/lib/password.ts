/**
 * Password hashing and session-token generation. Pure — no database, so it is testable.
 *
 * Same split as `grid-score.ts` vs `grid.ts` and `brief-format.ts` vs `briefs.ts`: `db.ts`
 * cannot be imported under bare `node --test`, and this is exactly the code that must be tested.
 *
 * **scrypt, from `node:crypto`.** Not bcrypt, not argon2. Both need a compiled native binary,
 * and this project has already been bitten by that: `better-sqlite3` had to be removed because
 * Windows Smart App Control blocked its unsigned prebuilt `.node` file with `ERR_DLOPEN_FAILED`,
 * at which point nothing ran at all. scrypt ships inside Node, is memory-hard by design, and
 * cannot fail that way on any machine where Node itself starts.
 */

import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

/**
 * `promisify` erases scrypt's options overload, so the cost parameters below would be dropped
 * silently and every hash would use Node's weak defaults. Hence the explicit signature.
 */
const scryptAsync = promisify(scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: ScryptOptions
) => Promise<Buffer>;

/**
 * scrypt cost parameters.
 *
 * N=2^15 with r=8 needs roughly 32 MB per hash and lands around 100ms on ordinary hardware —
 * unnoticeable when one person logs in, and expensive enough that offline guessing against a
 * stolen hash is slow. `maxmem` has to be raised explicitly because Node's default cap is 32 MB
 * and N=2^15 sits right at it; without this, hashing throws instead of being slow.
 */
const SCRYPT_N = 32768;
const SCRYPT_r = 8;
const SCRYPT_p = 1;
const KEY_BYTES = 64;
const SALT_BYTES = 16;
const MAX_MEM = 128 * SCRYPT_N * SCRYPT_r * 2;

/** Guard against a pathological input being used to burn server memory and time. */
export const MAX_PASSWORD_LENGTH = 256;
export const MIN_PASSWORD_LENGTH = 12;

/**
 * Hash a password for storage. Returns `salt:hash`, both hex.
 *
 * A fresh random salt per password means two people choosing the same password still get
 * different hashes, so one cracked hash reveals nothing about the other.
 */
export async function hashPassword(password: string): Promise<string> {
  if (password.length > MAX_PASSWORD_LENGTH) {
    throw new Error(`Password longer than ${MAX_PASSWORD_LENGTH} characters`);
  }
  const salt = randomBytes(SALT_BYTES);
  const derived = (await scryptAsync(password, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
    maxmem: MAX_MEM,
  }));
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Check a password against a stored `salt:hash`.
 *
 * Comparison is `timingSafeEqual`, never `===`. String comparison returns as soon as it finds a
 * differing byte, so the time it takes leaks how much of the hash was correct — enough,
 * measured over many attempts, to reconstruct it a byte at a time.
 *
 * Returns false rather than throwing on a malformed stored value. A corrupt row should fail the
 * login, not crash the route and reveal a stack trace.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (typeof password !== "string" || typeof stored !== "string") return false;
  if (password.length > MAX_PASSWORD_LENGTH) return false;

  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(saltHex, "hex");
    expected = Buffer.from(hashHex, "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length !== KEY_BYTES) return false;

  const derived = (await scryptAsync(password, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_r,
    p: SCRYPT_p,
    maxmem: MAX_MEM,
  }));

  return timingSafeEqual(derived, expected);
}

/**
 * A session token: 32 bytes from the OS random source, hex.
 *
 * **Deliberately not `generateId()` from `db.ts`.** That builds 16 hex characters out of
 * `Math.random()`, which is fine for a row id nobody guesses at and unusable here — it is
 * seeded predictably and its output can be reconstructed from a few observed values. A forged
 * session token is a full login. This is the one place in the codebase where the random source
 * is load-bearing.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Whether a password is acceptable, and why not if it is not.
 *
 * Length only, with no character-class rules. Composition requirements push people toward
 * `Passw0rd!` — short, predictable, and technically compliant — while a long passphrase is both
 * easier to remember and harder to guess. NIST dropped the composition advice for this reason.
 */
export function checkPasswordStrength(password: string): { ok: boolean; reason?: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: `Use at most ${MAX_PASSWORD_LENGTH} characters.` };
  }
  if (/^(.)\1*$/.test(password)) {
    return { ok: false, reason: "Not a single repeated character." };
  }
  return { ok: true };
}

/** Normalised email — the login key. Lowercased and trimmed so casing never splits an account. */
export function normaliseEmail(email: string): string {
  return String(email ?? "").trim().toLowerCase();
}
