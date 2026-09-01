import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  classSessions,
  classTypes,
  creditBatches,
  purchases,
  users,
} from "@/db/schema";
import { createNotice } from "@/lib/notices";
import { dueReminders, markSent } from "@/lib/reminders";
import { emailTransport } from "./email";
import { sendPush, subscriptionsFor } from "./push";
import { smsTransport, toE164 } from "./sms";
import type { Channel, Outgoing } from "./types";
import { STUDIO_OPS_EMAIL } from "@/lib/personal";
import {
  bookedWords,
  cancelledWords,
  forEmail,
  instructorChangedWords,
  leadWords,
  personalBookedWords,
  personalCancelledWords,
  promoWords,
  purchasedWords,
  reminderWords,
  studioAppointmentWords,
  verifyWords,
  whenWords,
  type Bilingual,
} from "./wording";

/**
 * The four messages the studio sends without anybody writing them.
 *
 *   booked      "The booking is confirmed" — the moment a class is taken
 *   cancelled   "That booking is cancelled" — and whether the session came back
 *   purchased   "Payment received" — the sessions, the price, when they expire
 *   reminder    "Your class is in two hours" — at each member's own lead time
 *
 * Which channels each one uses is the table below and nothing else. It used to
 * be an environment variable plus a second constant, which meant the answer to
 * "does a booking send an email?" lived in two files and a `.env` — so the table
 * is now the only place, and it reads like the decision it encodes.
 */

/** Where each automatic message is allowed to go. The studio's own spec. */
const SENDS: Record<
  | "booked"
  | "cancelled"
  | "purchased"
  | "reminder"
  | "appointment"
  | "instructor",
  { email: boolean; push: boolean; sms: boolean }
> = {
  /* A member who has just pressed Book is looking at the screen that told them
     it worked. The badge goes up and the message is in their list; anything
     more is the app talking over itself. */
  booked: { email: false, push: false, sms: false },
  cancelled: { email: false, push: false, sms: false },

  /* Money is the exception. A payment is the one thing a member may need to
     produce later — to check what they were charged, or when it expires — and
     an email is the copy that survives outside the app. */
  purchased: { email: true, push: false, sms: false },

  /* The one that buzzes the phone, and the only one that should. It exists
     precisely because the member is *not* looking at the site: an inbox message
     two hours before a class, that nobody opens, is not a reminder — it is a
     diary entry. Push costs nothing and needs no provider, so this is the one
     place the free channel earns its keep. */
  reminder: { email: false, push: true, sms: false },

  /**
   * An appointment, to the member: the buzz and the in-app copy, no email.
   *
   * It briefly sent an email as well, on the reasoning that a stricter
   * cancellation rule deserves a copy that survives outside the app. The
   * studio's answer was simpler and it is right: the member is looking at the
   * screen that just confirmed the booking, exactly as with a class. The one
   * party who is *not* looking at a screen is the studio, which has to find an
   * instructor, so the email goes there and only there. The hour and the rule
   * are on the member's own booking in their account, which is where they would
   * look for them anyway.
   */
  appointment: { email: false, push: true, sms: false },

  /**
   * An instructor swapped on a class somebody has booked.
   *
   * Push, because this is the one kind of change a member may want to know about
   * before they arrive, and they are not looking at the site when it happens: the
   * decision is made at the desk, hours or days after they booked. No email,
   * because it is not a receipt and nothing about it needs to survive outside the
   * app. It is also one of the things the studio's own consent rule says a member
   * cannot opt out of, alongside a class being moved or cancelled.
   */
  instructor: { email: false, push: true, sms: false },
};

/**
 * The appointment row, exported so the test suite asserts the decision rather
 * than a copy of it. A table like this is only a decision while something
 * checks it is still the one that was taken.
 */
export const APPOINTMENT_SENDS = SENDS.appointment;

/**
 * The in-app copy is not in that table because it is not a channel. It is
 * written first, unconditionally, for every message — it is what puts the number
 * on the member's photograph, and it is the one copy that cannot fail to be
 * delivered because nothing has to deliver it.
 */

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
  classEn: string;
  classEl: string;
  /** GROUP or PERSONAL. Decides which of two entirely different messages goes. */
  classKind: string;
  /** The second person on a duet, when there is one. */
  guestName: string | null;
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
      classEn: classTypes.nameEn,
      classEl: classTypes.nameEl,
      classKind: classTypes.kind,
      guestName: bookings.guestName,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.userId, users.id))
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(classTypes, eq(classSessions.classTypeId, classTypes.id))
    .where(eq(bookings.id, bookingId))
    .get();
  if (!row) return null;
  /* An older class type may have no Greek name. Falling back to the English one
     is better than a message with a hole in it. */
  return { ...row, classEl: row.classEl || row.classEn };
}

/**
 * The member's own account copy, in both languages.
 *
 * Both are stored so the site can show whichever the member is reading it in —
 * it already knows that, and a bilingual card in a list would be twice as tall
 * for no gain.
 *
 * Never throws outward: this is called from a booking that has already
 * succeeded, and a failure to write a courtesy message must not surface as a
 * failure to book.
 */
function inbox(userId: string, words: Bilingual) {
  try {
    createNotice({
      titleEn: words.en.subject,
      bodyEn: words.en.body,
      titleEl: words.el.subject,
      bodyEl: words.el.body,
      userId,
      staffId: null,
    });
  } catch {
    /* Nothing to do about it, and nothing worth failing a booking over. */
  }
}

/* ------------------------------------------------------------- the four sends */

/**
 * Fired when a class is booked. Never awaited by the booking route: a message
 * that fails must not turn a successful booking into an error on screen.
 */
export async function notifyBooked(bookingId: string) {
  const f = factsFor(bookingId);
  if (!f) return 0;

  /* An appointment is a different message to a different set of people, so the
     branch is here rather than in the four callers. Whoever books it — the
     member on the site, the desk on their behalf — the studio gets told. */
  if (f.classKind === "PERSONAL") {
    void tellStudio(f, false);
    return deliverPersonal(f, personalBookedWords(f), SENDS.appointment);
  }

  return deliverPersonal(f, bookedWords(f), SENDS.booked);
}

/** Fired when a booking is cancelled, saying whether the session came back. */
export async function notifyCancelled(bookingId: string, refunded: boolean) {
  const f = factsFor(bookingId);
  if (!f) return 0;

  if (f.classKind === "PERSONAL") {
    /* The studio has to hear about this one as loudly as it heard about the
       booking. Somebody has been asked to come in at noon, and an appointment
       that quietly disappears from a screen nobody is watching is an instructor
       driving in for nothing. */
    void tellStudio(f, true);
    return deliverPersonal(
      f,
      personalCancelledWords({ startsAt: f.startsAt, refunded }),
      SENDS.appointment,
    );
  }

  return deliverPersonal(
    f,
    cancelledWords({ ...f, refunded }),
    SENDS.cancelled,
  );
}

/**
 * The studio's own copy of an appointment, emailed to the operations address.
 *
 * Never awaited by anything that books or cancels, and never allowed to throw
 * outward: a mail server being down must not turn a completed booking into an
 * error on somebody's screen. It is logged instead, because a failure here is
 * the one failure in this file that costs money — an hour nobody was told about.
 */
async function tellStudio(f: BookingFacts, cancelled: boolean) {
  const words = studioAppointmentWords({
    startsAt: f.startsAt,
    memberName: f.name,
    memberEmail: f.email,
    memberPhone: f.phone,
    guestName: f.guestName,
    cancelled,
  });
  try {
    const res = await emailTransport().send(
      STUDIO_OPS_EMAIL,
      forEmail(words),
    );
    if (!res.ok) {
      console.error(
        `[appointment] could not tell the studio about ${f.startsAt.toISOString()}: ${res.error}`,
      );
    }
    return res.ok;
  } catch (err) {
    console.error("[appointment] could not tell the studio", err);
    return false;
  }
}

/**
 * Fired once a payment has actually become sessions.
 *
 * Called from the single place that grants them, and only by the caller that
 * won the race to grant — a card payment gets reported by the webhook, the
 * browser coming back, and sometimes a later check, so anything hooked less
 * carefully than this would tell the member three times that they had paid.
 *
 * The expiry is read from the batch that was just written rather than
 * recalculated, so the message cannot promise a date the balance disagrees with.
 */
export async function notifyPurchased(purchaseId: string) {
  const row = db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      notifyEmail: users.notifyEmail,
      notifySms: users.notifySms,
      credits: purchases.credits,
      amountCents: purchases.amountCents,
      currency: purchases.currency,
      expiresAt: creditBatches.expiresAt,
    })
    .from(purchases)
    .innerJoin(users, eq(purchases.userId, users.id))
    .leftJoin(creditBatches, eq(creditBatches.purchaseId, purchases.id))
    .where(eq(purchases.id, purchaseId))
    .get();
  if (!row) return 0;

  return deliverPersonal(
    {
      userId: row.userId,
      name: row.name,
      email: row.email,
      phone: row.phone,
      notifyEmail: row.notifyEmail,
      notifySms: row.notifySms,
      /* Not a class, so these are unused by the wording below. */
      startsAt: new Date(),
      classEn: "",
      classEl: "",
      classKind: "GROUP",
      guestName: null,
    },
    purchasedWords({
      credits: row.credits,
      amountCents: row.amountCents,
      currency: row.currency,
      expiresAt: row.expiresAt ?? null,
    }),
    SENDS.purchased,
  );
}

/**
 * The opening-week gift, announced.
 *
 * Emailed as well as put in the account, which is the exception to the table
 * above and a deliberate one: this message is the only place the member is told
 * which week the session is for, and they are being told it during the thirty
 * seconds of signing up, when nobody reads anything. It needs to survive in
 * their inbox.
 */
export async function notifyPromoGranted(
  userId: string,
  promo: { credits: number; spendFrom: Date; spendUntil: Date; expiresAt?: Date },
) {
  const row = db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      phone: users.phone,
      notifyEmail: users.notifyEmail,
      notifySms: users.notifySms,
    })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  if (!row) return 0;

  return deliverPersonal(
    {
      ...row,
      startsAt: new Date(),
      classEn: "",
      classEl: "",
      classKind: "GROUP",
      guestName: null,
    },
    promoWords({
      credits: promo.credits,
      from: promo.spendFrom,
      to: promo.spendUntil,
      expires: promo.expiresAt,
    }),
    { email: true, push: false, sms: false },
  );
}

/**
 * Everybody booked into one class, told their instructor has changed.
 *
 * Returns how many members were written to, which the desk shows back so the
 * person who made the change knows it went somewhere. Cancelled bookings are
 * skipped: somebody who dropped the class has no interest in who is teaching it.
 *
 * Never throws outward. The change to the rota has already been saved by the
 * time this runs, and a push service being slow must not make a saved change
 * look like a failed one.
 */
export async function notifyInstructorChanged(
  sessionId: string,
  change: { from: string; to: string; by: string },
) {
  const rows = db
    .select({
      userId: users.id,
      startsAt: classSessions.startsAt,
      classEn: classTypes.nameEn,
      classEl: classTypes.nameEl,
    })
    .from(bookings)
    .innerJoin(users, eq(bookings.userId, users.id))
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(classTypes, eq(classSessions.classTypeId, classTypes.id))
    .where(and(eq(bookings.sessionId, sessionId), ne(bookings.status, "CANCELLED")))
    .all();

  let told = 0;
  for (const row of rows) {
    const words = instructorChangedWords({
      classEn: row.classEn,
      classEl: row.classEl || row.classEn,
      startsAt: row.startsAt,
      from: change.from,
      to: change.to,
    });
    inbox(row.userId, words);
    if (SENDS.instructor.push) {
      await pushToUser(row.userId, words.en).catch(() => 0);
    }
    told++;
  }

  if (told > 0) {
    console.log(
      `[rota] ${change.from} to ${change.to} on ${sessionId}, ${told} member(s) told by ${change.by}`,
    );
  }
  return told;
}

/**
 * The confirmation code, emailed and nothing else.
 *
 * Outside `deliverPersonal` on purpose, and it breaks two of its rules for good
 * reasons.
 *
 * It writes no copy into the member's account. Every other message here does,
 * because the account is where a member goes to check what they were told — but
 * a one-time code sitting in a list, readable by anybody already signed in to
 * that account, is a credential filed next to the door it opens. And the member
 * cannot reach that list anyway until the code has been typed.
 *
 * It ignores `notifyEmail`. That switch is consent to be *contacted*: reminders,
 * receipts, news. This is the address proving itself, asked for by the person
 * who typed it thirty seconds ago, and an account that cannot be confirmed
 * because its owner turned off emails is an account nobody can use.
 */
export async function sendVerificationCode(
  to: string,
  code: string,
  minutes: number,
) {
  return emailTransport().send(to, forEmail(verifyWords({ code, minutes })));
}

/**
 * One member, one message, whichever channels the table allows it.
 *
 * The member's own consent narrows that further and can never widen it: a
 * message the studio has not put email on stays off email even for somebody who
 * would happily receive it.
 */
async function deliverPersonal(
  f: BookingFacts,
  words: Bilingual,
  sends: { email: boolean; push: boolean; sms: boolean },
) {
  /* The account copy, always. Written first and outside any condition: it is
     the one the member can come back to, and it is what puts the number on
     their photograph. */
  inbox(f.userId, words);

  let reached = sends.push ? await pushToUser(f.userId, words.en) : 0;

  if (sends.email && f.notifyEmail && f.email) {
    const res = await emailTransport().send(f.email, forEmail(words));
    if (res.ok) reached++;
  }
  if (sends.sms && f.notifySms) {
    const number = toE164(f.phone);
    if (number) {
      const res = await smsTransport().send(number, {
        subject: words.en.subject,
        body: `APEX pilates: ${words.en.subject}. ${words.en.body}`.slice(0, 300),
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
  const queue = dueReminders(now);
  if (queue.length === 0) {
    return { due: 0, pushed: 0, emailed: 0, texted: 0, stale: 0 };
  }

  /**
   * A reminder for a class that has already begun is not a reminder.
   *
   * This matters the first time a sweep runs after not running for a while:
   * without it, a server coming back up would tell somebody their Tuesday class
   * starts "now" on Thursday, for every class they had booked in between. The
   * rows are closed rather than left pending, because they will never become
   * sendable — every minute that passes makes them more wrong.
   *
   * A reminder that is merely *late* still goes: "starts in 5 minutes" when
   * thirty was intended is worth having, and better than silence.
   */
  const stale = queue.filter((r) => r.startsAt.getTime() <= now.getTime());
  const due = queue.filter((r) => r.startsAt.getTime() > now.getTime());

  if (stale.length > 0) {
    markSent(stale.map((r) => r.id), now);
  }

  if (due.length === 0) {
    return { due: 0, pushed: 0, emailed: 0, texted: 0, stale: stale.length };
  }

  let pushed = 0;
  let emailed = 0;
  let texted = 0;

  for (const r of due) {
    const minutes = Math.max(
      0,
      Math.round((r.startsAt.getTime() - now.getTime()) / 60_000),
    );
    const words = reminderWords({ minutes, startsAt: r.startsAt });

    /* The row remembers which channels the member had on when they booked. The
       table above can narrow that but never widen it. */
    const rowChannels = r.channels.split(",");
    const use = (c: Channel) =>
      SENDS.reminder[c as "email" | "sms"] && rowChannels.includes(c);

    inbox(r.userId, words);
    if (SENDS.reminder.push) pushed += await pushToUser(r.userId, words.en);

    if (use("email") && r.userEmail) {
      const res = await emailTransport().send(r.userEmail, forEmail(words));
      if (res.ok) emailed++;
    }
    if (use("sms")) {
      const number = toE164(r.userPhone);
      if (number) {
        const res = await smsTransport().send(number, {
          subject: words.en.subject,
          body: `APEX pilates: ${words.en.body}`.slice(0, 300),
        });
        if (res.ok) texted++;
      }
    }
  }

  markSent(due.map((r) => r.id), now);
  return { due: due.length, pushed, emailed, texted, stale: stale.length };
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

/* Re-exported so the wording stays testable from where it always was. */
export { whenWords, leadWords };
