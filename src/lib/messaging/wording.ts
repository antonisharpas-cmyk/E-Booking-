import { STUDIO } from "@/lib/studio";
import type { Outgoing } from "./types";

/**
 * The words, in both languages.
 *
 * Everything a member reads is written here rather than at the point it is sent,
 * for two reasons. The first is that the studio is in Larnaca: a member is as
 * likely to read Greek as English, and we do not ask them which, so an email
 * carries both. The second is that the same sentence goes to three different
 * places — the account, an inbox, a phone — and they must not be allowed to
 * drift apart into three slightly different accounts of the same fact.
 *
 * Where each language goes:
 *
 *   in the app   both are stored; the site shows whichever the member is
 *                reading it in, because it already knows that
 *   email        both, English above Greek, separated by a rule — we have no
 *                idea which they prefer and guessing wrong is worse than
 *                showing two
 *   push         one language, the member's own — see `say` below. A phone
 *                notification is one line and there is no room for two.
 *   sms          the same, and for the same reason, only harder: Greek costs
 *                three times the segments, so length is checked after the
 *                language is chosen and not before.
 */

export type Bilingual = { en: Outgoing; el: Outgoing };

/**
 * One of the two, for the channels that can only carry one.
 *
 * Push and SMS have room for a single language, and for a long time that
 * language was English for everybody. A member who had used the switch at the
 * top of every page to read the site in Greek got a Greek copy of a message in
 * their account and an English copy of the same message on their phone, which
 * is worse than either alone: it looks like the studio does not know which
 * language it speaks to them in.
 *
 * The argument takes the raw column rather than a `Locale`, so every caller can
 * pass `user.locale` straight from a query without a cast or a check. Anything
 * that is not exactly "el" means English, which covers null, an old row, and a
 * value somebody typed by hand — the safe direction, because English is the
 * language the studio itself is administered in.
 */
export function say(m: Bilingual, locale?: string | null): Outgoing {
  return locale === "el" ? m.el : m.en;
}

/* ------------------------------------------------------------------ the dates */

/** "Saturday 29 August at 18:00" / "Σάββατο 29 Αυγούστου στις 18:00". */
export function whenWords(d: Date, lang: "en" | "el" = "en") {
  const locale = lang === "el" ? "el-GR" : "en-GB";
  const day = new Intl.DateTimeFormat(locale, {
    timeZone: STUDIO.timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(d);
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: STUDIO.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  return lang === "el" ? `${day} στις ${time}` : `${day} at ${time}`;
}

/** "25 November 2026" / "25 Νοεμβρίου 2026". */
export function dateWords(d: Date, lang: "en" | "el" = "en") {
  return new Intl.DateTimeFormat(lang === "el" ? "el-GR" : "en-GB", {
    timeZone: STUDIO.timezone,
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

/** Minutes, said the way a person would say them. */
export function leadWords(minutes: number, lang: "en" | "el" = "en") {
  const el = lang === "el";
  if (minutes <= 0) return el ? "τώρα" : "now";
  if (minutes < 60) return el ? `${minutes} λεπτά` : `${minutes} minutes`;
  const h = minutes / 60;
  if (Number.isInteger(h)) {
    if (el) return h === 1 ? "1 ώρα" : `${h} ώρες`;
    return h === 1 ? "1 hour" : `${h} hours`;
  }
  const whole = Math.floor(h);
  const rest = minutes % 60;
  return el ? `${whole}ω ${rest}λ` : `${whole}h ${rest}m`;
}

/** "1 session" / "10 sessions", and the Greek, which inflects the noun. */
export function sessionWords(n: number, lang: "en" | "el" = "en") {
  if (lang === "el") return n === 1 ? "1 συνεδρία" : `${n} συνεδρίες`;
  return n === 1 ? "1 session" : `${n} sessions`;
}

/** Money, with the decimals dropped when there are none to show. */
export function moneyWords(cents: number, currency: string, lang: "en" | "el" = "en") {
  return new Intl.NumberFormat(lang === "el" ? "el-GR" : "en-GB", {
    style: "currency",
    currency: currency || "EUR",
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
}

/* --------------------------------------------------------------- the messages */

export function bookedWords(a: {
  classEn: string;
  classEl: string;
  startsAt: Date;
}): Bilingual {
  return {
    en: {
      subject: "Booking confirmed",
      body: `${a.classEn}, ${whenWords(a.startsAt)}. See you at the studio.`,
      url: "/account?tab=notifications",
    },
    el: {
      subject: "Η κράτηση επιβεβαιώθηκε",
      body: `${a.classEl}, ${whenWords(a.startsAt, "el")}. Σας περιμένουμε στο στούντιο.`,
      url: "/account?tab=notifications",
    },
  };
}

export function cancelledWords(a: {
  classEn: string;
  classEl: string;
  startsAt: Date;
  refunded: boolean;
}): Bilingual {
  return {
    en: {
      subject: "Booking cancelled",
      body:
        `${a.classEn}, ${whenWords(a.startsAt)}, is cancelled. ` +
        (a.refunded
          ? "The session is back in your balance."
          : "This was inside the 12-hour window, so the session was used."),
      url: "/account?tab=notifications",
    },
    el: {
      subject: "Η κράτηση ακυρώθηκε",
      body:
        `${a.classEl}, ${whenWords(a.startsAt, "el")}, ακυρώθηκε. ` +
        (a.refunded
          ? "Η συνεδρία επέστρεψε στο υπόλοιπό σας."
          : "Η ακύρωση έγινε εντός 12 ωρών, γι' αυτό η συνεδρία χρησιμοποιήθηκε."),
      url: "/account?tab=notifications",
    },
  };
}

export function purchasedWords(a: {
  credits: number;
  amountCents: number;
  currency: string;
  expiresAt: Date | null;
}): Bilingual {
  const expiryEn = a.expiresAt
    ? ` They expire on ${dateWords(a.expiresAt)}.`
    : "";
  const expiryEl = a.expiresAt
    ? ` Λήγουν στις ${dateWords(a.expiresAt, "el")}.`
    : "";

  return {
    en: {
      subject: "Payment received",
      body:
        `${sessionWords(a.credits)} added to your balance for ` +
        `${moneyWords(a.amountCents, a.currency)}.${expiryEn}`,
      url: "/account?tab=payments",
    },
    el: {
      subject: "Η πληρωμή ελήφθη",
      body:
        `${sessionWords(a.credits, "el")} προστέθηκαν στο υπόλοιπό σας για ` +
        `${moneyWords(a.amountCents, a.currency, "el")}.${expiryEl}`,
      url: "/account?tab=payments",
    },
  };
}

export function reminderWords(a: {
  minutes: number;
  startsAt: Date;
}): Bilingual {
  return {
    en: {
      subject: "Your class is coming up",
      body: `Your class starts in ${leadWords(a.minutes)}, at ${whenWords(a.startsAt)}.`,
      url: "/account",
    },
    el: {
      subject: "Το μάθημά σας πλησιάζει",
      body: `Το μάθημά σας ξεκινά σε ${leadWords(a.minutes, "el")}, ${whenWords(a.startsAt, "el")}.`,
      url: "/account",
    },
  };
}

/**
 * "Here is a free session, and here is the week you can use it."
 *
 * The window is the whole message. A free session a member cannot work out how
 * to spend is worse than no free session, because they try, fail, and conclude
 * the site is broken. So the dates come first and the expiry date comes second,
 * and there is nothing after it: a welcome message that carries on into seat
 * counts and opening hours stops being read before it gets to the part that
 * matters.
 *
 * `expires` defaults to `to` because they are the same day in this campaign, but
 * they answer different questions (the last class it books, versus the last
 * moment it can be spent) and a future offer may separate them.
 */
export function promoWords(a: {
  credits: number;
  from: Date;
  to: Date;
  expires?: Date;
}): Bilingual {
  const dayEn = (d: Date) =>
    new Intl.DateTimeFormat("en-GB", {
      timeZone: STUDIO.timezone,
      day: "numeric",
      month: "long",
    }).format(d);
  const dayEl = (d: Date) =>
    new Intl.DateTimeFormat("el-GR", {
      timeZone: STUDIO.timezone,
      day: "numeric",
      month: "long",
    }).format(d);

  const expires = a.expires ?? a.to;
  const one = a.credits === 1;

  return {
    en: {
      subject:
        one ? "A free session, on us" : `${a.credits} free sessions, on us`,
      body:
        `Welcome to APEX pilates. ${sessionWords(a.credits)} ` +
        `${one ? "is" : "are"} already in your balance for our opening week.\n\n` +
        `You can use ${one ? "it" : "them"} for any class from ${dayEn(a.from)} to ` +
        `${dayEn(a.to)}. ${one ? "The session expires" : "The sessions expire"} on ` +
        `${dayEn(expires)}, so please book before then.`,
      url: "/timetable",
    },
    el: {
      subject: one ? "Μια συνεδρία δώρο" : `${a.credits} συνεδρίες δώρο`,
      body:
        `Καλώς ήρθατε στο APEX pilates. ${sessionWords(a.credits, "el")} ` +
        `βρίσκ${one ? "εται" : "ονται"} ήδη στο υπόλοιπό σας για την εβδομάδα ` +
        `των εγκαινίων.\n\n` +
        `Μπορείτε να ${one ? "τη" : "τις"} χρησιμοποιήσετε σε οποιοδήποτε μάθημα ` +
        `από τις ${dayEl(a.from)} έως τις ${dayEl(a.to)}. ` +
        `${one ? "Η συνεδρία λήγει" : "Οι συνεδρίες λήγουν"} στις ` +
        `${dayEl(expires)}, γι' αυτό κλείστε θέση πριν από τότε.`,
      url: "/timetable",
    },
  };
}

/**
 * The confirmation code, on its way to a mailbox.
 *
 * The code is in the subject line as well as the body, deliberately. It is the
 * one email in this system whose whole job is to be read off a lock screen
 * without opening anything: the member is sitting in front of the site with the
 * box waiting, and making them open a mail app, find the message and scroll is
 * three steps of friction on the last screen of signing up. Every large service
 * puts it in the subject for exactly this reason, and what it guards here is an
 * email address rather than money.
 *
 * The last paragraph matters as much as the code. Somebody may receive this
 * because a stranger mistyped an address, and they are owed a sentence telling
 * them that ignoring it is enough — an account nobody confirms is an account
 * nobody can use.
 */
/**
 * The same event, said without the code in it.
 *
 * For the in-app copy and the phone notification. The studio asked for the
 * registration message on every channel, and it is on every channel — but the
 * six digits stay in the email alone, deliberately.
 *
 * Two reasons. A notification sits on a lock screen and an in-app notice sits
 * in a list that anybody already holding the unlocked phone can read, so
 * putting the code in either files a credential next to the door it opens. And
 * the whole point of the code is to prove that the person controls that
 * mailbox: sending it anywhere else undoes the check it exists to perform.
 *
 * So the member gets told, on the channels they asked for, that a code is on
 * its way and where to look. The code itself arrives in the one place that
 * proves something.
 */
export function verifySentWords(a: { minutes: number }): Bilingual {
  return {
    en: {
      subject: "Confirm your email address",
      body:
        `Your confirmation code is on its way by email. Type it into the site ` +
        `to finish signing up.\n\nThe code expires in ${a.minutes} minutes, and ` +
        `you can ask for a new one at any time.`,
      url: "/verify",
    },
    el: {
      subject: "Επιβεβαίωσε το email σου",
      body:
        `Ο κωδικός επιβεβαίωσης είναι στον δρόμο του με email. ` +
        `Πληκτρολόγησέ τον στην ιστοσελίδα για να ολοκληρώσεις την εγγραφή.` +
        `\n\nΟ κωδικός λήγει σε ${a.minutes} λεπτά και μπορείς να ζητήσεις νέο ` +
        `όποτε θέλεις.`,
      url: "/verify",
    },
  };
}

export function verifyWords(a: { code: string; minutes: number }): Bilingual {
  return {
    en: {
      subject: `${a.code} is your APEX pilates code`,
      body:
        `Somebody has just created an APEX pilates account with this email ` +
        `address. We hope it was you.\n\n` +
        `Your confirmation code is ${a.code}\n\n` +
        `Type it into the site to finish signing up. The code expires in ` +
        `${a.minutes} minutes, and you can ask for a new one at any time.\n\n` +
        `If this was not you, ignore this email. The account cannot be used ` +
        `until the code is typed, so nothing else will happen.`,
      url: "/verify",
    },
    el: {
      subject: `${a.code} είναι ο κωδικός σας για το APEX pilates`,
      body:
        `Κάποιος μόλις δημιούργησε λογαριασμό στο APEX pilates με αυτή τη ` +
        `διεύθυνση email. Ελπίζουμε να είστε εσείς.\n\n` +
        `Ο κωδικός επιβεβαίωσης είναι ${a.code}\n\n` +
        `Πληκτρολογήστε τον στην ιστοσελίδα για να ολοκληρώσετε την εγγραφή. ` +
        `Ο κωδικός λήγει σε ${a.minutes} λεπτά και μπορείτε να ζητήσετε νέο ` +
        `όποτε θέλετε.\n\n` +
        `Αν δεν ήσασταν εσείς, αγνοήστε αυτό το email. Ο λογαριασμός δεν ` +
        `μπορεί να χρησιμοποιηθεί χωρίς τον κωδικό, οπότε δεν θα συμβεί τίποτε ` +
        `άλλο.`,
      url: "/verify",
    },
  };
}

/* ------------------------------------------- personal and duet appointments */

/**
 * The member's own confirmation for a midday appointment.
 *
 * Deliberately not the class confirmation with a different noun in it. Three
 * things are true here that are not true of a group class, and a member who has
 * just paid €30 or €45 should be told all three without having to go and look
 * them up:
 *
 *   who is coming        one person, or two, and the second person by name, so
 *                        a typo is caught now rather than at the door
 *   who is teaching      nobody yet. The studio rings round after this lands,
 *                        and promising a name we have not asked for would be a
 *                        promise the site is not in a position to make
 *   when it locks        end of the day before, which is the same line as
 *                        booking and is worth saying once plainly, because it
 *                        is stricter than the twelve hours they are used to
 *
 * Written to be read by somebody standing up. Short lines, no headings, and the
 * one sentence that could cost them money is the last one, where it is read.
 */
export function personalBookedWords(a: {
  startsAt: Date;
  guestName: string | null;
}): Bilingual {
  const two = Boolean(a.guestName);

  return {
    en: {
      subject: two ? "Your Duet is booked" : "Your session is booked",
      body:
        (two
          ? `You and ${a.guestName} have the studio on ${whenWords(a.startsAt)}.`
          : `The studio is yours on ${whenWords(a.startsAt)}.`) +
        `\n\nAn instructor will be there for the hour.\n\n` +
        `If something changes you can cancel free until the end of the day ` +
        `before. After that an instructor has already been put on the rota for ` +
        `you, so the session counts as used.`,
      url: "/account",
    },
    el: {
      subject: two ? "Η Duet συνεδρία σας κλείστηκε" : "Η συνεδρία σας κλείστηκε",
      body:
        (two
          ? `Εσείς και ${a.guestName} έχετε το στούντιο ${whenWords(a.startsAt, "el")}.`
          : `Το στούντιο είναι δικό σας ${whenWords(a.startsAt, "el")}.`) +
        `\n\nΘα υπάρχει εκπαιδευτής εκεί για όλη την ώρα.\n\n` +
        `Αν κάτι αλλάξει, μπορείτε να ακυρώσετε χωρίς χρέωση μέχρι το τέλος ` +
        `της προηγούμενης μέρας. Μετά από αυτό ο εκπαιδευτής έχει ήδη μπει στο ` +
        `πρόγραμμα για εσάς, οπότε η συνεδρία μετράει ως χρησιμοποιημένη.`,
      url: "/account",
    },
  };
}

/**
 * The message that actually gets somebody to work: the studio's own copy.
 *
 * This one is not a courtesy. An appointment is an hour nobody was rostered for,
 * and between the booking landing and the member arriving somebody has to read
 * this and ring an instructor. So it is written as a note to a colleague rather
 * than as a notification: the hour first, the names and the number next, and one
 * line saying what needs doing.
 *
 * The member's phone number is in it on purpose. The person calling round the
 * instructors is often the same person who then has to call the member back
 * about the time, and making them open the admin panel to find a number they
 * were just emailed about is the kind of small friction that ends with the call
 * not being made.
 */
export function studioAppointmentWords(a: {
  startsAt: Date;
  memberName: string;
  memberEmail: string;
  memberPhone: string | null;
  guestName: string | null;
  /** True when the booking has just been cancelled rather than made. */
  cancelled?: boolean;
}): Bilingual {
  const two = Boolean(a.guestName);
  const who = two ? `${a.memberName} and ${a.guestName}` : a.memberName;
  const whoEl = two ? `${a.memberName} και ${a.guestName}` : a.memberName;
  const kindEn = two ? "Duet, two people" : "Personal, one person";
  const kindEl = two ? "Duet, δύο άτομα" : "Ατομική, ένα άτομο";
  const contact = [a.memberEmail, a.memberPhone].filter(Boolean).join(", ");

  if (a.cancelled) {
    return {
      en: {
        subject: `Cancelled: ${whenWords(a.startsAt)}`,
        body:
          `${who} has cancelled the ${whenWords(a.startsAt)} session.\n\n` +
          `${kindEn}. ${contact}\n\n` +
          `The hour is free again. If an instructor was already asked to come ` +
          `in for it, they need to be told.`,
      },
      el: {
        subject: `Ακύρωση: ${whenWords(a.startsAt, "el")}`,
        body:
          `${whoEl} ακύρωσε τη συνεδρία ${whenWords(a.startsAt, "el")}.\n\n` +
          `${kindEl}. ${contact}\n\n` +
          `Η ώρα είναι ξανά ελεύθερη. Αν έχει ήδη ζητηθεί από εκπαιδευτή να ` +
          `έρθει, πρέπει να ενημερωθεί.`,
      },
    };
  }

  return {
    en: {
      subject: `New session: ${whenWords(a.startsAt)}`,
      body:
        `${who} has booked the studio for ${whenWords(a.startsAt)}.\n\n` +
        `${kindEn}. ${contact}\n\n` +
        `An instructor needs to be there for that hour. It falls in the midday ` +
        `gap, so nobody is on the rota for it yet.`,
    },
    el: {
      subject: `Νέα συνεδρία: ${whenWords(a.startsAt, "el")}`,
      body:
        `${whoEl} έκλεισε το στούντιο για ${whenWords(a.startsAt, "el")}.\n\n` +
        `${kindEl}. ${contact}\n\n` +
        `Χρειάζεται εκπαιδευτής για αυτή την ώρα. Πέφτει στο μεσημεριανό κενό, ` +
        `οπότε δεν είναι ακόμη κανείς στο πρόγραμμα.`,
    },
  };
}

/**
 * The member's confirmation that a cancelled appointment is cancelled.
 *
 * Says whether the session came back, like the class version, and nothing else.
 * Somebody cancelling is not in the mood to read about how the hour is built.
 */
export function personalCancelledWords(a: {
  startsAt: Date;
  refunded: boolean;
}): Bilingual {
  return {
    en: {
      subject: "Session cancelled",
      body:
        `Your session on ${whenWords(a.startsAt)} is cancelled. ` +
        (a.refunded
          ? "The session is back in your balance."
          : "This was past the end of the day before, so the session was used."),
      url: "/account?tab=notifications",
    },
    el: {
      subject: "Η συνεδρία ακυρώθηκε",
      body:
        `Η συνεδρία σας ${whenWords(a.startsAt, "el")} ακυρώθηκε. ` +
        (a.refunded
          ? "Η συνεδρία επέστρεψε στο υπόλοιπό σας."
          : "Η ακύρωση έγινε μετά το τέλος της προηγούμενης μέρας, γι' αυτό η συνεδρία χρησιμοποιήθηκε."),
      url: "/account?tab=notifications",
    },
  };
}

/**
 * "Somebody else is taking your class."
 *
 * Short, and it does not apologise. An instructor changing is ordinary: people
 * are ill, people swap shifts, and a studio that treats it as an incident
 * teaches its members to treat it as one too. What the member needs is the fact
 * and the reassurance that nothing else has moved, which is the second sentence.
 *
 * The outgoing name is included as well as the incoming one, because that is the
 * whole content of the message: a member who booked with Elena specifically is
 * the only person this notice is really for, and telling them "your instructor is
 * Andreas" without saying who it was leaves them to work out whether anything
 * changed at all.
 */
export function instructorChangedWords(a: {
  classEn: string;
  classEl: string;
  startsAt: Date;
  from: string;
  to: string;
}): Bilingual {
  return {
    en: {
      subject: "A change of instructor",
      body:
        `${a.to} is taking your ${a.classEn} on ${whenWords(a.startsAt)}, ` +
        `instead of ${a.from}.\n\n` +
        `Nothing else has changed. Same time, same room, and your booking is ` +
        `exactly as it was.`,
      url: "/account",
    },
    el: {
      subject: "Αλλαγή εκπαιδευτή",
      body:
        `Το μάθημά σας ${a.classEl} ${whenWords(a.startsAt, "el")} θα το κάνει ` +
        `${a.to} αντί για ${a.from}.\n\n` +
        `Δεν αλλάζει κάτι άλλο. Ίδια ώρα, ίδια αίθουσα, και η κράτησή σας ` +
        `μένει όπως ήταν.`,
      url: "/account",
    },
  };
}

/* ------------------------------------------------------------- for the inbox */

/**
 * The sign-off, which belongs to email and to nothing else.
 *
 * A push notification is one line on a lock screen and "Best regards" in it
 * would be absurd; the in-app copy is a card in a list the member is already
 * looking at, with the studio's name above it. Only a letter needs signing.
 */
export const SIGN_OFF = {
  en: "Best regards,\nAPEX pilates Team",
  el: "Με εκτίμηση,\nΗ ομάδα του APEX pilates",
};

/** The rule between the two languages. Rendered as a line, not as characters. */
export const LANGUAGE_RULE = "———";

/**
 * Does this text already end with somebody's sign-off?
 *
 * Because the desk types one. A notice written by hand quite reasonably finishes
 * "Best regards, Apex Pilates Team", and adding ours underneath produced an
 * email signed twice by almost the same name — which reads like a mail merge
 * went wrong. Checked against the last few lines only, so a message that merely
 * mentions the phrase in passing still gets signed.
 */
function alreadySigned(body: string) {
  /* The last few lines that have anything on them. A sign-off is at the end by
     definition, so the middle of a message is none of our business. */
  const lines = body
    .trimEnd()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-3);

  const OPENERS = [
    "best regards",
    "kind regards",
    "warm regards",
    "regards",
    "sincerely",
    "thank you",
    "thanks",
    "με εκτίμηση",
    "φιλικά",
    "ευχαριστούμε",
  ];

  return lines.some((line) => {
    const lower = line.toLowerCase();
    /* It has to *begin* a line, and the line has to be short. That second
       condition is the one that matters: "Best regards are what we send in
       every email we write" begins with the phrase and is plainly a sentence,
       not a signature. A real sign-off is two or three words and a comma. */
    return (
      line.length <= 40 && OPENERS.some((phrase) => lower.startsWith(phrase))
    );
  });
}

function sign(body: string, off: string) {
  return alreadySigned(body) ? body : `${body}\n\n${off}`;
}

/**
 * One email carrying both languages.
 *
 * English first because the interface defaults to it, then a rule, then the
 * Greek. Each half is signed — unless the writer signed it themselves.
 *
 * The **subject stays in one language**, deliberately. Joining both with a
 * separator was the first attempt and it was wrong: an inbox shows perhaps fifty
 * characters of a subject line, so "Hello Testing - Important · Γεια σας Τεστ -
 * SHMANTIKO" is a line of noise in the list and a mess in the notification on a
 * phone. A subject's job is to be recognised at a glance, and two languages
 * competing for the same forty characters means neither is. Both languages are
 * in the body, where there is room for them.
 */
export function forEmail(m: Bilingual | Outgoing, el?: Outgoing): Outgoing {
  const en = "en" in m && "el" in m ? (m as Bilingual).en : (m as Outgoing);
  const greek = "en" in m && "el" in m ? (m as Bilingual).el : el;

  if (!greek || (greek.subject === en.subject && greek.body === en.body)) {
    return { ...en, body: sign(en.body, SIGN_OFF.en) };
  }

  return {
    subject: en.subject,
    body: [
      sign(en.body, SIGN_OFF.en),
      LANGUAGE_RULE,
      sign(greek.body, SIGN_OFF.el),
    ].join("\n\n"),
    url: en.url,
  };
}
