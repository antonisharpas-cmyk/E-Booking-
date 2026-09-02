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

/**
 * Answer the three welcome questions for a fixture, by writing to the database.
 *
 * The same bargain as `markVerified` above, one gate later. Registration now has
 * two mandatory steps rather than one: the emailed code, and then three
 * questions about the member's pilates and anything to be careful of. A booking
 * is refused until both are done — deliberately, because the alternative is five
 * people on reformers and an instructor who does not know which of them is new.
 *
 * Every suite that books a class therefore has to get past it. `test-http`
 * proves the gate and answers the questions over HTTP, the way a member does,
 * because that is worth testing once properly. Everywhere else it is scaffolding
 * in the way of the thing actually being tested, so it is stepped over here:
 * three columns and the date the step was completed, nothing else touched.
 *
 * Returns rows changed, so a suite can assert rather than assume: a silent 0
 * would leave the rest of the run testing an account that cannot book, and every
 * failure afterwards would point at the wrong thing.
 */
export function markOnboarded(email, condition = null) {
  return db()
    .prepare(
      `update users
          set pilates_level  = coalesce(pilates_level, 'BEGINNER'),
              pilates_since  = coalesce(pilates_since, 'NONE'),
              health_condition = coalesce(health_condition, ?),
              intake_at      = coalesce(intake_at, unixepoch())
        where email = ?`,
    )
    .run(condition, email).changes;
}
