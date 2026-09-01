import { and, asc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  classSessions,
  classTypes,
  creditBatches,
  creditLedger,
  instructors,
} from "@/db/schema";
import {
  kindsThatPayFor,
  lastClassDateFor,
  refundOneCredit,
  spendableAnywhere,
  spendBlockReason,
  spendOneCredit,
} from "./credits";
import {
  isPersonalBookable,
  isPersonalCancellable,
  personalBookingClosesAt,
} from "./personal";
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
  | "CREDITS_NOT_VALID_HERE"
  /** Their sessions expire before this class runs. Carries the last date. */
  | "SESSIONS_EXPIRE_FIRST"
  /** An appointment, asked for after the end of the day before. */
  | "PERSONAL_TOO_LATE"
  /** They hold class sessions but nothing that buys an appointment. */
  | "NEEDS_PERSONAL_CREDIT"
  /** Two people are coming and they hold no duet session. */
  | "NEEDS_DUET_CREDIT"
  /** They hold a duet session and asked for the hour on their own. */
  | "DUET_IS_FOR_TWO"
  /** An Unlimited plan, and this is the second class they have asked for today. */
  | "ONE_PER_DAY";

export type BookingResult =
  | {
      ok: true;
      bookingId: string;
      creditBatchId: string | null;
      /** Set when a duet session paid for it, so the caller can say so. */
      guestName: string | null;
    }
  | {
      ok: false;
      code: Exclude<BookingResultCode, "OK">;
      /**
       * The last class date their sessions reach. Set only on
       * SESSIONS_EXPIRE_FIRST, so the refusal can name a date instead of
       * telling somebody their sessions are no good and leaving them to guess
       * which date would have worked.
       */
      until?: Date;
    };

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
  optsOrNow: { guestName?: string | null; now?: Date } | Date = {},
): BookingResult {
  /* The old two-argument form is still in use by the desk and by four test
     suites, and there is no reason to make them all change to gain a parameter
     none of them needs. */
  const opts = optsOrNow instanceof Date ? { now: optsOrNow } : optsOrNow;
  const now = opts.now ?? new Date();
  const guestName = opts.guestName?.trim() || null;

  return db.transaction((): BookingResult => {
    const session = db
      .select({ s: classSessions, kind: classTypes.kind })
      .from(classSessions)
      .innerJoin(classTypes, eq(classSessions.classTypeId, classTypes.id))
      .where(eq(classSessions.id, sessionId))
      .get();

    if (!session) return { ok: false, code: "SESSION_NOT_FOUND" };
    const classKind = session.kind === "PERSONAL" ? "PERSONAL" : "GROUP";
    const personal = classKind === "PERSONAL";
    const seats = personal && guestName ? 2 : 1;

    if (session.s.status !== "SCHEDULED")
      return { ok: false, code: "SESSION_CANCELLED" };

    /* Two different cutoffs, because they answer two different questions. A
       group class closes a minute before it starts: the room is already open and
       the instructor is already there. An appointment closes at the end of the
       previous day, because between now and noon somebody has to be asked to
       come in and work an hour they were not rostered for. */
    if (personal) {
      if (!isPersonalBookable(session.s.startsAt, now))
        return { ok: false, code: "PERSONAL_TOO_LATE" };
    } else if (!isBookable(session.s.startsAt, now)) {
      return { ok: false, code: "TOO_LATE" };
    }

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

    if (taken >= session.s.capacity) return { ok: false, code: "CLASS_FULL" };

    /* The class date goes in, so a session that may only be spent on the
       opening week cannot be burned on a class in November, and the kinds go in
       so a group session cannot buy an appointment or the other way round. */
    const kinds = kindsThatPayFor(classKind, seats);
    const batchId = spendOneCredit(
      userId,
      {
        note: session.s.id,
        classStartsAt: session.s.startsAt,
        kinds,
        sessionId,
      },
      now,
    );
    if (!batchId) {
      /**
       * Six different reasons a member with a visible balance cannot book, and
       * each needs its own sentence. "You have no sessions" said to somebody
       * looking at a balance of six is how a site loses their trust in one line,
       * and it was wrong that way once already over the opening week.
       */
      const why = spendBlockReason(
        userId,
        { classStartsAt: session.s.startsAt, kinds, sessionId },
        now,
      );
      if (why === "NONE") return { ok: false, code: "NO_CREDITS" };
      /**
       * Out past the end of the window, and there are two quite different
       * reasons for that.
       *
       * An ordinary pack's window is its own expiry: the sessions die before
       * this class runs, and the useful sentence names the last date that would
       * have worked. The opening-week offer is the other kind, a week in the
       * middle of the calendar with a start as well as an end, and it needs the
       * sentence it already has. `lastClassDateFor` looks only at batches with
       * no start date, which is exactly what separates the two.
       */
      if (why === "WINDOW") {
        const until = lastClassDateFor(userId, kinds, now);
        if (until) return { ok: false, code: "SESSIONS_EXPIRE_FIRST", until };
        return { ok: false, code: "CREDITS_NOT_VALID_HERE" };
      }
      if (why === "PER_DAY") return { ok: false, code: "ONE_PER_DAY" };
      if (why === "WRONG_KIND") {
        if (!personal) return { ok: false, code: "CREDITS_NOT_VALID_HERE" };
        if (seats > 1) return { ok: false, code: "NEEDS_DUET_CREDIT" };
        /* Asking for the hour alone. If a duet session is what they are
           holding, saying "you need a personal session" is true and unhelpful;
           the useful sentence is that a duet is for two. */
        return {
          ok: false,
          code: spendableAnywhere(userId, now, ["DUET"])
            ? "DUET_IS_FOR_TWO"
            : "NEEDS_PERSONAL_CREDIT",
        };
      }
      return { ok: false, code: "CREDITS_NOT_VALID_HERE" };
    }

    /* Only recorded when a duet session actually paid. Somebody who typed a
       name and was served by a personal session is one person coming, and the
       instructor should not be told to set up two reformers. */
    const paidKind = db
      .select({ kind: creditBatches.kind })
      .from(creditBatches)
      .where(eq(creditBatches.id, batchId))
      .get()?.kind;
    const guest = paidKind === "DUET" ? guestName : null;

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
          guestName: guest,
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
          guestName: guest,
        })
        .returning()
        .get();
      bookingId = created.id;
    }

    /* Tie the spend to the booking it paid for. The session has to be taken
       before the booking row exists, so the ledger line is written without a
       booking on it and is given one here. Without this the ledger can say
       which package a session came out of but not which booking spent it, and
       "which package paid for this class?" is the first question asked when a
       member disputes a balance. */
    db.update(creditLedger)
      .set({ bookingId })
      .where(
        and(
          eq(creditLedger.userId, userId),
          eq(creditLedger.batchId, batchId),
          eq(creditLedger.reason, "BOOKING"),
          eq(creditLedger.note, session.s.id),
          isNull(creditLedger.bookingId),
        ),
      )
      .run();

    return { ok: true, bookingId, creditBatchId: batchId, guestName: guest };
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
      .select({ s: classSessions, kind: classTypes.kind })
      .from(classSessions)
      .innerJoin(classTypes, eq(classSessions.classTypeId, classTypes.id))
      .where(eq(classSessions.id, booking.sessionId))
      .get();
    if (!session) return { ok: false, code: "NOT_FOUND" };
    const personal = session.kind === "PERSONAL";
    if (session.s.startsAt.getTime() <= now.getTime())
      return { ok: false, code: "PAST" };

    /* An appointment closes to cancellation on the same line it closes to
       booking, at the end of the previous day. See lib/personal.ts: once an
       instructor has been called in, that hour is worked either way. */
    const open = personal
      ? isPersonalCancellable(session.s.startsAt, now)
      : isFreeCancellation(session.s.startsAt, now);
    if (!open) return { ok: false, code: "TOO_LATE_TO_CANCEL" };

    refundOneCredit(userId, booking.creditBatchId, {
      bookingId: booking.id,
      note: "Cancelled inside the free window",
      /* Only reached if the original batch has gone, and then it matters:
         €30 of one to one must not come back as €20 of group class. */
      kind: personal ? (booking.guestName ? "DUET" : "PERSONAL") : "CLASS",
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
    /** GROUP or PERSONAL. Decides the cutoff and what can pay for it. */
    kind: string;
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
      kind: ct.kind,
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
  /** GROUP or PERSONAL. */
  kind: string;
  /** The second person on a duet, when there is one. */
  guestName: string | null;
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
    /* An appointment closes at the end of the previous day rather than twelve
       hours before, so the date shown to the member is the date the rule
       actually uses. Two different rules meant two different dates, and the one
       on screen has to be the one the Cancel button obeys. */
    freeCancellationUntil:
      ct.kind === "PERSONAL"
        ? personalBookingClosesAt(s.startsAt)
        : new Date(
            s.startsAt.getTime() - FREE_CANCELLATION_HOURS * 60 * 60 * 1000,
          ),
    kind: ct.kind,
    guestName: b.guestName,
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
