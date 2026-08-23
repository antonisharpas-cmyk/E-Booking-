import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema";

/**
 * Single shared connection. Next.js hot-reloads modules in dev, so the client
 * is cached on globalThis to avoid opening a new SQLite handle on every reload.
 */
const file = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");

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

export const db = drizzle(sqlite, { schema });
export { schema, sqlite };
export type Db = typeof db;
