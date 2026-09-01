#!/usr/bin/env node
/**
 * The production start command.  On Render, set the start command to:
 *
 *     npm run start:render
 *
 * Why this exists instead of plain `next start`.
 *
 * The database is a file on a persistent disk, and a host mounts that disk at
 * runtime only — not during the build, and not during a pre-deploy step, which
 * run on separate compute. So nothing that touches the database can live in the
 * build, however convenient that would be.
 *
 * That matters because the first boot on a new disk finds no file at all, and
 * `ensureSchema()` deliberately does nothing to a database with no `users`
 * table: it is a migrator, not a creator, and refusing to guess at a database
 * that does not exist yet is the right behaviour for it. Without this script the
 * first deploy goes green and every page on the website is a 500 reading
 * "no such table: users", which is a confusing way to find out.
 *
 * So: build the schema and seed the catalogue once, on the first boot only, then
 * hand over to `next start`. Every boot after that finds the table and drops
 * straight through, which is why this is safe as the permanent start command
 * rather than something to run by hand and remember.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";

const file = (process.env.DATABASE_URL ?? "file:./dev.db").replace(
  /^file:/,
  "",
);

/* The disk is mounted, but the directories under it are ours to make. */
const dir = dirname(file);
if (dir && dir !== "." && !existsSync(dir)) mkdirSync(dir, { recursive: true });

/**
 * Is there a database here, or only a mount point?
 *
 * `users` is the very table `ensureSchema` looks for, so this asks exactly the
 * question the app is about to ask. Opening the handle creates an empty file if
 * there is none, which is harmless and is what drizzle-kit would do anyway.
 */
function needsBuilding() {
  const conn = new Database(file);
  try {
    return !conn
      .prepare(
        "select name from sqlite_master where type = 'table' and name = 'users'",
      )
      .get();
  } finally {
    conn.close();
  }
}

function run(label, args) {
  console.log(`[boot] ${label}`);
  const res = spawnSync("npm", args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (res.status !== 0) {
    console.error(
      `[boot] ${label} failed. Not starting: a half-built database is worse than a failed deploy, because the deploy would go green.`,
    );
    process.exit(res.status ?? 1);
  }
}

if (needsBuilding()) {
  console.log(`[boot] no database at ${file}. Building it for the first time.`);
  run("creating the schema", ["run", "db:push"]);
  run("seeding the catalogue, packs, timetable and desk accounts", [
    "run",
    "db:seed",
  ]);
  console.log(
    "[boot] database ready. Set the real desk passwords with `npm run staff` and replace the placeholder instructors.",
  );
} else {
  console.log(`[boot] database present at ${file}.`);
}

/**
 * Hand over.
 *
 * Signals are forwarded rather than swallowed, so the host's "stop the old
 * instance" is a clean stop: SQLite gets to close its write-ahead log instead of
 * being killed mid-write. With a disk attached there is no overlap between the
 * old instance and the new one, which makes that closing moment the only chance
 * the file gets.
 */
const child = spawn("npm", ["run", "start"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

for (const sig of ["SIGTERM", "SIGINT"]) {
  process.on(sig, () => child.kill(sig));
}

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
