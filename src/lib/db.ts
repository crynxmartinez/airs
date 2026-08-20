import { Pool } from "pg";
import { readFileSync } from "fs";
import { join } from "path";

/**
 * Postgres access layer — same API as the old SQLite db.ts.
 *
 * Uses DATABASE_URL env var to connect (Prisma Postgres or any Postgres instance).
 * Exposes query/queryOne/run/generateId — the same exports every route already uses.
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

let initialized = false;

async function ensureSchema() {
  if (initialized) return;
  initialized = true;
  const schemaPath = join(process.cwd(), "prisma", "schema-postgres.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  const client = await getPool().connect();
  try {
    await client.query(schema);
  } finally {
    client.release();
  }
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
  const result = await getPool().query(sql, params.map(bindable));
  return result.rows as T[];
}

export async function queryOne<T = unknown>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  await ensureSchema();
  const result = await getPool().query(sql, params.map(bindable));
  return (result.rows[0] as T | undefined) ?? undefined;
}

export async function run(sql: string, params: unknown[] = []): Promise<{ changes: number; lastInsertRowid: number | bigint }> {
  await ensureSchema();
  const result = await getPool().query(sql, params.map(bindable));
  return {
    changes: result.rowCount ?? 0,
    lastInsertRowid: 0,
  };
}
