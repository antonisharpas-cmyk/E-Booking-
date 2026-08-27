/**
 * End-to-end check of the credit + booking rules against a real database.
 * Run with:  npx tsx scripts/test-flows.ts
 *
 * It creates a throwaway user, so it is safe to run against dev.db.
 */
import Database from "better-sqlite3";
import { and, eq, getTableColumns, gt, sql } from "drizzle-orm";
import { ensureSchema } from "../src/db/migrate";
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
import { STUDIO } from "../src/lib/studio";
import { getInstructors, getPackages } from "../src/lib/catalogue";
import { repairCatalogue } from "../src/lib/catalogue-repair";
import { OFFERED_PACK_SLUGS } from "../src/lib/packs";
import { repairSchedule } from "../src/lib/schedule-repair";
import {
  studioDayKeys,
  studioDayOfWeek,
  studioStartOfDay,
} from "../src/lib/time";
import { FREE_CANCELLATION_HOURS } from "../src/lib/utils";
import { dictionaries } from "../src/i18n/dictionaries";

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
    .values({
      email,
      name: "Test Runner",
      passwordHash: await hashPassword("x".repeat(10)),
    })
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
  check(
    "10-credit pack lands in wallet",
    (await getAvailableCredits(user.id)) === 10,
  );

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
  check(
    "no extra credit taken on refusal",
    (await getAvailableCredits(user.id)) === 9,
  );

  console.log("\n3. Booking spends the soonest-expiring credit first");
  grantCredits({
    userId: user.id,
    credits: 2,
    validityDays: 7,
    note: "short pack",
  });
  const before = db
    .select()
    .from(creditBatches)
    .where(
      and(
        eq(creditBatches.userId, user.id),
        gt(creditBatches.creditsRemaining, 0),
      ),
    )
    .all()
    .sort(
      (a, b) => (a.expiresAt?.getTime() ?? 0) - (b.expiresAt?.getTime() ?? 0),
    );
  const soonest = before.find(
    (b) => (b.expiresAt?.getTime() ?? 0) > Date.now(),
  )!;
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
  check(
    "cancel far ahead is refunded",
    c1.ok === true && c1.refunded === true,
    c1,
  );
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

  const fixtureSessionIds: string[] = [];

  console.log("\n5. Cancellation closes 24 hours before the class");
  /* A class 3 hours away is inside the 24-hour window, so it is locked. */
  const ct = db.select().from(classTypes).limit(1).get()!;
  const soon = new Date(Date.now() + 3 * 3600_000);
  const lateSession = db
    .insert(classSessions)
    .values({
      classTypeId: ct.id,
      startsAt: soon,
      endsAt: new Date(soon.getTime() + STUDIO.classLengthMinutes * 60_000),
      capacity: STUDIO.capacity,
    })
    .returning()
    .get();
  fixtureSessionIds.push(lateSession.id);
  const rl = bookClass(user.id, lateSession.id);
  check("can book a class 3h away", rl.ok === true, rl);
  const balBeforeLate = await getAvailableCredits(user.id);
  const lateBooking = db
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.userId, user.id), eq(bookings.sessionId, lateSession.id)),
    )
    .get()!;
  const c3 = cancelBooking(user.id, lateBooking.id);
  check(
    "cancelling inside 24 hours is refused",
    c3.ok === false && c3.code === "TOO_LATE_TO_CANCEL",
    c3,
  );
  check(
    "balance untouched by the refused cancel",
    (await getAvailableCredits(user.id)) === balBeforeLate,
  );

  /* And a class 25 hours out is still cancellable, with the session returned. */
  const ahead = new Date(Date.now() + 25 * 3600_000);
  const okSession = db
    .insert(classSessions)
    .values({
      classTypeId: ct.id,
      startsAt: ahead,
      endsAt: new Date(ahead.getTime() + STUDIO.classLengthMinutes * 60_000),
      capacity: STUDIO.capacity,
    })
    .returning()
    .get();
  fixtureSessionIds.push(okSession.id);
  check(
    "can book a class 25h away",
    bookClass(user.id, okSession.id).ok === true,
  );
  const balMid = await getAvailableCredits(user.id);
  const okBooking = db
    .select()
    .from(bookings)
    .where(
      and(eq(bookings.userId, user.id), eq(bookings.sessionId, okSession.id)),
    )
    .get()!;
  const c4 = cancelBooking(user.id, okBooking.id);
  check(
    "cancelling outside 24 hours is refunded",
    c4.ok === true && c4.refunded === true,
    c4,
  );
  check(
    "the session came back to the balance",
    (await getAvailableCredits(user.id)) === balMid + 1,
  );

  /* The published copy has to state the same number the rules enforce. */
  check(
    `copy quotes the ${FREE_CANCELLATION_HOURS}-hour window`,
    dictionaries.en.timetablePage.body.includes(
      `${FREE_CANCELLATION_HOURS} hours`,
    ) &&
      dictionaries.el.timetablePage.body.includes(
        `${FREE_CANCELLATION_HOURS} ώρες`,
      ),
  );

  console.log("\n6. Booking cut-off");
  const past = new Date(Date.now() + 5 * 60_000); // 5 minutes away
  const tooLate = db
    .insert(classSessions)
    .values({
      classTypeId: ct.id,
      startsAt: past,
      endsAt: new Date(past.getTime() + STUDIO.classLengthMinutes * 60_000),
      capacity: STUDIO.capacity,
    })
    .returning()
    .get();
  fixtureSessionIds.push(tooLate.id);
  const rt = bookClass(user.id, tooLate.id);
  check(
    "booking closes 30 min before start",
    rt.ok === false && rt.code === "TOO_LATE",
    rt,
  );

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
  fixtureSessionIds.push(capSession.id);
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
      (await getAvailableCredits(
        fillers.find((_, i) => !results[i]!.ok)!.id,
      )) === 1,
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
  check(
    "member with no credits cannot book",
    rb.ok === false && rb.code === "NO_CREDITS",
    rb,
  );

  console.log("\n8b. The room the studio actually has");
  {
    /* Plant a class on the old rota and prove a read repairs it. This is the
       bug that kept showing 06:00 to 06:50 with eight places. */
    const future = new Date(Date.now() + 4 * 86_400_000);
    const stale = db
      .insert(classSessions)
      .values({
        classTypeId: ct.id,
        startsAt: future,
        endsAt: new Date(future.getTime() + 50 * 60_000),
        capacity: 8,
      })
      .returning()
      .get();
    fixtureSessionIds.push(stale.id);

    const fixed = repairSchedule();
    check("repair touched the stale class", fixed >= 1, fixed);

    const after = db
      .select()
      .from(classSessions)
      .where(eq(classSessions.id, stale.id))
      .get()!;
    check(
      `class is ${STUDIO.classLengthMinutes} minutes long`,
      (after.endsAt.getTime() - after.startsAt.getTime()) / 60_000 ===
        STUDIO.classLengthMinutes,
      (after.endsAt.getTime() - after.startsAt.getTime()) / 60_000,
    );
    check(
      `class has ${STUDIO.capacity} places`,
      after.capacity === STUDIO.capacity,
      after.capacity,
    );

    /* A class earlier today must be repaired too: the timetable window starts
       at midnight, so a leftover from this morning is still on the page. */
    const earlier = studioStartOfDay(new Date());
    const thisMorning = db
      .insert(classSessions)
      .values({
        classTypeId: ct.id,
        startsAt: earlier,
        endsAt: new Date(earlier.getTime() + 50 * 60_000),
        capacity: 8,
      })
      .returning()
      .get();
    fixtureSessionIds.push(thisMorning.id);
    repairSchedule();
    const fixedToday = db
      .select()
      .from(classSessions)
      .where(eq(classSessions.id, thisMorning.id))
      .get()!;
    check(
      "a class earlier today is repaired as well",
      fixedToday.capacity === STUDIO.capacity &&
        (fixedToday.endsAt.getTime() - fixedToday.startsAt.getTime()) /
          60_000 ===
          STUDIO.classLengthMinutes,
    );

    /* Capacity is never pulled below the people already in the room. */
    const held = db
      .insert(classSessions)
      .values({
        classTypeId: ct.id,
        startsAt: new Date(Date.now() + 6 * 86_400_000),
        endsAt: new Date(Date.now() + 6 * 86_400_000 + 50 * 60_000),
        capacity: 8,
      })
      .returning()
      .get();
    fixtureSessionIds.push(held.id);
    for (const u of fillers.slice(0, 3)) {
      db.insert(bookings)
        .values({ userId: u.id, sessionId: held.id, status: "CONFIRMED" })
        .run();
    }
    repairSchedule();
    const heldAfter = db
      .select()
      .from(classSessions)
      .where(eq(classSessions.id, held.id))
      .get()!;
    check(
      "capacity is not dropped below the people already booked",
      heldAfter.capacity >= 3,
      heldAfter.capacity,
    );
  }

  console.log("\n8c. Sundays never appear in the date picker");
  {
    const keys = studioDayKeys(studioStartOfDay(new Date()), 28, [0]);
    const sundays = keys.filter(
      (k) => studioDayOfWeek(new Date(`${k}T12:00:00Z`)) === 0,
    );
    check("no Sunday in a 28-day window", sundays.length === 0, sundays);
    check("the window still spans four weeks", keys.length === 24, keys.length);
  }

  /* The fixtures above insert real classes into the timetable. Clean them up so
     running the tests does not leave odd one-off times on the live schedule. */
  for (const id of fixtureSessionIds) {
    sqlite.prepare("delete from bookings where session_id = ?").run(id);
    sqlite.prepare("delete from class_sessions where id = ?").run(id);
  }
  console.log(`  · removed ${fixtureSessionIds.length} fixture classes`);

  console.log("\n8d. The catalogue heals itself without a re-seed");
  {
    /* This is the bug the studio hit twice: the change was in the seed script,
       the seed script had not been run, and the page kept showing the old
       catalogue. A read has to be enough. */
    sqlite
      .prepare("update credit_packages set active = 1 where slug = 'intro-3'")
      .run();
    sqlite.prepare("update instructors set photo_url = NULL").run();

    const withdrawn = repairCatalogue();
    check(
      "a withdrawn pack is taken off sale by a read",
      withdrawn >= 1,
      withdrawn,
    );

    const onSale = (await getPackages()).map((p) => p.slug);
    check(
      "the 3-class pack is not on sale",
      !onSale.includes("intro-3"),
      onSale,
    );
    check(
      "packs on sale match the offered list",
      onSale.every((slug) => OFFERED_PACK_SLUGS.has(slug)),
      onSale,
    );

    /* The row survives, because purchases point at it. */
    const stillThere = sqlite
      .prepare("select active from credit_packages where slug = 'intro-3'")
      .get() as { active: number } | undefined;
    check("the withdrawn pack row is kept, not deleted", Boolean(stillThere));

    const team = await getInstructors();
    check(
      "every instructor has a portrait with no photo_url in the database",
      team.length > 0 && team.every((m) => Boolean(m.photoUrl)),
      team.map((m) => `${m.name}:${m.photoUrl}`),
    );
  }

  console.log("\n8e. An older database is brought up to date on connect");
  {
    /* The crash that prompted this: a machine set up before the profile
       columns existed loaded the homepage and got
       `no such column: service_opt_in_at`. Opening the database has to be
       enough to fix that, because "remember to run db:push" plainly is not. */
    const probe = new Database(":memory:");
    probe.exec(`
      create table users (
        id text primary key not null,
        email text not null,
        name text not null,
        phone text,
        password_hash text not null,
        role text default 'MEMBER' not null,
        created_at integer not null
      );
      create table bookings (id text primary key not null);
      create table instructors (id text primary key not null, name text not null);
    `);

    const applied = ensureSchema(probe);
    check(
      "the migration reports what it added",
      applied.length > 0,
      applied.length,
    );

    const cols = new Set(
      (
        probe.prepare("pragma table_info(users)").all() as { name: string }[]
      ).map((c) => c.name),
    );
    for (const col of [
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
      check(`users.${col} exists after migrating`, cols.has(col));
    }

    const tables = new Set(
      (
        probe
          .prepare("select name from sqlite_master where type='table'")
          .all() as { name: string }[]
      ).map((t) => t.name),
    );
    check("user_avatars exists", tables.has("user_avatars"));
    check("booking_reminders exists", tables.has("booking_reminders"));

    /* Running it twice must be a no-op, since it runs on every boot. */
    check("running it again changes nothing", ensureSchema(probe).length === 0);
    probe.close();
  }

  /* Every column in the schema must be known to the migration, or the next
     one added will crash an existing install exactly as this one did. */
  {
    const declared = new Set(Object.keys(getTableColumns(users)).map((k) => k));
    const sqlNames = new Set(
      Object.values(getTableColumns(users)).map((c) => c.name),
    );
    const live = new Set(
      (
        sqlite.prepare("pragma table_info(users)").all() as { name: string }[]
      ).map((c) => c.name),
    );
    const missing = [...sqlNames].filter((n) => !live.has(n));
    check(
      `every users column in the schema exists in the database (${declared.size} fields)`,
      missing.length === 0,
      missing,
    );
  }

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

  /* ---------------------------------------------------------------- 10 */
  console.log("\n10. What the automatic messages actually say");
  {
    const { whenWords, leadWords } = await import("../src/lib/messaging/events");

    /* The whole substance of a booking confirmation is the day and the hour, in
       the studio's timezone — a member in London booking a class at 18:00 in
       Larnaca must be told 18:00, not 16:00. */
    const at = new Date("2026-08-29T15:00:00Z"); // 18:00 in Nicosia
    const words = whenWords(at);
    check(
      "the confirmation names the weekday, the date and the hour",
      /Saturday/.test(words) && /29 August/.test(words) && /18:00/.test(words),
      words,
    );

    check("a two-hour lead reads as hours", leadWords(120) === "2 hours", leadWords(120));
    check("one hour is not pluralised", leadWords(60) === "1 hour", leadWords(60));
    check("ninety minutes stays legible", leadWords(90) === "1h 30m", leadWords(90));
    check("ten minutes reads as minutes", leadWords(10) === "10 minutes", leadWords(10));
    /* A sweep that runs a moment late must not say "in -1 minutes". */
    check("a late sweep says now, not a negative", leadWords(0) === "now", leadWords(0));
  }

  console.log(
    `\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed\n`,
  );
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
