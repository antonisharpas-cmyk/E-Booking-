import { and, eq, gte, inArray, lt } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  classSessions,
  studioClosures,
  users,
  type StudioClosure,
} from "@/db/schema";
import { refundOneCredit } from "@/lib/credits";
import { studioDateKey, studioStartOfDay, studioAddDays } from "@/lib/time";

/**
 * Days the studio is shut.
 *
 * A closure is a statement about a *day in Larnaca* — the 15th of August, the
 * fortnight in July — not about an instant in time, so it is stored as the
 * studio's own calendar day and compared that way. That keeps it right whether
 * the server runs in Cyprus or in UTC.
 *
 * Closing a day is not a soft thing: every booking on it is cancelled and the
 * session goes back to the member, even inside the 24-hour window, because it
 * is the studio that changed its mind and not the member. The classes are
 * marked cancelled so the timetable stops offering them, and reception gets the
 * list of everyone affected so they can be told.
 */

export type ClosureView = {
  id: string;
  day: string;
  reasonEn: string;
  reasonEl: string;
  /** Classes that were cancelled when the day was closed. */
  classesCancelled: number;
  bookingsRefunded: number;
};

export type CloseResult = {
  day: string;
  classesCancelled: number;
  /** Who lost a class, so the desk can ring them. */
  affected: {
    userId: string;
    name: string;
    email: string;
    phone: string | null;
    startsAt: Date;
    refunded: boolean;
  }[];
};

/** Every closure from today onwards, soonest first. */
export function upcomingClosures(now = new Date()): StudioClosure[] {
  const from = studioDateKey(studioStartOfDay(now));
  return db
    .select()
    .from(studioClosures)
    .all()
    .filter((c) => c.day >= from)
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** The set of closed days, for the timetable to skip. */
export function closedDaySet(): Set<string> {
  return new Set(
    db
      .select({ day: studioClosures.day })
      .from(studioClosures)
      .all()
      .map((r) => r.day),
  );
}

export function isClosed(day: Date | string) {
  const key = typeof day === "string" ? day : studioDateKey(day);
  return Boolean(
    db.select().from(studioClosures).where(eq(studioClosures.day, key)).get(),
  );
}

/**
 * Shut one day.
 *
 * Everything happens in one transaction: if a single refund fails, the day is
 * not left half closed with half the members refunded.
 */
export function closeDay(args: {
  day: string;
  reasonEn: string;
  reasonEl?: string;
  staffId: string;
  now?: Date;
}): CloseResult {
  const { day, reasonEn, reasonEl = "", staffId, now = new Date() } = args;

  return db.transaction((): CloseResult => {
    db.insert(studioClosures)
      .values({ day, reasonEn, reasonEl, createdBy: staffId })
      .onConflictDoUpdate({
        target: studioClosures.day,
        set: { reasonEn, reasonEl },
      })
      .run();

    /* The day, as the studio reckons it. */
    const start = studioStartOfDay(new Date(`${day}T12:00:00Z`));
    const end = studioAddDays(start, 1);

    const doomed = db
      .select()
      .from(classSessions)
      .where(
        and(gte(classSessions.startsAt, start), lt(classSessions.startsAt, end)),
      )
      .all();

    if (!doomed.length) return { day, classesCancelled: 0, affected: [] };

    const ids = doomed.map((s) => s.id);
    const live = db
      .select()
      .from(bookings)
      .where(
        and(
          inArray(bookings.sessionId, ids),
          eq(bookings.status, "CONFIRMED"),
        ),
      )
      .all();

    const affected: CloseResult["affected"] = [];

    for (const booking of live) {
      /* Past classes are history: a class that already happened is not refunded
         because the studio closed the day afterwards. */
      const session = doomed.find((s) => s.id === booking.sessionId)!;
      const future = session.startsAt.getTime() > now.getTime();

      if (future) {
        refundOneCredit(booking.userId, booking.creditBatchId, {
          bookingId: booking.id,
          note: `Studio closed ${day}`,
        });
        db.update(bookings)
          .set({ status: "CANCELLED", cancelledAt: now, creditRefunded: true })
          .where(eq(bookings.id, booking.id))
          .run();
      }

      const member = db
        .select({
          name: users.name,
          email: users.email,
          phone: users.phone,
        })
        .from(users)
        .where(eq(users.id, booking.userId))
        .get();

      affected.push({
        userId: booking.userId,
        name: member?.name ?? "",
        email: member?.email ?? "",
        phone: member?.phone ?? null,
        startsAt: session.startsAt,
        refunded: future,
      });
    }

    /* The classes themselves stop existing as far as the timetable is
       concerned. Kept as rows rather than deleted so the history of what was
       scheduled — and who had been in it — survives. */
    db.update(classSessions)
      .set({ status: "CANCELLED" })
      .where(inArray(classSessions.id, ids))
      .run();

    return { day, classesCancelled: doomed.length, affected };
  });
}

/** Open a day back up. Cancelled classes are restored; bookings are not. */
export function reopenDay(day: string) {
  return db.transaction(() => {
    const removed = db
      .delete(studioClosures)
      .where(eq(studioClosures.day, day))
      .run();

    if (!removed.changes) return { day, reopened: false, classesRestored: 0 };

    const start = studioStartOfDay(new Date(`${day}T12:00:00Z`));
    const end = studioAddDays(start, 1);

    /* The classes come back empty. Members whose bookings were refunded keep
       their sessions and book again if they still want the slot — quietly
       reinstating a booking somebody has been told is cancelled would be
       worse than asking them to rebook. */
    const restored = db
      .update(classSessions)
      .set({ status: "SCHEDULED" })
      .where(
        and(
          gte(classSessions.startsAt, start),
          lt(classSessions.startsAt, end),
          eq(classSessions.status, "CANCELLED"),
        ),
      )
      .run();

    return { day, reopened: true, classesRestored: restored.changes };
  });
}
