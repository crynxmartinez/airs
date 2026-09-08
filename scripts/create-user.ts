/**
 * Create a login. `npm run create-user`
 *
 * This exists instead of a `/register` page. A registration route on the public internet is a
 * door — it needs a secret, a rate limit, and a rule that disables it after first use, and each
 * of those is a thing that can be got wrong. This command can only be run by someone who already
 * holds the database credentials, which is a stronger guarantee than all three.
 *
 *   npm run create-user -- --email you@example.com --name "Your Name"
 *   npm run create-user -- --email guest@agency.com --password "long passphrase here"
 *
 * With no `--password`, one is generated and printed. That is the better default: a generated
 * passphrase beats one chosen under mild pressure, and it never lands in shell history the way
 * `--password` does.
 *
 * ## Why this talks to Postgres directly instead of importing `auth.ts`
 *
 * `auth.ts` imports its dependencies through the `@/` path alias, which Next resolves and bare
 * `node` does not — importing it here fails with `Cannot find package '@/lib'` before the script
 * runs a line. Rather than bolt a module-resolution hook onto the CLI, this owns its one INSERT
 * and imports `password.ts`, which is pure and alias-free.
 *
 * The duplication is a single INSERT statement. The part that must not be duplicated — hashing,
 * salting, email normalisation — is shared, so the CLI cannot drift into writing a password the
 * login route cannot read.
 */

import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import {
  checkPasswordStrength,
  hashPassword,
  normaliseEmail,
} from "../src/lib/password.ts";

/**
 * Load `.env.local` by hand.
 *
 * A script run through `node` never goes through Next, so nothing has populated
 * `process.env.DATABASE_URL`. Without this the first query fails with "DATABASE_URL is not set",
 * which reads like a missing config rather than a missing loader.
 */
function loadEnv(): void {
  try {
    for (const line of readFileSync(".env.local", "utf-8").split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  } catch {
    // No .env.local is fine when the variables are already in the environment.
  }
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index !== -1 ? process.argv[index + 1] : undefined;
}

/** Row id, matching `generateId()` in `db.ts`: 16 hex characters. */
function rowId(): string {
  return randomBytes(8).toString("hex");
}

/**
 * A readable passphrase: six random four-character chunks.
 *
 * From `randomBytes`, not `Math.random()` — the point is that nobody can reproduce it.
 * Hyphenated because a person types this at least once.
 */
function generatePassphrase(): string {
  return Array.from({ length: 6 }, () => randomBytes(2).toString("hex")).join("-");
}

async function main(): Promise<void> {
  loadEnv();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set. Add it to .env.local first.");
    process.exit(1);
  }

  const email = arg("email");
  if (!email) {
    console.error(
      'Usage: npm run create-user -- --email you@example.com [--name "Your Name"] [--password "..."]'
    );
    process.exit(1);
  }

  const normalised = normaliseEmail(email);
  if (!normalised.includes("@")) {
    console.error("That does not look like an email address.");
    process.exit(1);
  }

  const generated = !arg("password");
  const password = arg("password") ?? generatePassphrase();

  const strength = checkPasswordStrength(password);
  if (!strength.ok) {
    console.error(`That password will not do: ${strength.reason}`);
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
  });

  try {
    // The schema is created by the app on first request, not by this script. Failing clearly
    // beats creating a half-schema the app then disagrees with.
    const tableExists = await pool.query(
      "SELECT 1 FROM information_schema.tables WHERE table_name = 'users'"
    );
    if (tableExists.rowCount === 0) {
      console.error("The `users` table does not exist yet.");
      console.error("Start the app once (npm run dev) so it creates the schema, then re-run this.");
      process.exit(1);
    }

    const existing = await pool.query("SELECT id FROM users WHERE LOWER(email) = $1", [normalised]);
    if (existing.rowCount && existing.rowCount > 0) {
      console.error(`${normalised} already has an account.`);
      process.exit(1);
    }

    const total = await pool.query("SELECT COUNT(*)::int AS n FROM users");
    const count: number = total.rows[0]?.n ?? 0;
    if (count > 0) {
      // Not an error — inviting someone is a normal thing to do. Worth saying out loud, because
      // there are no roles: a second account sees and spends exactly what the first can.
      console.log(`Note: ${count} account${count === 1 ? "" : "s"} already exist.`);
      console.log(
        "Every account has full access — there are no roles. Only invite people you trust with client data and the API budget.\n"
      );
    }

    await pool.query(
      "INSERT INTO users (id, email, password_hash, name) VALUES ($1, $2, $3, $4)",
      [rowId(), normalised, await hashPassword(password), arg("name") ?? null]
    );

    console.log(`Account created for ${normalised}`);
    if (generated) {
      console.log("");
      console.log(`  password: ${password}`);
      console.log("");
      console.log("Save it now — it is stored hashed and cannot be read back.");
      console.log("There is no password reset. To change it, delete the row and run this again.");
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
