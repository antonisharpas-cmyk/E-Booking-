import { eq, isNotNull, ne } from "drizzle-orm";
import { db } from "@/db";
import { noticeDeliveries, users } from "@/db/schema";
import { emailTransport } from "./email";
import { sendPush, subscriptionsFor } from "./push";
import { smsTransport, toE164 } from "./sms";
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

type Recipient = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  notifyEmail: boolean;
  notifySms: boolean;
  locale: "en" | "el";
};

/** Everybody the audience covers. Staff accounts are people too — they get them. */
export function recipientsFor(audience: Audience): Recipient[] {
  const rows = db
    .select()
    .from(users)
    .where(
      audience === "OFFERS"
        ? eq(users.marketingOptIn, true)
        : /* Members who have not yet given the service consent — accounts made
             before it existed — are not written to until they do. */
          isNotNull(users.serviceOptInAt),
    )
    .all();

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
export function reachOf(audience: Audience) {
  const people = recipientsFor(audience);
  const withPush = new Set(subscriptionsFor(people.map((p) => p.id)).map((s) => s.userId));

  return {
    people: people.length,
    push: people.filter((p) => withPush.has(p.id)).length,
    email: people.filter((p) => p.notifyEmail && p.email).length,
    sms: people.filter((p) => p.notifySms && toE164(p.phone)).length,
  };
}

/** How many accounts there are in total, so "0 of 120" is legible. */
export function membershipSize() {
  return db.select().from(users).where(ne(users.role, "STAFF")).all().length;
}

export async function deliverNotice(args: {
  noticeId: string;
  audience: Audience;
  channels: Channel[];
  en: Outgoing;
  el?: Outgoing;
}): Promise<ChannelReport[]> {
  const people = recipientsFor(args.audience);
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
      for (const p of people) {
        if (!p.notifyEmail || !p.email) {
          report.skipped++;
          continue;
        }
        const res = await t.send(p.email, args.en);
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
