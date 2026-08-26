/**
 * Give somebody the keys, or take them back.
 *
 *   npm run role -- someone@example.com admin
 *   npm run role -- reception@apexpilates.cy staff
 *   npm run role -- someone@example.com member
 *   npm run role                                  (lists who has what)
 *
 * Exists because the one thing the desk console cannot do is create another
 * member of staff — and it should not: handing out the keys is not a job for
 * the person at the counter. It is a job for whoever owns the studio, from
 * their own machine, deliberately.
 *
 *   ADMIN   everything, including this
 *   STAFF   the whole reception desk
 *   MEMBER  their own account only
 */
import Database from "better-sqlite3";
import { existsSync } from "node:fs";

const file = (process.env.DATABASE_URL ?? "file:./dev.db").replace(
  /^file:/,
  "",
);
const ROLES = ["ADMIN", "STAFF", "MEMBER"];

if (!existsSync(file)) {
  console.error(`\n  No database at ${file}. Run npm run setup first.\n`);
  process.exit(1);
}

const db = new Database(file);
const [emailArg, roleArg] = process.argv.slice(2);

/* No arguments: say who holds what, and how to change it. */
if (!emailArg) {
  const rows = db
    .prepare("select email, name, role from users order by role, email")
    .all();
  const staff = rows.filter((r) => r.role !== "MEMBER");

  console.log(`\n  Who can open the desk console (${file})\n`);
  if (staff.length === 0) {
    console.log("    Nobody. That means /admin is unreachable.");
  } else {
    for (const r of staff) {
      console.log(`    ${r.role.padEnd(6)} ${r.email}   ${r.name}`);
    }
  }
  console.log(`\n    ${rows.length - staff.length} member accounts\n`);
  console.log("  To change one:");
  console.log("    npm run role -- someone@example.com staff\n");
  process.exit(0);
}

const email = emailArg.trim().toLowerCase();
const role = (roleArg ?? "").trim().toUpperCase();

if (!ROLES.includes(role)) {
  console.error(`\n  Say which role: ${ROLES.join(", ").toLowerCase()}\n`);
  console.error(`    npm run role -- ${email} staff\n`);
  process.exit(1);
}

const user = db
  .prepare("select id, name, email, role from users where email = ?")
  .get(email);

if (!user) {
  console.error(`\n  No account with that email: ${email}`);
  const near = db
    .prepare("select email from users order by email")
    .all()
    .map((r) => r.email)
    .filter((e) => e.split("@")[0].startsWith(email.split("@")[0].slice(0, 3)));
  if (near.length) console.error(`  Did you mean: ${near.join(", ")}`);
  console.error("");
  process.exit(1);
}

if (user.role === role) {
  console.log(`\n  ${user.email} is already ${role}. Nothing to do.\n`);
  process.exit(0);
}

/* Never leave the studio locked out of its own console. */
if (role === "MEMBER") {
  const others = db
    .prepare(
      "select count(*) as n from users where role in ('ADMIN','STAFF') and id != ?",
    )
    .get(user.id).n;
  if (others === 0) {
    console.error(
      `\n  Refusing: ${user.email} is the only account that can open /admin.` +
        `\n  Promote somebody else first.\n`,
    );
    process.exit(1);
  }
}

db.prepare("update users set role = ? where id = ?").run(role, user.id);

console.log(`\n  ${user.name} <${user.email}>`);
console.log(`  ${user.role}  ->  ${role}\n`);
console.log(
  role === "MEMBER"
    ? "  They can no longer open the desk console.\n"
    : "  They can open /admin now. Their own password unlocks it.\n",
);
console.log("  Sign out and in again for it to take effect.\n");
db.close();
