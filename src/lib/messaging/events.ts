import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bookings, classSessions, classTypes, users } from "@/db/schema";
import { STUDIO } from "@/lib/studio";
import { createNotice } from "@/lib/notices";
import { dueReminders, markSent } from "@/lib/reminders";
import { emailTransport } from "./email";
import { sendPush, subscriptionsFor } from "./push";
import { smsTransport, toE164 } from "./sms";
import type { Channel, Outgoing } from "./types";

/**
 * The three messages the studio sends without anybody writing them.
 *
 *   booked      "You are booked" — the moment a class is taken
 *   cancelled   "That booking is cancelled" — and whether the session came back
 *   reminder    "Your class is in two hours" — at each member's own lead time
 *
 * All three are push by default and push only. That is deliberate: these fire
 * per booking rather than per announcement, so putting SMS on them would put a
 * few cents on every single booking the studio takes, four hundred times a
 * month, without anybody deciding to spend it. `REMINDER_CHANNELS` widens it if
 * the studio wants to — "push,email" is the sensible next step, and email costs
 * nothing per message on any of the providers.
 *
 * All three land in the member's own account: the number on their photograph goes
 * up and the message is waiting in Notifications. That is the copy that matters,
 * because it is the one they can go and look at afterwards.
 *
 * Whether a *phone* notification also appears is a separate question, and the
 * answer differs by message:
 *
 *   booked / cancelled   in-app only. The member is standing in the app, having
 *                        just pressed the button — the screen has already told
 *                        them, and a system pop-up on top of that is the app
 *                        talking over itself.
 *   reminder             in-app *and* push. This one exists precisely because
 *                        they are not looking at the site: an inbox message
 *                        nobody opens two hours before their class is not a
 *                        reminder, it is a diary entry.
 *
 * One constant decides it, and it is one line to change your mind.
 */

/** Which of the automatic messages also buzz the phone. */
const ALSO_PUSH = { booked: false, cancelled: false, reminder: true };

/** Which channels the automatic messages may use. Push always; the rest opt in. */
function allowedChannels(): Channel[] {
  const raw = (process.env.REMINDER_CHANNELS ?? "push")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim());
  const out: Channel[] = ["push"];
  if (raw.includes("email")) out.push("email");
  if (raw.includes("sms")) out.push("sms");
  return out;
}

/* ------------------------------------------------------- one member, one push */

/** Every device this member has allowed. Returns how many were reached. */
export async function pushToUser(userId: string, msg: Outgoing) {
  const subs = subscriptionsFor([userId]);
  let sent = 0;
  for (const sub of subs) {
    const res = await sendPush(sub, msg);
    if (res.ok) sent++;
  }
  return sent;
}

/* ------------------------------------------------------------ what to say */

type BookingFacts = {
  userId: string;
  name: string;
  email: string;
  phone: string | null;
  notifyEmail: boolean;
  notifySms: boolean;
  startsAt: Date;
  className: string;
};

function factsFor(bookingId: string): BookingFacts | null {
  const row = db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      notifyEmail: users.notifyEmail,
      notifySms: users.notifySms,
      startsAt: classSessions.startsAt,
      className: classTypes.nameEn,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.userId, users.id))
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(classTypes, eq(classSessions.classTypeId, classTypes.id))
    .where(eq(bookings.id, bookingId))
    .get();
  return row ?? null;
}

/**
 * "Saturday 29 August at 18:00", in the studio's own timezone.
 *
 * Exported so the wording is testable. This is the whole substance of a booking
 * confirmation — a member reads the day and the hour and nothing else — so it is
 * worth an assertion rather than a hope.
 */
export function whenWords(d: Date) {
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: STUDIO.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return `${day} at ${time}`;
}

/** Minutes, said the way a person would say them. */
export function leadWords(minutes: number) {
  if (minutes <= 0) return "now";
  if (minutes < 60) return `${minutes} minutes`;
  const h = minutes / 60;
  if (Number.isInteger(h)) return h === 1 ? "1 hour" : `${h} hours`;
  return `${Math.floor(h)}h ${minutes % 60}m`;
}

/**
 * The member's own account copy.
 *
 * Never throws outward: this is called from a booking that has already
 * succeeded, and a failure to write a courtesy message must not surface as a
 * failure to book.
 */
function inbox(userId: string, msg: Outgoing) {
  try {
    createNotice({
      titleEn: msg.subject,
      bodyEn: msg.body,
      userId,
      staffId: null,
    });
  } catch {
    /* Nothing to do about it, and nothing worth failing a booking over. */
  }
}

/* ------------------------------------------------------------ the three sends */

/**
 * Fired when a class is booked. Never awaited by the booking route: a push that
 * fails must not turn a successful booking into an error on screen.
 */
export async function notifyBooked(bookingId: string) {
  const f = factsFor(bookingId);
  if (!f) return 0;

  return deliverPersonal(
    f,
    {
      subject: "Booking confirmed",
      body: `${f.className} — ${whenWords(f.startsAt)}. See you at the studio.`,
      url: "/account?tab=notifications",
    },
    ALSO_PUSH.booked,
  );
}

/** Fired when a booking is cancelled, saying whether the session came back. */
export async function notifyCancelled(bookingId: string, refunded: boolean) {
  const f = factsFor(bookingId);
  if (!f) return 0;

  return deliverPersonal(
    f,
    {
      subject: "Booking cancelled",
      body:
        `${f.className} — ${whenWords(f.startsAt)} is cancelled. ` +
        (refunded
          ? "The session is back in your balance."
          : "This was inside the 24-hour window, so the session was used."),
      url: "/account?tab=notifications",
    },
    ALSO_PUSH.cancelled,
  );
}

async function deliverPersonal(
  f: BookingFacts,
  msg: Outgoing,
  alsoPush: boolean,
) {
  const channels = allowedChannels();

  /* The account copy, always. Written first and outside any condition: it is
     the one the member can come back to, and it is what puts the number on
     their photograph. */
  inbox(f.userId, msg);

  let reached = alsoPush ? await pushToUser(f.userId, msg) : 0;

  if (channels.includes("email") && f.notifyEmail && f.email) {
    const res = await emailTransport().send(f.email, msg);
    if (res.ok) reached++;
  }
  if (channels.includes("sms") && f.notifySms) {
    const number = toE164(f.phone);
    if (number) {
      const res = await smsTransport().send(number, {
        subject: msg.subject,
        body: `APEX pilates: ${msg.subject}. ${msg.body}`.slice(0, 300),
      });
      if (res.ok) reached++;
    }
  }
  return reached;
}

/**
 * The reminder sweep.
 *
 * Every row that has come due and has not been sent. The lead time on the row is
 * the one the member was promised when they booked, not whatever they have set
 * today — see reminders.ts. A row is marked sent whether or not a device was
 * reached, because the alternative is retrying forever at every member who has
 * never allowed notifications.
 */
export async function runDueReminders(now = new Date()) {
  const due = dueReminders(now);
  if (due.length === 0) return { due: 0, pushed: 0, emailed: 0, texted: 0 };

  const channels = allowedChannels();
  let pushed = 0;
  let emailed = 0;
  let texted = 0;

  for (const r of due) {
    const minutes = Math.max(
      0,
      Math.round((r.startsAt.getTime() - now.getTime()) / 60_000),
    );
    const msg: Outgoing = {
      subject: "Your class is coming up",
      body: `Your class starts in ${leadWords(minutes)} — ${whenWords(r.startsAt)}.`,
      url: "/account",
    };

    /* The row remembers which channels the member had on when they booked. The
       studio's own setting can narrow that but never widen it. */
    const rowChannels = r.channels.split(",");
    const use = (c: Channel) => channels.includes(c) && rowChannels.includes(c);

    /* Both, for this one. See ALSO_PUSH above. */
    inbox(r.userId, msg);
    if (ALSO_PUSH.reminder) pushed += await pushToUser(r.userId, msg);

    if (use("email") && r.userEmail) {
      const res = await emailTransport().send(r.userEmail, msg);
      if (res.ok) emailed++;
    }
    if (use("sms")) {
      const number = toE164(r.userPhone);
      if (number) {
        const res = await smsTransport().send(number, {
          subject: msg.subject,
          body: `APEX pilates: ${msg.body}`.slice(0, 300),
        });
        if (res.ok) texted++;
      }
    }
  }

  markSent(due.map((r) => r.id), now);
  return { due: due.length, pushed, emailed, texted };
}

/**
 * A throttled sweep, safe to call from any request.
 *
 * Reminders have to go out whether or not anybody is looking at the site, which
 * is what the cron route is for. This is the belt to that braces: an ordinary
 * page view nudges the queue along, at most once a minute, without ever making
 * the visitor wait for it.
 */
let lastSweep = 0;

export function nudgeReminders() {
  const now = Date.now();
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  void runDueReminders().catch(() => {
    /* A failed sweep is retried a minute later by the next visitor. */
  });
}
