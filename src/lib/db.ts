import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Postgres access layer — same API as the old SQLite db.ts.
 *
 * Uses DATABASE_URL env var to connect (Prisma Postgres or any Postgres instance).
 * Exposes query/queryOne/run/generateId — the same exports every route already uses.
 *
 * SQLite-style ? placeholders are converted to $1, $2, ... at runtime so
 * every existing call site works without modification.
 */

let pool: Pool | null = null;

function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL is not set");
    }
    pool = new Pool({
      connectionString,
      ssl: connectionString.includes("sslmode=require")
        ? { rejectUnauthorized: false }
        : undefined,
      max: 10,
    });
  }
  return pool;
}

/**
 * Converts SQLite-style ? placeholders to Postgres $1, $2, ... syntax.
 * Tracks single-quoted strings to avoid replacing ? inside SQL string literals.
 */
function convertPlaceholders(sql: string): string {
  let result = "";
  let paramNum = 1;
  let inString = false;

  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];

    if (inString) {
      result += char;
      if (char === "'") {
        if (sql[i + 1] === "'") {
          result += sql[i + 1];
          i++;
        } else {
          inString = false;
        }
      }
    } else {
      if (char === "'") {
        inString = true;
        result += char;
      } else if (char === "?") {
        result += `$${paramNum}`;
        paramNum++;
      } else {
        result += char;
      }
    }
  }

  return result;
}

let schemaPromise: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (schemaPromise) return schemaPromise;
  schemaPromise = (async () => {
    const schemaPath = join(process.cwd(), "prisma", "schema-postgres.sql");
    const schema = readFileSync(schemaPath, "utf-8");
    const client = await getPool().connect();
    try {
      await client.query(schema);
    } finally {
      client.release();
    }
  })();
  return schemaPromise;
}

export function generateId(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

function bindable(value: unknown): unknown {
  if (value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value !== null && typeof value === "object" && !(value instanceof Uint8Array)) {
    return JSON.stringify(value);
  }
  return value;
}

export async function query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureSchema();
  const result = await getPool().query(convertPlaceholders(sql), params.map(bindable));
  return result.rows as T[];
}

export async function queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  await ensureSchema();
  const result = await getPool().query(convertPlaceholders(sql), params.map(bindable));
  return (result.rows[0] as T | undefined) ?? undefined;
}

export async function run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
  await ensureSchema();
  const result = await getPool().query(convertPlaceholders(sql), params.map(bindable));
  return {
    changes: result.rowCount ?? 0,
    lastInsertRowid: 0,
  };
}
