import type Database from "better-sqlite3";

/**
 * Bring an existing database up to the current schema, on connect.
 *
 * Why this exists rather than "remember to run `npm run db:push`": every time
 * this project has grown a column, the change has landed in the repo and then
 * failed on a machine that had already been set up, because the schema lives in
 * the database and the database is not in the repo. A missing column is not a
 * cosmetic difference either — it is a crash on the homepage, which is exactly
 * what happened here with `service_opt_in_at`.
 *
 * So the app repairs its own shape. This is a small, additive, idempotent
 * migration: it only ever adds columns, tables and indexes that are absent, and
 * never drops, renames or rewrites anything. `npm run db:push` still works and
 * remains the tool for real schema changes; this is the safety net that means
 * pulling the repo and starting the server is enough.
 *
 * Each entry must match src/db/schema.ts exactly. When you add a column there,
 * add it here too.
 */

type Column = { name: string; ddl: string };

const COLUMNS: Record<string, Column[]> = {
  users: [
    { name: "service_opt_in_at", ddl: "integer" },
    { name: "marketing_opt_in", ddl: "integer default 0 not null" },
    { name: "notify_email", ddl: "integer default 1 not null" },
    { name: "notify_sms", ddl: "integer default 0 not null" },
    { name: "notify_push", ddl: "integer default 0 not null" },
    { name: "reminder_minutes", ddl: "integer" },
    { name: "birth_date", ddl: "text" },
    { name: "height_cm", ddl: "integer" },
    { name: "weight_grams", ddl: "integer" },
    { name: "notes", ddl: "text" },
  ],
  instructors: [{ name: "photo_url", ddl: "text" }],
  purchases: [{ name: "provider_ref", ddl: "text" }],
};

const TABLES: { name: string; ddl: string }[] = [
  {
    name: "user_avatars",
    ddl: `create table user_avatars (
            user_id text primary key not null
              references users(id) on delete cascade,
            content_type text not null,
            bytes integer not null,
            data text not null,
            updated_at integer not null
          )`,
  },
  {
    name: "booking_reminders",
    ddl: `create table booking_reminders (
            id text primary key not null,
            booking_id text not null
              references bookings(id) on delete cascade,
            user_id text not null
              references users(id) on delete cascade,
            due_at integer not null,
            channels text not null,
            sent_at integer,
            created_at integer not null
          )`,
  },
  {
    name: "studio_closures",
    ddl: `create table studio_closures (
            id text primary key not null,
            day text not null,
            reason_en text default '' not null,
            reason_el text default '' not null,
            created_by text references users(id),
            created_at integer not null
          )`,
  },
  {
    name: "notices",
    ddl: `create table notices (
            id text primary key not null,
            title_en text not null,
            body_en text not null,
            title_el text default '' not null,
            body_el text default '' not null,
            audience text default 'ALL' not null,
            important integer default 0 not null,
            created_by text references users(id),
            created_at integer not null
          )`,
  },
  {
    name: "notice_reads",
    ddl: `create table notice_reads (
            notice_id text not null references notices(id) on delete cascade,
            user_id text not null references users(id) on delete cascade,
            read_at integer not null
          )`,
  },
  {
    name: "pricing_rules",
    ddl: `create table pricing_rules (
            id text primary key not null,
            package_id text references credit_packages(id) on delete cascade,
            kind text not null,
            value integer not null,
            label_en text default '' not null,
            label_el text default '' not null,
            active integer default 1 not null,
            created_by text references users(id),
            created_at integer not null
          )`,
  },
];

const INDEXES: { name: string; ddl: string }[] = [
  {
    name: "booking_reminders_due_idx",
    ddl: "create index booking_reminders_due_idx on booking_reminders (due_at)",
  },
  {
    name: "booking_reminders_booking_idx",
    ddl: "create unique index booking_reminders_booking_idx on booking_reminders (booking_id)",
  },
  {
    name: "studio_closures_day_idx",
    ddl: "create unique index studio_closures_day_idx on studio_closures (day)",
  },
  {
    name: "notices_created_idx",
    ddl: "create index notices_created_idx on notices (created_at)",
  },
  {
    name: "notice_reads_idx",
    ddl: "create unique index notice_reads_idx on notice_reads (notice_id, user_id)",
  },
  {
    name: "pricing_rules_active_idx",
    ddl: "create index pricing_rules_active_idx on pricing_rules (active)",
  },
];

function tableExists(conn: Database.Database, name: string) {
  return Boolean(
    conn
      .prepare("select name from sqlite_master where type='table' and name=?")
      .get(name),
  );
}

function indexExists(conn: Database.Database, name: string) {
  return Boolean(
    conn
      .prepare("select name from sqlite_master where type='index' and name=?")
      .get(name),
  );
}

/** Returns a short list of what it changed, for the dev-server log. */
export function ensureSchema(conn: Database.Database): string[] {
  const applied: string[] = [];

  /* Nothing to do on a database that has not been created yet — db:push or the
     seed builds it from the schema, which is already current. */
  if (!tableExists(conn, "users")) return applied;

  for (const [table, columns] of Object.entries(COLUMNS)) {
    if (!tableExists(conn, table)) continue;
    const present = new Set(
      (
        conn.prepare(`pragma table_info(${table})`).all() as { name: string }[]
      ).map((c) => c.name),
    );
    for (const col of columns) {
      if (present.has(col.name)) continue;
      conn
        .prepare(`alter table ${table} add column ${col.name} ${col.ddl}`)
        .run();
      applied.push(`${table}.${col.name}`);
    }
  }

  for (const t of TABLES) {
    if (tableExists(conn, t.name)) continue;
    conn.prepare(t.ddl).run();
    applied.push(`table ${t.name}`);
  }

  for (const i of INDEXES) {
    /* The index needs its table, which may only just have been created. */
    if (indexExists(conn, i.name)) continue;
    const on = i.ddl.match(/ on (\w+) /)?.[1];
    if (on && !tableExists(conn, on)) continue;
    conn.prepare(i.ddl).run();
    applied.push(`index ${i.name}`);
  }

  return applied;
}
