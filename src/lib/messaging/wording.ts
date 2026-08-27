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
 *   push         English only. A phone notification is one line and there is no
 *                room for a second language in it.
 */

export type Bilingual = { en: Outgoing; el: Outgoing };

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
      body: `${a.classEn} — ${whenWords(a.startsAt)}. See you at the studio.`,
      url: "/account?tab=notifications",
    },
    el: {
      subject: "Η κράτηση επιβεβαιώθηκε",
      body: `${a.classEl} — ${whenWords(a.startsAt, "el")}. Σας περιμένουμε στο στούντιο.`,
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
        `${a.classEn} — ${whenWords(a.startsAt)} is cancelled. ` +
        (a.refunded
          ? "The session is back in your balance."
          : "This was inside the 24-hour window, so the session was used."),
      url: "/account?tab=notifications",
    },
    el: {
      subject: "Η κράτηση ακυρώθηκε",
      body:
        `${a.classEl} — ${whenWords(a.startsAt, "el")} ακυρώθηκε. ` +
        (a.refunded
          ? "Η συνεδρία επέστρεψε στο υπόλοιπό σας."
          : "Η ακύρωση έγινε εντός 24 ωρών, γι' αυτό η συνεδρία χρησιμοποιήθηκε."),
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
        `${sessionWords(a.credits)} added to your balance — ` +
        `${moneyWords(a.amountCents, a.currency)}.${expiryEn}`,
      url: "/account?tab=payments",
    },
    el: {
      subject: "Η πληρωμή ελήφθη",
      body:
        `${sessionWords(a.credits, "el")} προστέθηκαν στο υπόλοιπό σας — ` +
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
      body: `Your class starts in ${leadWords(a.minutes)} — ${whenWords(a.startsAt)}.`,
      url: "/account",
    },
    el: {
      subject: "Το μάθημά σας πλησιάζει",
      body: `Το μάθημά σας ξεκινά σε ${leadWords(a.minutes, "el")} — ${whenWords(a.startsAt, "el")}.`,
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
