import { and, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { noticeDeliveries, users } from "@/db/schema";
import { emailTransport } from "./email";
import { sendPush, subscriptionsFor } from "./push";
import { smsTransport, toE164 } from "./sms";
import { forEmail } from "./wording";
import type { Channel, ChannelReport, Outgoing } from "./types";

/**
 * Sending one notice to the people who agreed to hear it.
 *
 * Two audiences, and the difference is not a marketing nicety — it is the law
 * and it is also just decent behaviour:
 *
 *   ALL      studio and timetable notices. A class is cancelled, the studio is
 *            shut on Monday, the timetable has changed. Everybody with an
 *            account gets these; agreeing to them is a condition of holding one,
 *            because a member who is not told their class is off has been let
 *            down by the studio, not spared an interruption.
 *
 *   OFFERS   offers, news, new class types. Only members who ticked that box.
 *            Never sent to anybody else, whatever the desk selects.
 *
 * Channels are then filtered a second time, per member: push goes to the devices
 * that granted permission, email to members who left email on, SMS only to
 * members who deliberately turned SMS on and whose number can be dialled.
 *
 * The in-app notice is not a channel here. It is already written to the notices
 * table before this runs, so every member sees it next time they open the site
 * whatever happens below. That is deliberate: a delivery failure should never
 * mean the message is lost.
 */

export type Audience = "ALL" | "OFFERS";

/**
 * Narrowing the audience by what a member has actually done.
 *
 * The audience above is about *consent* — may we write to this person at all.
 * This is about *relevance*: which of the people who agreed would find this
 * particular message worth receiving. The two are applied together and the
 * consent one is never weakened by the other, which is the whole point of
 * keeping them separate. A promotion to "members who never bought a pack" still
 * reaches only those who accepted offers.
 *
 * Every field is optional and they combine with AND. Nothing set means everybody
 * the audience covers, which is how the screen behaved before this existed.
 */
export type Segment = {
  /** Never paid for anything — no PAID purchase, by card or at the desk. */
  neverPaid?: boolean;
  /** No usable sessions right now: nothing left, or everything expired. */
  noSessionsLeft?: boolean;
  /**
   * Has not been to a class for at least this many days — *or has never been*.
   *
   * Somebody who has never come is included deliberately. For a "we have not
   * seen you in a while" message they are the same audience: a person who is not
   * coming to the studio. Excluding them would leave the most winnable group out
   * of every campaign aimed at exactly that group.
   */
  inactiveDays?: number;
};

/** One line saying who a notice went to, kept with it so the history is honest. */
export function describeSegment(audience: Audience, seg: Segment, includeTest = false) {
  const bits: string[] = [audience === "OFFERS" ? "offers audience" : "everyone"];
  if (seg.neverPaid) bits.push("never bought");
  if (seg.noSessionsLeft) bits.push("no sessions left");
  if (seg.inactiveDays) bits.push(`away ${seg.inactiveDays}d+`);
  if (includeTest) bits.push("incl. test accounts");
  return bits.join(" · ");
}

type Recipient = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  notifyEmail: boolean;
  notifySms: boolean;
  locale: "en" | "el";
};

/**
 * Everybody the audience covers. Staff accounts are people too — they get them.
 *
 * `includeTest` decides whether accounts marked as tests are in. The default is
 * out, and the default is the one that matters: a studio trying a campaign
 * should not have to remember to exclude its own dummy members, and a real
 * announcement counted as reaching 41 people when four of them are the owner's
 * experiments is a number that will be quoted at somebody later.
 */
export function recipientsFor(
  audience: Audience,
  includeTest = false,
  segment: Segment = {},
): Recipient[] {
  const audienceRule =
    audience === "OFFERS"
      ? eq(users.marketingOptIn, true)
      : /* Members who have not yet given the service consent — accounts made
           before it existed — are not written to until they do. */
        isNotNull(users.serviceOptInAt);

  const rules = [audienceRule];
  if (!includeTest) rules.push(eq(users.isTest, false));

  /* Never paid. A desk cash sale writes a PAID purchase just as a card payment
     does, so this is "has never given the studio any money" rather than "has
     never used the website" — which is the question actually being asked. Free
     sessions granted as an adjustment write no purchase and so do not count as
     paying, which is right: a comped session is not a deposit. */
  if (segment.neverPaid) {
    rules.push(sql`not exists (
      select 1 from purchases p
      where p.user_id = ${users.id} and p.status = 'PAID'
    )`);
  }

  /* Nothing usable in the wallet. Expiry matters here: somebody holding five
     sessions that ran out last month has no sessions, whatever the row says. */
  if (segment.noSessionsLeft) {
    const now = Math.floor(Date.now() / 1000);
    rules.push(sql`not exists (
      select 1 from credit_batches b
      where b.user_id = ${users.id}
        and b.credits_remaining > 0
        and (b.expires_at is null or b.expires_at > ${now})
    )`);
  }

  /* Away for a while, or never here at all. A class counts as attended if they
     were booked on it and it has happened — ATTENDED where the desk marked the
     register, CONFIRMED where nobody got round to it. A cancellation is not a
     visit. */
  if (segment.inactiveDays && segment.inactiveDays > 0) {
    const cutoff = Math.floor(
      (Date.now() - segment.inactiveDays * 86_400_000) / 1000,
    );
    const now = Math.floor(Date.now() / 1000);
    rules.push(sql`coalesce((
      select max(s.starts_at) from bookings bk
      join class_sessions s on s.id = bk.session_id
      where bk.user_id = ${users.id}
        and bk.status in ('ATTENDED', 'CONFIRMED')
        and s.starts_at <= ${now}
    ), 0) <= ${cutoff}`);
  }

  const rows = db.select().from(users).where(and(...rules)).all();

  return rows.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    notifyEmail: u.notifyEmail,
    notifySms: u.notifySms,
    /* No per-member language column yet: the studio's own language is used, and
       the Greek text is sent when the notice has one. */
    locale: "en" as const,
  }));
}

/** What each channel would reach right now — shown at the desk before sending. */
export function reachOf(audience: Audience, includeTest = false, segment: Segment = {}) {
  const people = recipientsFor(audience, includeTest, segment);
  const withPush = new Set(subscriptionsFor(people.map((p) => p.id)).map((s) => s.userId));

  return {
    people: people.length,
    push: people.filter((p) => withPush.has(p.id)).length,
    email: people.filter((p) => p.notifyEmail && p.email).length,
    sms: people.filter((p) => p.notifySms && toE164(p.phone)).length,
    /* So the desk can say "4 test accounts excluded" rather than leaving
       somebody to wonder why the count dropped. */
    testAccounts: db.select().from(users).where(eq(users.isTest, true)).all().length,
  };
}

/** How many accounts there are in total, so "0 of 120" is legible. */
export function membershipSize() {
  return db
    .select()
    .from(users)
    .where(and(ne(users.role, "STAFF"), eq(users.isTest, false)))
    .all().length;
}

export async function deliverNotice(args: {
  noticeId: string;
  audience: Audience;
  channels: Channel[];
  en: Outgoing;
  el?: Outgoing;
  /** Send to accounts marked as tests as well. Off unless asked for. */
  includeTest?: boolean;
  /** Narrow it further by what members have done. See Segment. */
  segment?: Segment;
}): Promise<ChannelReport[]> {
  const people = recipientsFor(
    args.audience,
    args.includeTest ?? false,
    args.segment ?? {},
  );
  const reports: ChannelReport[] = [];

  /* Errors are collected, not thrown. One member with a dead mailbox must not
     stop the other 399 being told the studio is shut tomorrow. */
  const note = (r: ChannelReport, e: string) => {
    if (r.errors.length < 5) r.errors.push(e);
  };

  for (const channel of args.channels) {
    const report: ChannelReport = { channel, sent: 0, failed: 0, skipped: 0, errors: [] };

    if (channel === "push") {
      const subs = subscriptionsFor(people.map((p) => p.id));
      const reached = new Set<string>();
      for (const sub of subs) {
        const res = await sendPush(sub, args.en);
        if (res.ok) {
          report.sent++;
          reached.add(sub.userId);
        } else {
          report.failed++;
          note(report, res.error);
        }
      }
      /* Skipped means "this channel did not apply to them": no device has ever
         asked for permission. It is not a failure and should not read as one. */
      report.skipped = people.filter((p) => !reached.has(p.id)).length;
    }

    if (channel === "email") {
      const t = emailTransport();
      /* Both languages, in one email, signed in each. The desk types the Greek
         version or it does not; when it has, every member gets both and nobody
         has to have been asked which they read. Composed once rather than per
         recipient — it is the same letter four hundred times. */
      const letter = forEmail(args.en, args.el);
      for (const p of people) {
        if (!p.notifyEmail || !p.email) {
          report.skipped++;
          continue;
        }
        const res = await t.send(p.email, letter);
        if (res.ok) report.sent++;
        else {
          report.failed++;
          note(report, res.error);
        }
      }
    }

    if (channel === "sms") {
      const t = smsTransport();
      for (const p of people) {
        const number = p.notifySms ? toE164(p.phone) : null;
        if (!number) {
          report.skipped++;
          continue;
        }
        /* SMS carries the words alone — no subject line, and short, because
           every 160 characters is another message on the invoice. */
        const res = await t.send(number, {
          subject: args.en.subject,
          body: `APEX pilates: ${args.en.subject}\n${args.en.body}`.slice(0, 320),
        });
        if (res.ok) report.sent++;
        else {
          report.failed++;
          note(report, res.error);
        }
      }
    }

    db.insert(noticeDeliveries)
      .values({
        noticeId: args.noticeId,
        channel,
        sent: report.sent,
        failed: report.failed,
        skipped: report.skipped,
        detail: report.errors.join(" | ").slice(0, 900),
      })
      .run();

    reports.push(report);
  }

  return reports;
}

/** What happened when a notice went out, for the desk's history list. */
export function deliveriesFor(noticeId: string) {
  return db
    .select()
    .from(noticeDeliveries)
    .where(eq(noticeDeliveries.noticeId, noticeId))
    .all();
}

/** Which transports are actually wired up, for the desk to see before sending. */
export function transportStatus() {
  const email = emailTransport();
  const sms = smsTransport();
  return {
    email: { name: email.name, ready: email.ready },
    sms: { name: sms.name, ready: sms.ready },
  };
}
