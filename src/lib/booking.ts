import { and, asc, eq, gte, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  classSessions,
  classTypes,
  instructors,
} from "@/db/schema";
import { refundOneCredit, spendableAnywhere, spendOneCredit } from "./credits";
import { repairScheduleOnce } from "./schedule-repair";
import {
  FREE_CANCELLATION_HOURS,
  isBookable,
  isFreeCancellation,
} from "./utils";

export type BookingResultCode =
  | "OK"
  | "SESSION_NOT_FOUND"
  | "SESSION_CANCELLED"
  | "TOO_LATE"
  | "CLASS_FULL"
  | "ALREADY_BOOKED"
  | "NO_CREDITS"
  /** They hold sessions, but none of them may pay for a class on this date. */
  | "CREDITS_NOT_VALID_HERE";

export type BookingResult =
  | { ok: true; bookingId: string; creditBatchId: string | null }
  | { ok: false; code: Exclude<BookingResultCode, "OK"> };

/**
 * Book a class for one credit.
 *
 * Everything happens inside a single SQLite transaction: the capacity check,
 * the credit deduction and the booking row. better-sqlite3 is synchronous and
 * single-connection, so two people clicking "book" on the last spot cannot both
 * succeed — the second one sees the first one's row.
 */
export function bookClass(
  userId: string,
  sessionId: string,
  now = new Date(),
): BookingResult {
  return db.transaction((): BookingResult => {
    const session = db
      .select()
      .from(classSessions)
      .where(eq(classSessions.id, sessionId))
      .get();

    if (!session) return { ok: false, code: "SESSION_NOT_FOUND" };
    if (session.status !== "SCHEDULED")
      return { ok: false, code: "SESSION_CANCELLED" };
    if (!isBookable(session.startsAt, now)) return { ok: false, code: "TOO_LATE" };

    const existing = db
      .select()
      .from(bookings)
      .where(and(eq(bookings.userId, userId), eq(bookings.sessionId, sessionId)))
      .get();

    if (existing && existing.status !== "CANCELLED") {
      return { ok: false, code: "ALREADY_BOOKED" };
    }

    const taken =
      db
        .select({ n: sql<number>`count(*)` })
        .from(bookings)
        .where(
          and(
            eq(bookings.sessionId, sessionId),
            ne(bookings.status, "CANCELLED"),
          ),
        )
        .get()?.n ?? 0;

    if (taken >= session.capacity) return { ok: false, code: "CLASS_FULL" };

    /* The class date goes in, so a session that may only be spent on the
       opening week cannot be burned on a class in November. */
    const batchId = spendOneCredit(
      userId,
      { note: session.id, classStartsAt: session.startsAt },
      now,
    );
    if (!batchId) {
      /* Distinguish "you have nothing" from "you have something that cannot pay
         for this class". A member looking at a balance of 1 and being told they
         have no sessions would reasonably think the site was broken. */
      const anyLeft = spendableAnywhere(userId, now);
      return {
        ok: false,
        code: anyLeft ? "CREDITS_NOT_VALID_HERE" : "NO_CREDITS",
      };
    }

    let bookingId: string;
    if (existing) {
      /* Member is re-booking a class they had cancelled — revive the row. */
      db.update(bookings)
        .set({
          status: "CONFIRMED",
          creditBatchId: batchId,
          creditRefunded: false,
          cancelledAt: null,
          createdAt: now,
        })
        .where(eq(bookings.id, existing.id))
        .run();
      bookingId = existing.id;
    } else {
      const created = db
        .insert(bookings)
        .values({
          userId,
          sessionId,
          status: "CONFIRMED",
          creditBatchId: batchId,
        })
        .returning()
        .get();
      bookingId = created.id;
    }

    return { ok: true, bookingId, creditBatchId: batchId };
  });
}

export type CancelResult =
  | { ok: true; refunded: boolean }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "NOT_YOURS"
        | "ALREADY_CANCELLED"
        | "PAST"
        | "TOO_LATE_TO_CANCEL";
    };

/**
 * Cancel a booking and return the session to the member's balance.
 *
 * Cancellation is only open until FREE_CANCELLATION_HOURS before the start.
 * Inside that window the booking is locked rather than silently swallowing the
 * session: with five reformers in the room, a spot given up an hour before the
 * class cannot be refilled, so the honest answer is "you can no longer cancel"
 * rather than "cancelled, and you lost it".
 *
 * The refund goes back to the exact batch the session was spent from, so it
 * keeps that batch's original expiry instead of being extended by a cancel.
 */
export function cancelBooking(
  userId: string,
  bookingId: string,
  now = new Date(),
): CancelResult {
  return db.transaction((): CancelResult => {
    const booking = db
      .select()
      .from(bookings)
      .where(eq(bookings.id, bookingId))
      .get();

    if (!booking) return { ok: false, code: "NOT_FOUND" };
    if (booking.userId !== userId) return { ok: false, code: "NOT_YOURS" };
    if (booking.status === "CANCELLED")
      return { ok: false, code: "ALREADY_CANCELLED" };

    const session = db
      .select()
      .from(classSessions)
      .where(eq(classSessions.id, booking.sessionId))
      .get();
    if (!session) return { ok: false, code: "NOT_FOUND" };
    if (session.startsAt.getTime() <= now.getTime())
      return { ok: false, code: "PAST" };

    if (!isFreeCancellation(session.startsAt, now))
      return { ok: false, code: "TOO_LATE_TO_CANCEL" };

    refundOneCredit(userId, booking.creditBatchId, {
      bookingId: booking.id,
      note: "Cancelled inside the free window",
    });

    db.update(bookings)
      .set({
        status: "CANCELLED",
        cancelledAt: now,
        creditRefunded: true,
      })
      .where(eq(bookings.id, booking.id))
      .run();

    return { ok: true, refunded: true };
  });
}

/* ------------------------------------------------------------------ Queries */

export type SessionView = {
  id: string;
  startsAt: Date;
  endsAt: Date;
  capacity: number;
  status: string;
  booked: number;
  spotsLeft: number;
  note: string | null;
  classType: {
    slug: string;
    nameEn: string;
    nameEl: string;
    level: string;
    intensity: number;
    descEn: string;
    descEl: string;
  };
  instructor: { name: string } | null;
  /** Set when a user id is supplied */
  myBookingId?: string | null;
};

/**
 * Sessions in a date range, with live occupancy and the visitor's own booking.
 *
 * A class that has already started is not shown. At noon, this morning's 06:00
 * is not something anybody can book, attend or usefully read about — it is
 * clutter above the classes that are still available, and on a phone it is
 * clutter the member has to scroll past. `includePast` exists for the desk,
 * where the opposite is true: reception needs this morning's roster to mark who
 * came.
 */
export async function listSessions(opts: {
  from: Date;
  to: Date;
  userId?: string | null;
  /** The desk's view: everything in the range, started or not. */
  includePast?: boolean;
  now?: Date;
}): Promise<SessionView[]> {
  /* Correct any classes still carrying an older room description before they
     are shown. Runs once per process; see schedule-repair.ts. */
  repairScheduleOnce();

  const rows = await db
    .select({
      s: classSessions,
      ct: classTypes,
      inst: instructors,
      booked: sql<number>`(
        select count(*) from bookings b
        where b.session_id = ${classSessions.id} and b.status != 'CANCELLED'
      )`,
      mine: opts.userId
        ? sql<string | null>`(
            select b.id from bookings b
            where b.session_id = ${classSessions.id}
              and b.user_id = ${opts.userId}
              and b.status != 'CANCELLED'
            limit 1
          )`
        : sql<string | null>`null`,
    })
    .from(classSessions)
    .innerJoin(classTypes, eq(classSessions.classTypeId, classTypes.id))
    .leftJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(
      and(
        gte(classSessions.startsAt, opts.from),
        lte(classSessions.startsAt, opts.to),
        /* The floor is the later of "the range starts" and "right now", so a
           range covering today shows only what is still to come. */
        ...(opts.includePast
          ? []
          : [gte(classSessions.startsAt, opts.now ?? new Date())]),
      ),
    )
    .orderBy(asc(classSessions.startsAt));

  return rows.map(({ s, ct, inst, booked, mine }) => ({
    id: s.id,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    capacity: s.capacity,
    status: s.status,
    booked: Number(booked ?? 0),
    spotsLeft: Math.max(0, s.capacity - Number(booked ?? 0)),
    note: s.note,
    classType: {
      slug: ct.slug,
      nameEn: ct.nameEn,
      nameEl: ct.nameEl,
      level: ct.level,
      intensity: ct.intensity,
      descEn: ct.descEn,
      descEl: ct.descEl,
    },
    instructor: inst ? { name: inst.name } : null,
    myBookingId: mine ?? null,
  }));
}

export type MyBooking = {
  id: string;
  status: string;
  creditRefunded: boolean;
  startsAt: Date;
  endsAt: Date;
  className: { en: string; el: string };
  instructor: string | null;
  freeCancellationUntil: Date;
};

export async function listMyBookings(userId: string) {
  const rows = await db
    .select({ b: bookings, s: classSessions, ct: classTypes, inst: instructors })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(classTypes, eq(classSessions.classTypeId, classTypes.id))
    .leftJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(eq(bookings.userId, userId))
    .orderBy(asc(classSessions.startsAt));

  const mapped: MyBooking[] = rows.map(({ b, s, ct, inst }) => ({
    id: b.id,
    status: b.status,
    creditRefunded: b.creditRefunded,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    className: { en: ct.nameEn, el: ct.nameEl },
    instructor: inst?.name ?? null,
    freeCancellationUntil: new Date(
      s.startsAt.getTime() - FREE_CANCELLATION_HOURS * 60 * 60 * 1000,
    ),
  }));

  const now = Date.now();
  return {
    upcoming: mapped
      .filter((b) => b.status === "CONFIRMED" && b.startsAt.getTime() > now)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()),
    past: mapped
      .filter((b) => b.startsAt.getTime() <= now || b.status !== "CONFIRMED")
      .sort((a, b) => b.startsAt.getTime() - a.startsAt.getTime()),
  };
}
