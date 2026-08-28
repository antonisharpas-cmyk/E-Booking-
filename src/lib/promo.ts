import { studioWallTimeToInstant } from "./time";

/**
 * The opening-week offer, in one place.
 *
 * One free session for every account created between `grantFrom` and
 * `grantUntil`, spendable only on classes inside `spendFrom`…`spendUntil`.
 *
 * Everything about the campaign lives here on purpose. The alternative — a
 * `2026-09-20` written into the registration route, another into the booking
 * rules, a third into the copy — is four places to remember and three of them
 * will be missed the next time the studio runs an offer. Which it will: there is
 * always a Christmas.
 *
 * ---
 *
 * **Two different dates, and they are not the same thing.**
 *
 *   expiresAt     the last moment the session can be *spent*
 *   spendUntil    the last class it can be spent *on*
 *
 * The credit system already understood the first and not the second, and without
 * the second the offer does not work: a member granted a free session on the 5th
 * could spend it on the 6th to book a class in November. The free session would
 * leak straight into the paid schedule and the opening-week constraint would mean
 * nothing. See `spendOneCredit`, which now takes the class date for exactly this.
 *
 * ---
 *
 * **If the week fills up, widen it here.**
 *
 * The rota puts 59 classes and 295 seats in the week of the 14th, and Sunday the
 * 20th has none — the studio is closed Sundays, so the real last chance is
 * Saturday the 19th. One free session each therefore fits about 295 members if
 * every single one redeems, which is comfortable but not enormous. If the week
 * runs out, moving `spendUntil` and `expiresAt` a week later is a one-line change
 * and no member loses anything by it. That escape hatch is the reason the dates
 * are constants rather than a hard-coded string.
 */

/** Studio wall-clock, so a date here means that date in Larnaca. */
const at = (y: number, m: number, d: number, h = 0, min = 0) =>
  studioWallTimeToInstant(y, m, d, h, min);

export const PROMO = {
  /**
   * Turn the whole thing off without deleting anything.
   *
   * `PROMO_ENABLED=false` in the environment switches it off — which the studio
   * may want on a day's notice if the week fills up, and which the test suites
   * need because they assert what a new account starts with. A registration that
   * hands out a free session is correct behaviour and it is *not* the behaviour
   * the rest of the app is tested against.
   */
  enabled: process.env.PROMO_ENABLED !== "false",

  /** A short name, for the ledger and the desk. */
  name: "Opening week",

  /** How many free sessions a qualifying new account gets. */
  credits: 1,

  /**
   * Accounts created inside this window qualify. Accounts older than
   * `grantFrom` do not — the studio's decision, and the reason is that the
   * accounts predating the offer are development and staff ones.
   */
  grantFrom: at(2026, 8, 28),
  grantUntil: at(2026, 9, 20),

  /**
   * The classes it may be spent on. Monday the 14th to the end of Saturday the
   * 19th: Sunday the 20th has no classes at all, so ending on the 19th is
   * honest rather than restrictive.
   */
  spendFrom: at(2026, 9, 14, 0, 0),
  spendUntil: at(2026, 9, 19, 23, 59),

  /**
   * And the last moment it can be spent at all. The same evening as the last
   * class, because a session that cannot be spent on anything is not worth
   * leaving in somebody's balance to confuse them.
   */
  expiresAt: at(2026, 9, 19, 23, 59),
} as const;

/** The offer, if a new account right now would qualify for it. */
export function activePromo(now = new Date()) {
  if (!PROMO.enabled) return null;
  if (now < PROMO.grantFrom || now >= PROMO.grantUntil) return null;
  return PROMO;
}

/** Whether a batch with this window may be spent on a class at this time. */
export function windowAllows(
  batch: { usableFrom: Date | null; usableTo: Date | null },
  classStartsAt: Date,
) {
  if (batch.usableFrom && classStartsAt < batch.usableFrom) return false;
  if (batch.usableTo && classStartsAt > batch.usableTo) return false;
  return true;
}
