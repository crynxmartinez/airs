<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:airs-crm-postgres-audit -->
# Postgres Migration — Deep Audit Round 1 Findings

When working on the Airs CRM database layer, be aware of these known issues from the Postgres migration audit. Verify each has been addressed before assuming the migration is complete.

## Critical Issues (Will break at runtime)

1. **`?` placeholders not converted to `$1, $2`** — `pg` uses `$1, $2` parameter syntax, but all 208 SQL queries still use SQLite's `?`. Every database query will fail. This is the #1 blocker.

2. **`ensureSchema()` race condition** — `initialized = true` is set *before* the async `client.query(schema)` completes. Concurrent cold-start requests will all try to run the schema.

3. **`ensureSchema()` may fail on Vercel** — `readFileSync(join(process.cwd(), "prisma/schema-postgres.sql"))` may not resolve correctly in Vercel's serverless output. The `prisma/` directory might not be bundled.

## High Priority

4. **`better-sqlite3` still in `package.json`** — Dead dependency, adds bloat and build time.

5. **`check-db.js` still uses `node:sqlite`** — Stale artifact pointing at `./airs.db` which no longer exists.

6. **`bindable()` converts booleans to `0/1`** — Works because schema uses `INTEGER` for booleans, but fragile if schema ever changes to `BOOLEAN`.

7. **`run()` returns `lastInsertRowid: 0`** — Always returns 0 for inserts. Not used elsewhere currently, but any code relying on it for inserted IDs would break silently.

## Medium Priority

8. **Schema uses `TEXT` for all timestamps** — `to_char(NOW(), 'YYYY-MM-DD HH24:MI:SS')` returns strings. Postgres has native `TIMESTAMP` types. String timestamps can't use date arithmetic, range queries, or indexing efficiently.

9. **No connection error handling** — `getPool()` doesn't catch connection errors. If Postgres is unreachable, the app crashes with an unhandled promise rejection instead of a graceful error.

10. **No `RETURNING *` on inserts** — Postgres supports `RETURNING *` which would let `run()` return the inserted row, but the current API discards it.
<!-- END:airs-crm-postgres-audit -->
