/**
 * One command that says whether this installation is healthy.
 *
 *   npm run doctor
 *
 * Exists because "I cannot log in" is impossible to act on from a distance,
 * and every diagnosis so far has come down to the same handful of things:
 * a database that predates the current schema, a catalogue that predates the
 * current price list, or a rota that predates the current room. This checks
 * all of them and prints what is wrong in one screen.
 */
import Database from "better-sqlite3";
import { existsSync } from "node:fs";

const file = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");

let problems = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m, fix) => {
  problems++;
  console.log(`  \x1b[31m✗\x1b[0m ${m}`);
  if (fix) console.log(`      → ${fix}`);
};

console.log(`\n\x1b[1mAPEX pilates — installation check\x1b[0m`);
console.log(`\x1b[2mdatabase: ${file}\x1b[0m\n`);

if (!existsSync(file)) {
  bad("the database file does not exist", "npm run db:push && npm run db:seed");
  console.log("");
  process.exit(1);
}

const conn = new Database(file, { readonly: true });
const tables = new Set(
  conn.prepare("select name from sqlite_master where type='table'").all().map((t) => t.name),
);

console.log("Tables");
for (const t of [
  "users",
  "class_types",
  "class_templates",
  "class_sessions",
  "bookings",
  "credit_packages",
  "credit_batches",
  "credit_ledger",
  "instructors",
  "user_avatars",
  "booking_reminders",
]) {
  if (tables.has(t)) ok(t);
  else bad(`${t} is missing`, "restart the server, or npm run db:push");
}

console.log("\nColumns the app needs");
const cols = (t) =>
  new Set(conn.prepare(`pragma table_info(${t})`).all().map((c) => c.name));
if (tables.has("users")) {
  const u = cols("users");
  for (const c of [
    "service_opt_in_at",
    "marketing_opt_in",
    "notify_email",
    "notify_sms",
    "notify_push",
    "reminder_minutes",
    "birth_date",
    "height_cm",
    "weight_grams",
  ]) {
    if (u.has(c)) ok(`users.${c}`);
    else bad(`users.${c} is missing`, "restart the server so the migration runs");
  }
}
if (tables.has("instructors")) {
  cols("instructors").has("photo_url")
    ? ok("instructors.photo_url")
    : bad("instructors.photo_url is missing", "restart the server");
}

console.log("\nAccounts");
if (tables.has("users")) {
  const n = conn.prepare("select count(*) as n from users").get().n;
  n > 0 ? ok(`${n} account${n === 1 ? "" : "s"}`) : bad("no accounts at all", "npm run db:seed");
  const admins = conn
    .prepare("select count(*) as n from users where role in ('ADMIN','STAFF')")
    .get().n;
  admins > 0 ? ok(`${admins} staff account${admins === 1 ? "" : "s"}`) : bad("no staff account", "npm run db:seed");
}

console.log("\nThe room, as the timetable has it");
if (tables.has("class_sessions")) {
  const wrong = conn
    .prepare(
      "select count(*) as n from class_sessions where starts_at >= ? and (capacity != 5 or (ends_at - starts_at) != 3600)",
    )
    .get(Math.floor(Date.now() / 1000)).n;
  wrong === 0
    ? ok("every upcoming class is 60 minutes with five places")
    : bad(`${wrong} upcoming classes are on an older rota`, "restart the server, or npm run db:seed");

  const upcoming = conn
    .prepare("select count(*) as n from class_sessions where starts_at >= ?")
    .get(Math.floor(Date.now() / 1000)).n;
  upcoming > 0 ? ok(`${upcoming} classes scheduled ahead`) : bad("no classes scheduled", "npm run db:seed");
}

console.log("\nWhat is on sale");
if (tables.has("credit_packages")) {
  const active = conn
    .prepare("select slug from credit_packages where active = 1 order by sort_order")
    .all()
    .map((p) => p.slug);
  const expected = ["single", "pack-5", "pack-10", "pack-20"];
  const same = active.length === expected.length && active.every((s, i) => s === expected[i]);
  same
    ? ok(`packs on sale: ${active.join(", ")}`)
    : bad(`packs on sale are ${active.join(", ") || "none"}`, "load any page, or npm run db:seed");
}

conn.close();
console.log(
  problems === 0
    ? "\n\x1b[32mEverything looks right.\x1b[0m\n"
    : `\n\x1b[31m${problems} problem${problems === 1 ? "" : "s"}.\x1b[0m Follow the arrows above.\n`,
);
process.exit(problems === 0 ? 0 : 1);
