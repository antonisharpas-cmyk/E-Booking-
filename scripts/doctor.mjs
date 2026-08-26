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
import bcrypt from "bcryptjs";
import { existsSync } from "node:fs";

const file = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "");

let problems = 0;
let warnings = 0;
const ok = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`);
const warn = (m, fix) => {
  warnings++;
  console.log(`  \x1b[33m!\x1b[0m ${m}`);
  if (fix) console.log(`      → ${fix}`);
};
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
  "studio_closures",
  "notices",
  "notice_reads",
  "pricing_rules",
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
if (tables.has("purchases")) {
  /* Where a payment provider's own reference is kept, whoever the provider is.
     Without it every attempt to take a card fails on the insert. */
  cols("purchases").has("provider_ref")
    ? ok("purchases.provider_ref")
    : bad("purchases.provider_ref is missing", "restart the server");
}

console.log("\nAccounts");
if (tables.has("users")) {
  const n = conn.prepare("select count(*) as n from users").get().n;
  n > 0 ? ok(`${n} account${n === 1 ? "" : "s"}`) : bad("no accounts at all", "npm run db:seed");
  /* Two roles, and they are not interchangeable: an owner sees the takings, a
     receptionist runs the desk without them. A studio with no owner account
     cannot read its own numbers; one with no reception account is running the
     desk from the owner's login, which defeats the split. */
  const owners = conn
    .prepare("select count(*) as n from users where role = 'ADMIN'")
    .get().n;
  const reception = conn
    .prepare("select count(*) as n from users where role = 'STAFF'")
    .get().n;
  owners > 0
    ? ok(`${owners} owner account${owners === 1 ? "" : "s"} (analytics and the keys)`)
    : bad("no owner account — nobody can read the studio's numbers",
          'npm run staff -- add you@apex.cy "Your Name" owner');
  reception > 0
    ? ok(`${reception} reception account${reception === 1 ? "" : "s"} (the desk, no analytics)`)
    : warn("no reception account — the desk is being run from an owner login",
           'npm run staff -- add reception@apex.cy "Reception" reception');

  /* The seeded development passwords must not survive into a real studio. */
  const seeded = conn
    .prepare(
      "select email, password_hash from users where role in ('ADMIN','STAFF')",
    )
    .all();
  const stillDefault = seeded.filter((u) =>
    ["ownerdev123", "receptiondev123", "apexadmin123"].some((p) =>
      bcrypt.compareSync(p, u.password_hash),
    ),
  );
  stillDefault.length === 0
    ? ok("no desk account is still on its development password")
    : warn(
        `${stillDefault.length} desk account${stillDefault.length === 1 ? " is" : "s are"} still on the development password: ` +
          stillDefault.map((u) => u.email).join(", "),
        "npm run staff -- password <email>   (before going live)",
      );
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

console.log("\nTaking money");
{
  /* Reads .env the same way the app does, so what this prints is what a member
     would meet at the checkout. */
  const named = (process.env.PAYMENT_PROVIDER ?? "").trim().toLowerCase();
  const real = (v) => v && v.trim().length > 12 && !/x{3,}/i.test(v);
  const stripeReady =
    real(process.env.STRIPE_SECRET_KEY) &&
    (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_") &&
    real(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY);
  const hostedReady =
    Boolean(process.env.HOSTED_PAY_ENDPOINT) &&
    Boolean(process.env.HOSTED_PAY_MERCHANT_ID) &&
    /order:/.test(process.env.HOSTED_PAY_FIELDS ?? "") &&
    /amount:/.test(process.env.HOSTED_PAY_FIELDS ?? "");
  const testAllowed =
    process.env.ALLOW_TEST_PAYMENTS === "true" || process.env.NODE_ENV !== "production";

  const active = named
    ? named
    : stripeReady
      ? "stripe"
      : hostedReady
        ? "hosted"
        : testAllowed
          ? "test"
          : null;

  if (named && named === "stripe" && !stripeReady) {
    bad("PAYMENT_PROVIDER says stripe but the keys are missing or placeholders", "put real sk_ and pk_ keys in .env — docs/payments.md");
  } else if (named && named === "hosted" && !hostedReady) {
    bad("PAYMENT_PROVIDER says hosted but the gateway is not described", "fill in HOSTED_PAY_* — docs/payments.md");
  } else if (active === "stripe") {
    ok("card fields in our own page, through Stripe");
    real(process.env.STRIPE_WEBHOOK_SECRET)
      ? ok("the Stripe webhook is signed")
      : bad("no STRIPE_WEBHOOK_SECRET", "stripe listen --forward-to localhost:3000/api/stripe/webhook");
  } else if (active === "hosted") {
    ok(`redirect to ${process.env.HOSTED_PAY_LABEL ?? "the gateway"}`);
    process.env.HOSTED_PAY_SIGNATURE_FIELD && process.env.HOSTED_PAY_SECRET
      ? ok("returns from the gateway are signature checked")
      : bad("no signature configured for gateway returns", "set HOSTED_PAY_SIGNATURE_* before going live — docs/payments.md");
  } else if (active === "test") {
    ok("test mode: the card form charges nothing (fine in development)");
  } else {
    bad("no payment provider is usable", "see docs/payments.md");
  }
}

conn.close();
console.log(
  problems === 0 && warnings > 0
    ? `\n\x1b[33mNothing broken, ${warnings} thing${warnings === 1 ? "" : "s"} to tidy before going live.\x1b[0m\n`
    : problems === 0
    ? "\n\x1b[32mEverything looks right.\x1b[0m\n"
    : `\n\x1b[31m${problems} problem${problems === 1 ? "" : "s"}.\x1b[0m Follow the arrows above.\n`,
);
process.exit(problems === 0 ? 0 : 1);
