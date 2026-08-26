import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { noticeReads, notices, users } from "@/db/schema";

/**
 * Messages from the studio to its members.
 *
 * Written at the desk, read in the member's account. There is no push provider
 * behind this and it does not pretend there is: the message lands in the app,
 * the count appears next to the member's face, and it is theirs the next time
 * they open the site. When an email or SMS provider is wired up (see
 * src/lib/reminders.ts for where that hook belongs) the same notice can be sent
 * down those channels too, to the members who agreed to them.
 *
 * Read state is stored as *presence*: a row in notice_reads means read. So
 * sending a notice to four hundred members writes one row, not four hundred,
 * and "unread" costs a left join rather than a fan-out.
 */

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
    .where(sql`${noticeReads.readAt} is null`)
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
    reads:
      db
        .select({ n: sql<number>`count(*)` })
        .from(noticeReads)
        .where(eq(noticeReads.noticeId, r.id))
        .get()?.n ?? 0,
  }));
}
