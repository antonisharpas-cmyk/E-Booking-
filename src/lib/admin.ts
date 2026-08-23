import { and, asc, desc, eq, gte, lte, ne, sql } from "drizzle-orm";
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

export async function studioStats() {
  const memberCount =
    db.select({ n: sql<number>`count(*)` }).from(users).get()?.n ?? 0;

  const bookingCount =
    db
      .select({ n: sql<number>`count(*)` })
      .from(bookings)
      .where(ne(bookings.status, "CANCELLED"))
      .get()?.n ?? 0;

  const creditsOutstanding =
    db
      .select({ n: sql<number>`coalesce(sum(credits_remaining),0)` })
      .from(creditBatches)
      .get()?.n ?? 0;

  const revenueCents =
    db
      .select({ n: sql<number>`coalesce(sum(amount_cents),0)` })
      .from(purchases)
      .where(eq(purchases.status, "PAID"))
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
    bookings: Number(bookingCount),
    creditsOutstanding: Number(creditsOutstanding),
    revenueCents: Number(revenueCents),
    upcomingSessions: Number(upcoming),
  };
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
    .where(and(gte(classSessions.startsAt, from), lte(classSessions.startsAt, to)))
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
