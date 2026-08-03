import Database from "better-sqlite3";
import { readFileSync } from "fs";
import { join } from "path";

const DB_PATH = join(process.cwd(), "airs.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");

    const schemaPath = join(process.cwd(), "prisma", "schema.sql");
    const schema = readFileSync(schemaPath, "utf-8");
    db.exec(schema);

    // Migrations for existing databases
    const missionCols = db.pragma("table_info(missions)") as { name: string }[];
    if (!missionCols.some((c) => c.name === "audit_data")) {
      db.exec("ALTER TABLE missions ADD COLUMN audit_data TEXT");
    }
    const taskCols = db.pragma("table_info(mission_tasks)") as { name: string }[];
    if (!taskCols.some((c) => c.name === "indicator_code")) {
      db.exec("ALTER TABLE mission_tasks ADD COLUMN indicator_code TEXT");
    }
    const projectCols = db.pragma("table_info(projects)") as { name: string }[];
    if (!projectCols.some((c) => c.name === "target_score")) {
      db.exec("ALTER TABLE projects ADD COLUMN target_score INTEGER DEFAULT 80");
    }
  }
  return db;
}

export function generateId(): string {
  return Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join("");
}

export function query<T = unknown>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function queryOne<T = unknown>(sql: string, params: unknown[] = []): T | undefined {
  return getDb().prepare(sql).get(...params) as T | undefined;
}

export function run(sql: string, params: unknown[] = []): { changes: number; lastInsertRowid: number | bigint } {
  return getDb().prepare(sql).run(...params);
}
