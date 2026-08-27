import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { noticeDeliveries, noticeReads, notices, users } from "@/db/schema";

/**
 * Messages from the studio to its members.
 *
 * Written at the desk, read in the member's account. The in-app copy is the one
 * that always exists: the message lands in the app, the count appears next to
 * the member's face, and it is theirs the next time they open the site — whether
 * or not push, email or SMS got through. See src/lib/messaging/deliver.ts for
 * the channels that go out alongside it, and who each one is allowed to reach.
 *
 * Read state is stored as *presence*: a row in notice_reads means read. So
 * sending a notice to four hundred members writes one row, not four hundred,
 * and "unread" costs a left join rather than a fan-out.
 *
 * The trade that buys is that a member's list is computed rather than stored,
 * which is why `visibleTo` carries every rule about who may see what: the offers
 * consent, and the date they joined.
 */


/**
 * Which notices this member is allowed to see, in SQL.
 *
 * Studio and timetable notices go to everyone. Offers only exist for members who
 * ticked offers — and that has to be enforced here, on the read, not only at the
 * moment of sending. Otherwise a member who declines offers today would still
 * find yesterday's offer sitting in their account, and turning offers off would
 * mean nothing retrospectively.
 */
function visibleTo(userId: string) {
  return sql`(
    (
      ${notices.audience} <> 'OFFERS'
      or exists (
        select 1 from users u
        where u.id = ${userId} and u.marketing_opt_in = 1
      )
    )
    /* And nothing from before they joined. Somebody who signs up today has not
       missed last month's closure — they were not a member — and handing a new
       account thirty unread messages, with thirty on their photograph, is a
       worse welcome than an empty list. */
    and ${notices.createdAt} >= (
      select u2.created_at from users u2 where u2.id = ${userId}
    )
  )`;
}

export type NoticeView = {
  id: string;
  title: string;
  body: string;
  createdAt: Date;
  important: boolean;
  read: boolean;
};

export function createNotice(args: {
  titleEn: string;
  bodyEn: string;
  titleEl?: string;
  bodyEl?: string;
  important?: boolean;
  /** ALL for studio and timetable notices, OFFERS for the opt-in audience. */
  audience?: "ALL" | "OFFERS";
  /** Which channels it was sent on, recorded so the history says what happened. */
  channels?: string[];
  staffId: string;
}) {
  return db
    .insert(notices)
    .values({
      titleEn: args.titleEn,
      bodyEn: args.bodyEn,
      titleEl: args.titleEl ?? "",
      bodyEl: args.bodyEl ?? "",
      important: args.important ?? false,
      audience: args.audience ?? "ALL",
      channels: (args.channels ?? []).join(","),
      createdBy: args.staffId,
    })
    .returning()
    .get();
}

export function deleteNotice(id: string) {
  return db.delete(notices).where(eq(notices.id, id)).run().changes > 0;
}

/** What one member sees, newest first, with their own read state. */
export function noticesFor(
  userId: string,
  locale: "en" | "el" = "en",
  limit = 30,
): NoticeView[] {
  const rows = db
    .select({
      id: notices.id,
      titleEn: notices.titleEn,
      titleEl: notices.titleEl,
      bodyEn: notices.bodyEn,
      bodyEl: notices.bodyEl,
      important: notices.important,
      createdAt: notices.createdAt,
      readAt: noticeReads.readAt,
    })
    .from(notices)
    .leftJoin(
      noticeReads,
      sql`${noticeReads.noticeId} = ${notices.id} and ${noticeReads.userId} = ${userId}`,
    )
    .where(visibleTo(userId))
    .orderBy(desc(notices.createdAt))
    .limit(limit)
    .all();

  return rows.map((r) => ({
    id: r.id,
    title: (locale === "el" && r.titleEl) || r.titleEn,
    body: (locale === "el" && r.bodyEl) || r.bodyEn,
    createdAt: r.createdAt,
    important: r.important,
    read: r.readAt !== null,
  }));
}

/** The number next to the member's face in the corner. */
export function unreadCount(userId: string): number {
  const row = db
    .select({ n: sql<number>`count(*)` })
    .from(notices)
    .leftJoin(
      noticeReads,
      sql`${noticeReads.noticeId} = ${notices.id} and ${noticeReads.userId} = ${userId}`,
    )
    .where(sql`${noticeReads.readAt} is null and ${visibleTo(userId)}`)
    .get();
  return row?.n ?? 0;
}

/** Mark one notice read, or every notice the member can see. */
export function markRead(userId: string, noticeId?: string) {
  const now = new Date();
  const ids = noticeId
    ? [noticeId]
    : db
        .select({ id: notices.id })
        .from(notices)
        .where(visibleTo(userId))
        .all()
        .map((r) => r.id);

  for (const id of ids) {
    /* Reading twice is not an error, and the first time is the one that
       counts — so the timestamp is left alone on a repeat. */
    db.insert(noticeReads)
      .values({ noticeId: id, userId, readAt: now })
      .onConflictDoNothing()
      .run();
  }
  return ids.length;
}

/** For the desk: what has been sent, and how many people have read each one. */
export function noticeHistory(limit = 20) {
  const rows = db
    .select({
      id: notices.id,
      titleEn: notices.titleEn,
      bodyEn: notices.bodyEn,
      titleEl: notices.titleEl,
      bodyEl: notices.bodyEl,
      important: notices.important,
      audience: notices.audience,
      channels: notices.channels,
      createdAt: notices.createdAt,
      author: users.name,
    })
    .from(notices)
    .leftJoin(users, eq(notices.createdBy, users.id))
    .orderBy(desc(notices.createdAt))
    .limit(limit)
    .all();

  const members =
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.role, "MEMBER"))
      .get()?.n ?? 0;

  return rows.map((r) => ({
    ...r,
    members,
    /* What each channel did with it, so "sent" is a fact rather than a hope. */
    deliveries: db
      .select()
      .from(noticeDeliveries)
      .where(eq(noticeDeliveries.noticeId, r.id))
      .all()
      .map((d) => ({
        channel: d.channel,
        sent: d.sent,
        failed: d.failed,
        skipped: d.skipped,
        detail: d.detail,
      })),
    reads:
      db
        .select({ n: sql<number>`count(*)` })
        .from(noticeReads)
        .where(eq(noticeReads.noticeId, r.id))
        .get()?.n ?? 0,
  }));
}
