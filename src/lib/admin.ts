import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "@/db";
import {
  bookings,
  classSessions,
  classTypes,
  creditBatches,
  instructors,
  purchases,
  users,
} from "@/db/schema";
import { studioAddDays, studioStartOfDay } from "./time";

export type StudioStats = {
  /** Every account, and how many of them arrived inside the period. */
  members: number;
  newMembers: number;
  /** Members holding at least one live session — the studio's active list. */
  membersWithSessions: number;
  /** Bookings made inside the period and still standing. */
  bookings: number;
  /** Bookings made inside the period that were later cancelled. */
  cancellations: number;
  /** Sessions members are holding right now, unspent and unexpired. */
  sessionsOutstanding: number;
  /** Sessions already spent on classes still to come. */
  sessionsBooked: number;
  /** Money actually taken inside the period. */
  revenueCents: number;
  /** Classes on the books ahead of today, for the header line. */
  upcomingSessions: number;
};

/** A period the desk asked for, as two day keys. Either end may be open. */
export type StatsRange = { from?: string | null; to?: string | null };

/**
 * The studio's dummy accounts, kept out of every figure on this screen.
 *
 * They exist so the desk can try a campaign, walk a booking through, or take a
 * test payment without touching a real member — which is the whole point of them
 * and also exactly why they must not appear here. A test purchase of €110 is not
 * €110 the studio took, and a dashboard that says it is will be believed: it is
 * the screen the owner uses to decide whether the month went well.
 *
 * Written as a subquery rather than a join so it can be dropped into a `where`
 * on any table that has a `user_id`, and so adding a figure to this screen
 * cannot accidentally leave the filter off — every count below reads the same
 * clause.
 *
 * Erased members are *not* excluded here. Their payments were real money and
 * still belong in the takings; it is only the headcount that should not include
 * them, and that is filtered separately where the headcount is taken.
 */
function realMember(col: SQLiteColumn) {
  return sql`exists (select 1 from users u where u.id = ${col} and u.is_test = 0)`;
}

/** YYYY-MM-DD, or nothing. Anything else is treated as no bound at all. */
function bound(key: string | null | undefined) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const d = new Date(`${key}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : studioStartOfDay(d);
}

/**
 * The numbers on the desk's front screen.
 *
 * The range is the period the *flows* are measured over — bookings taken, money
 * banked, members who joined. The *stocks* ignore it, because "how many sessions
 * are members holding" has no period: it is true now or it is not. Mixing the
 * two on one screen is how a dashboard ends up lying, so the labels say which
 * is which and this function keeps them apart.
 *
 * Both ends are inclusive and are whole studio days: a range of the 1st to the
 * 1st is that one day, midnight to midnight, not a zero-length instant. Leaving
 * both ends off means all time.
 */
export async function studioStats(
  range: StatsRange = {},
): Promise<StudioStats> {
  const since = bound(range.from);
  /* The far end is exclusive in the query and inclusive to the reader, so the
     last day of the period counts in full rather than up to its first second. */
  const untilDay = bound(range.to);
  const until = untilDay ? studioAddDays(untilDay, 1) : null;

  /** Every flow is filtered the same way, so it is written once. */
  const within = (col: SQLiteColumn) => {
    const parts = [
      ...(since ? [gte(col, since)] : []),
      ...(until ? [lt(col, until)] : []),
    ];
    return parts.length ? and(...parts) : undefined;
  };
  const bounded = Boolean(since || until);

  /* The membership, as a person would count it: real accounts, still attached
     to a person. Test accounts are the studio's own props, and an erased member
     has left — their payments stay in the takings below, but they are no longer
     somebody the studio has. */
  const isRealMember = and(eq(users.isTest, false), isNull(users.erasedAt));

  const memberCount =
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(isRealMember)
      .get()?.n ?? 0;

  const newMembers = bounded
    ? (db
        .select({ n: sql<number>`count(*)` })
        .from(users)
        .where(and(isRealMember, within(users.createdAt)))
        .get()?.n ?? 0)
    : Number(memberCount);

  /* One live session is enough to count as active: they are coming back. */
  const membersWithSessions =
    db
      .select({ n: sql<number>`count(distinct ${creditBatches.userId})` })
      .from(creditBatches)
      .where(
        and(
          realMember(creditBatches.userId),
          gt(creditBatches.creditsRemaining, 0),
          or(
            isNull(creditBatches.expiresAt),
            gt(creditBatches.expiresAt, new Date()),
          ),
        ),
      )
      .get()?.n ?? 0;

  const bookingCount =
    db
      .select({ n: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(
          realMember(bookings.userId),
          ne(bookings.status, "CANCELLED"),
          within(bookings.createdAt),
        ),
      )
      .get()?.n ?? 0;

  /* Counted separately rather than folded into the number above. A desk
     reading "12 bookings" needs to know whether the day was quiet or whether
     nine people cancelled, and a single net figure hides the difference. */
  const cancelledCount =
    db
      .select({ n: sql<number>`count(*)` })
      .from(bookings)
      .where(
        and(
          realMember(bookings.userId),
          eq(bookings.status, "CANCELLED"),
          within(bookings.createdAt),
        ),
      )
      .get()?.n ?? 0;

  /* Only sessions that can still be spent. A batch that has expired is not
     money the studio owes anybody a class for. */
  const sessionsOutstanding =
    db
      .select({
        n: sql<number>`coalesce(sum(${creditBatches.creditsRemaining}),0)`,
      })
      .from(creditBatches)
      .where(
        and(
          realMember(creditBatches.userId),
          gt(creditBatches.creditsRemaining, 0),
          or(
            isNull(creditBatches.expiresAt),
            gt(creditBatches.expiresAt, new Date()),
          ),
        ),
      )
      .get()?.n ?? 0;

  /* Sessions already committed to a class that has not happened yet: what the
     studio owes in teaching rather than in credit. */
  const sessionsBooked =
    db
      .select({ n: sql<number>`count(*)` })
      .from(bookings)
      .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
      .where(
        and(
          realMember(bookings.userId),
          eq(bookings.status, "CONFIRMED"),
          gte(classSessions.startsAt, new Date()),
          eq(classSessions.status, "SCHEDULED"),
        ),
      )
      .get()?.n ?? 0;

  const revenueCents =
    db
      .select({ n: sql<number>`coalesce(sum(${purchases.amountCents}),0)` })
      .from(purchases)
      .where(
        and(
          realMember(purchases.userId),
          eq(purchases.status, "PAID"),
          within(purchases.createdAt),
        ),
      )
      .get()?.n ?? 0;

  const upcoming =
    db
      .select({ n: sql<number>`count(*)` })
      .from(classSessions)
      .where(
        and(
          gte(classSessions.startsAt, new Date()),
          eq(classSessions.status, "SCHEDULED"),
        ),
      )
      .get()?.n ?? 0;

  return {
    members: Number(memberCount),
    newMembers: Number(newMembers),
    membersWithSessions: Number(membersWithSessions),
    bookings: Number(bookingCount),
    cancellations: Number(cancelledCount),
    sessionsOutstanding: Number(sessionsOutstanding),
    sessionsBooked: Number(sessionsBooked),
    revenueCents: Number(revenueCents),
    upcomingSessions: Number(upcoming),
  };
}

/**
 * Classes on the books ahead of today.
 *
 * Split out of the statistics because it is not one of them: it tells the desk
 * whether the rota needs rolling forward, which reception needs to know, while
 * the takings and the membership count do not leave the owner's screen.
 */
export function upcomingClassCount() {
  return Number(
    db
      .select({ n: sql<number>`count(*)` })
      .from(classSessions)
      .where(
        and(
          gte(classSessions.startsAt, new Date()),
          eq(classSessions.status, "SCHEDULED"),
        ),
      )
      .get()?.n ?? 0,
  );
}

/** Classes on a given day with their roster. */
export async function daySessions(day = new Date()) {
  const from = studioStartOfDay(day);
  const to = studioAddDays(from, 1);

  const sessions = await db
    .select({ s: classSessions, ct: classTypes, inst: instructors })
    .from(classSessions)
    .innerJoin(classTypes, eq(classSessions.classTypeId, classTypes.id))
    .leftJoin(instructors, eq(classSessions.instructorId, instructors.id))
    .where(
      and(gte(classSessions.startsAt, from), lte(classSessions.startsAt, to)),
    )
    .orderBy(asc(classSessions.startsAt));

  const roster = await db
    .select({ b: bookings, u: users })
    .from(bookings)
    .innerJoin(users, eq(bookings.userId, users.id))
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .where(
      and(
        gte(classSessions.startsAt, from),
        lte(classSessions.startsAt, to),
        ne(bookings.status, "CANCELLED"),
      ),
    );

  return sessions.map(({ s, ct, inst }) => ({
    id: s.id,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    capacity: s.capacity,
    status: s.status,
    className: { en: ct.nameEn, el: ct.nameEl },
    instructor: inst?.name ?? null,
    attendees: roster
      .filter((r) => r.b.sessionId === s.id)
      .map((r) => ({
        bookingId: r.b.id,
        status: r.b.status,
        name: r.u.name,
        email: r.u.email,
        phone: r.u.phone,
      })),
  }));
}

export async function memberList(limit = 100) {
  const rows = await db
    .select({
      u: users,
      credits: sql<number>`(
        select coalesce(sum(cb.credits_remaining),0) from credit_batches cb
        where cb.user_id = ${users.id}
          and (cb.expires_at is null or cb.expires_at > ${Date.now()})
      )`,
      classes: sql<number>`(
        select count(*) from bookings b
        where b.user_id = ${users.id} and b.status != 'CANCELLED'
      )`,
      spent: sql<number>`(
        select coalesce(sum(p.amount_cents),0) from purchases p
        where p.user_id = ${users.id} and p.status = 'PAID'
      )`,
    })
    .from(users)
    /* Same rule as the figures above. Nothing reads this list today, and the
       filter is here so that whatever reads it next inherits the rule rather
       than rediscovering it. */
    .where(eq(users.isTest, false))
    .orderBy(desc(users.createdAt))
    .limit(limit);

  return rows.map(({ u, credits, classes, spent }) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    createdAt: u.createdAt,
    credits: Number(credits ?? 0),
    classes: Number(classes ?? 0),
    spentCents: Number(spent ?? 0),
  }));
}
