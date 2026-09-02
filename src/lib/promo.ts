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
 * the second the offer does not work: a member granted a free session on the 1st
 * could spend it on the 2nd to book a class in November. The free session would
 * leak straight into the paid schedule and the opening-week constraint would mean
 * nothing. See `spendOneCredit`, which now takes the class date for exactly this.
 *
 * ---
 *
 * **If the week fills up, widen it here.**
 *
 * The rota puts a full week of classes and roughly 300 seats in the week of the
 * 7th, and Sunday the 13th has none — the studio is closed Sundays, so the real
 * last class is Saturday the 12th. One free session each therefore fits about 295 members if
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
  /**
   * And it stops when the offer does.
   *
   * This has to move whenever `spendUntil` moves, and it is the easy one to
   * forget: leave it a week later than the spendable window and somebody who
   * registers after the last class is handed a free session that cannot buy
   * anything, ever. They would see it in their balance, try to use it, and be
   * refused by a rule they were never told about. Better to make no promise than
   * an empty one.
   */
  grantUntil: at(2026, 9, 13, 0, 0),

  /**
   * The classes it may be spent on. Monday the 7th to the end of Saturday the
   * 12th: Sunday the 13th has no classes at all, so ending on the 12th is
   * honest rather than restrictive.
   */
  spendFrom: at(2026, 9, 7, 0, 0),
  spendUntil: at(2026, 9, 12, 23, 59),

  /**
   * And the last moment it can be spent at all.
   *
   * The end of Sunday the 13th, a day *after* the last class it can buy. The two
   * were the same evening before, which was tidy and slightly unkind: a member
   * looking at their balance on Saturday night saw a session and a date that had
   * both just gone. Giving the spend deadline one more day costs the studio
   * nothing — there are no classes on Sunday for it to buy — and means the offer
   * ends on a date the member can read rather than in the middle of the evening
   * they were told about.
   */
  expiresAt: at(2026, 9, 13, 23, 59),
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
