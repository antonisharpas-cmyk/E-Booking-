/**
 * Mark a test fixture's email address as confirmed, by writing to the database.
 *
 * Registration now emails a six-digit code, and an account can do nothing until
 * that code comes back. None of the HTTP suites can read that email — and none
 * of them should be able to, because a code reachable by anything other than the
 * mailbox it was sent to would be a hole rather than a convenience.
 *
 * So each suite proves the gate exists over HTTP (see test-http.mjs, section 3b)
 * and then steps over it here, exactly the way a member typing the right code
 * would: one column, one row, nothing else touched.
 *
 * Written directly rather than through the app because these suites run as
 * separate processes against a server that already holds the file. WAL mode
 * makes that safe.
 *
 * **This is only half of it.** The middleware decides where a request goes from
 * the session *cookie*, not from the row — it runs on the edge runtime and
 * cannot read SQLite. So a fixture stamped here is still carrying a cookie that
 * says otherwise, and every page it asks for is still redirected to the code
 * box. Each suite therefore signs the fixture in again straight afterwards,
 * which is exactly what a real member does and what re-issues the cookie:
 *
 *     if (markVerified(email) !== 1) throw new Error("fixture did not verify");
 *     await req(j, "/api/auth/login", { method: "POST", body: { email, password } });
 */
import Database from "better-sqlite3";

let conn = null;

function db() {
  if (!conn) {
    conn = new Database(
      (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, ""),
    );
  }
  return conn;
}

/**
 * Confirm one fixture by email address.
 *
 * Returns the number of rows changed — 1 for a fresh unverified fixture, 0 if it
 * was already verified or the address does not exist. Suites assert on that,
 * because a silent 0 would mean the rest of the run was testing an account that
 * cannot do anything, and every failure afterwards would point at the wrong
 * thing.
 */
export function markVerified(email) {
  return db()
    .prepare(
      `update users
          set email_verified_at = unixepoch()
        where email = ? and email_verified_at is null`,
    )
    .run(email).changes;
}
