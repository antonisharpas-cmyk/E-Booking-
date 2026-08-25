import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { ensureSchema } from "./migrate";
import * as schema from "./schema";

/**
 * Single shared connection. Next.js hot-reloads modules in dev, so the handle
 * is cached on globalThis to avoid opening a new SQLite handle on every reload.
 */
const file = (process.env.DATABASE_URL ?? "file:./dev.db").replace(
  /^file:/,
  "",
);

const globalForDb = globalThis as unknown as {
  __apexSqlite?: Database.Database;
};

const sqlite =
  globalForDb.__apexSqlite ??
  (() => {
    const conn = new Database(file);
    conn.pragma("journal_mode = WAL");
    conn.pragma("foreign_keys = ON");
    return conn;
  })();

if (process.env.NODE_ENV !== "production") globalForDb.__apexSqlite = sqlite;

/**
 * Bring the file up to the schema this build expects.
 *
 * Deliberately outside the connection-creation branch above. It used to live
 * inside it, which meant it only ran when a *new* handle was opened — and in
 * development the handle is cached on globalThis across hot reloads. So pulling
 * new code into an already-running dev server re-evaluated this module, reused
 * the old connection, and never migrated: every query touching the changed
 * table then failed, which looked like "I cannot log in or create an account".
 *
 * Running it on every module evaluation is the correct place. It is idempotent
 * and costs a handful of pragma reads, which is nothing next to the failure it
 * prevents. See migrate.ts.
 */
try {
  const applied = ensureSchema(sqlite);
  if (applied.length) {
    console.log(`[db] schema brought up to date: ${applied.join(", ")}`);
  }
} catch (e) {
  /* Never stop the app from opening the database over this: a thrown error
     here is far more confusing than the missing column it was fixing. */
  console.error("[db] could not apply schema updates", e);
}

export const db = drizzle(sqlite, { schema });
export { schema, sqlite };
export type Db = typeof db;
