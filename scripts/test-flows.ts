/**
 * End-to-end check of the credit + booking rules against a real database.
 * Run with:  npx tsx scripts/test-flows.ts
 *
 * It creates a throwaway user, so it is safe to run against dev.db.
 */
import { and, eq, gt, sql } from "drizzle-orm";
import { db, sqlite } from "../src/db";
import {
  bookings,
  classSessions,
  classTypes,
  creditBatches,
  creditLedger,
  users,
} from "../src/db/schema";
import { bookClass, cancelBooking } from "../src/lib/booking";
import { getAvailableCredits, grantCredits } from "../src/lib/credits";
import { hashPassword } from "../src/lib/auth";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, extra?: unknown) {
  if (cond) {
    pass++;
    console.log(`  ✓ ${label}`);
  } else {
    fail++;
    console.log(`  ✗ ${label}`, extra ?? "");
  }
}

async function main() {
  const email = `test-${Date.now()}@apex.test`;
  const user = db
    .insert(users)
    .values({ email, name: "Test Runner", passwordHash: await hashPassword("x".repeat(10)) })
    .returning()
    .get();

  console.log("\n1. Credits");
  check("new member has 0 credits", (await getAvailableCredits(user.id)) === 0);

  grantCredits({
    userId: user.id,
    credits: 10,
    validityDays: 90,
    source: "PURCHASE",
    note: "test pack",
  });
  check("10-credit pack lands in wallet", (await getAvailableCredits(user.id)) === 10);

  /* Expired batch must not count (written directly, with its ledger row) */
  const expiredBatch = db
    .insert(creditBatches)
    .values({
      userId: user.id,
      creditsTotal: 5,
      creditsRemaining: 5,
      source: "PURCHASE",
      expiresAt: new Date(Date.now() - 86_400_000),
    })
    .returning()
    .get();
  db.insert(creditLedger)
    .values({
      userId: user.id,
      delta: 5,
      reason: "PURCHASE",
      note: "test expired pack",
      batchId: expiredBatch.id,
    })
    .run();
  check(
    "expired credits are excluded from the balance",
    (await getAvailableCredits(user.id)) === 10,
  );

  console.log("\n2. Booking");
  const future = db
    .select()
    .from(classSessions)
    .where(gt(classSessions.startsAt, new Date(Date.now() + 3 * 86_400_000)))
    .limit(4)
    .all();
  check("seeded future sessions exist", future.length >= 3, future.length);

  const s1 = future[0]!;
  const r1 = bookClass(user.id, s1.id);
  check("booking succeeds", r1.ok === true, r1);
  check("one credit deducted", (await getAvailableCredits(user.id)) === 9);

  const r2 = bookClass(user.id, s1.id);
  check(
    "double booking the same class is refused",
    r2.ok === false && r2.code === "ALREADY_BOOKED",
    r2,
  );
  check("no extra credit taken on refusal", (await getAvailableCredits(user.id)) === 9);

  console.log("\n3. Booking spends the soonest-expiring credit first");
  grantCredits({ userId: user.id, credits: 2, validityDays: 7, note: "short pack" });
  const before = db
    .select()
    .from(creditBatches)
    .where(and(eq(creditBatches.userId, user.id), gt(creditBatches.creditsRemaining, 0)))
    .all()
    .sort((a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0));
  const soonest = before.find((b) => (b.expiresAt?.getTime() ?? 0) > Date.now())!;
  bookClass(user.id, future[1]!.id);
  const after = db
    .select()
    .from(creditBatches)
    .where(eq(creditBatches.id, soonest.id))
    .get()!;
  check(
    "credit taken from the batch expiring soonest",
    after.creditsRemaining === soonest.creditsRemaining - 1,
    { before: soonest.creditsRemaining, after: after.creditsRemaining },
  );

  console.log("\n4. Cancellation");
  const balBefore = await getAvailableCredits(user.id);
  const myBooking = db
    .select()
    .from(bookings)
    .where(and(eq(bookings.userId, user.id), eq(bookings.sessionId, s1.id)))
    .get()!;
  const c1 = cancelBooking(user.id, myBooking.id);
  check("cancel far ahead is refunded", c1.ok === true && c1.refunded === true, c1);
  check(
    "credit returned to wallet",
    (await getAvailableCredits(user.id)) === balBefore + 1,
  );
  const c2 = cancelBooking(user.id, myBooking.id);
  check(
    "cancelling twice is refused",
    c2.ok === false && c2.code === "ALREADY_CANCELLED",
    c2,
  );

  console.log("\n5. Late cancellation keeps the credit");
  /* Create a session starting in 3 hours — inside the 12h window */
  const ct = db.select().from(classTypes).limit(1).get()!;
  const soon = new Date(Date.now() + 3 * 3600_000);
  const lateSession = db
    .insert(classSessions)
    .values({
      classTypeId: ct.id,
      startsAt: soon,
      endsAt: new Date(soon.getTime() + 50 * 60_000),
      capacity: 8,
    })
    .returning()
    .get();
  const rl = bookClass(user.id, lateSession.id);
  check("can book a class 3h away", rl.ok === true, rl);
  const balBeforeLate = await getAvailableCredits(user.id);
  const lateBooking = db
    .select()
    .from(bookings)
    .where(and(eq(bookings.userId, user.id), eq(bookings.sessionId, lateSession.id)))
    .get()!;
  const c3 = cancelBooking(user.id, lateBooking.id);
  check("late cancel allowed but not refunded", c3.ok === true && c3.refunded === false, c3);
  check(
    "credit not returned for late cancel",
    (await getAvailableCredits(user.id)) === balBeforeLate,
  );

  console.log("\n6. Booking cut-off");
  const past = new Date(Date.now() + 5 * 60_000); // 5 minutes away
  const tooLate = db
    .insert(classSessions)
    .values({
      classTypeId: ct.id,
      startsAt: past,
      endsAt: new Date(past.getTime() + 50 * 60_000),
      capacity: 8,
    })
    .returning()
    .get();
  const rt = bookClass(user.id, tooLate.id);
  check("booking closes 30 min before start", rt.ok === false && rt.code === "TOO_LATE", rt);

  console.log("\n7. Capacity");
  const capSession = db
    .insert(classSessions)
    .values({
      classTypeId: ct.id,
      startsAt: new Date(Date.now() + 5 * 86_400_000),
      endsAt: new Date(Date.now() + 5 * 86_400_000 + 50 * 60_000),
      capacity: 2,
    })
    .returning()
    .get();
  const fillers = [];
  for (let i = 0; i < 3; i++) {
    const u = db
      .insert(users)
      .values({
        email: `filler-${Date.now()}-${i}@apex.test`,
        name: `Filler ${i}`,
        passwordHash: "x",
      })
      .returning()
      .get();
    grantCredits({ userId: u.id, credits: 1, validityDays: 30 });
    fillers.push(u);
  }
  const results = fillers.map((u) => bookClass(u.id, capSession.id));
  check(
    "capacity 2 accepts exactly 2 bookings",
    results.filter((r) => r.ok).length === 2,
    results,
  );
  check(
    "the third is told the class is full",
    results.some((r) => !r.ok && r.code === "CLASS_FULL"),
    results,
  );
  check(
    "no credit taken from the rejected member",
    (await getAvailableCredits(fillers[2]!.id)) === 1 ||
      (await getAvailableCredits(fillers.find((_, i) => !results[i]!.ok)!.id)) === 1,
  );

  console.log("\n8. No credits");
  const broke = db
    .insert(users)
    .values({
      email: `broke-${Date.now()}@apex.test`,
      name: "No Credits",
      passwordHash: "x",
    })
    .returning()
    .get();
  const rb = bookClass(broke.id, future[2]!.id);
  check("member with no credits cannot book", rb.ok === false && rb.code === "NO_CREDITS", rb);

  console.log("\n9. Ledger integrity");
  const ledgerSum =
    db
      .select({ n: sql<number>`coalesce(sum(delta),0)` })
      .from(creditLedger)
      .where(eq(creditLedger.userId, user.id))
      .get()?.n ?? 0;
  const batchSum =
    db
      .select({ n: sql<number>`coalesce(sum(credits_remaining),0)` })
      .from(creditBatches)
      .where(eq(creditBatches.userId, user.id))
      .get()?.n ?? 0;
  check(
    "ledger total equals credits remaining across all batches",
    ledgerSum === batchSum,
    { ledgerSum, batchSum },
  );

  /* cleanup */
  const testUsers = [user, broke, ...fillers];
  for (const u of testUsers) {
    sqlite.prepare("delete from bookings where user_id = ?").run(u.id);
    sqlite.prepare("delete from credit_ledger where user_id = ?").run(u.id);
    sqlite.prepare("delete from credit_batches where user_id = ?").run(u.id);
    sqlite.prepare("delete from users where id = ?").run(u.id);
  }
  sqlite
    .prepare("delete from class_sessions where id in (?,?,?)")
    .run(lateSession.id, tooLate.id, capSession.id);

  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
