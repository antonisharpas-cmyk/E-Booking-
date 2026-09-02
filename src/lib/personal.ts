import { studioStartOfDay } from "./time";

/**
 * Personal and duet sessions, in one place.
 *
 * These are not classes with a smaller cap. They are appointments, and almost
 * every rule about them differs from the timetable above them:
 *
 *   - they sit in the midday gap, 12:00, 13:00 and 14:00, weekdays only, in the
 *     three hours the studio is otherwise shut between the morning and the
 *     evening rota;
 *   - one reformer and one instructor, so one booking and no waiting list;
 *   - booking closes at the end of the previous day, because somebody has to be
 *     asked to come in and teach it and nobody can be asked at eleven for noon;
 *   - they are paid for with a personal or duet session, which cannot buy a
 *     group class, and no group session can buy one of these;
 *   - a duet is one appointment for two people on one session, booked by one
 *     member who names the person coming with them.
 *
 * Everything above is expressed here or in `packs.ts`. Nothing about them is
 * inferred from the hour or the capacity anywhere else in the app, because an
 * inference like that is right until the studio moves the slot.
 */

/** The hours the studio keeps free for appointments, in studio wall-clock. */
export const PERSONAL_SLOT_HOURS = [12, 13, 14] as const;

/** Monday to Friday. Not the weekend: Saturday is the morning rota and Sunday is shut. */
export const PERSONAL_SLOT_DAYS = [1, 2, 3, 4, 5] as const;

/** A full hour, longer than a group class, because it is one person's hour. */
export const PERSONAL_DURATION_MINUTES = 50;

/**
 * Where the studio wants to be told about a new appointment.
 *
 * A person, not a queue: an appointment is a rota change, and somebody has to
 * read it and ring an instructor. Kept here rather than in `studio.ts` because
 * it is an operations address and not one the site publishes anywhere.
 */
export const STUDIO_OPS_EMAIL =
  process.env.STUDIO_OPS_EMAIL || "info@ergonsite.com";

/**
 * The moment booking closes: midnight at the end of the day before.
 *
 * Returned as the first instant of the class's own studio day, so the test is a
 * plain `now < this`. A noon appointment on Tuesday can be booked until Monday
 * at 23:59:59 in Larnaca and not a second later, whatever timezone the server
 * or the member is in.
 */
export function personalBookingClosesAt(startsAt: Date) {
  return studioStartOfDay(startsAt);
}

/** Is this appointment still open for booking? */
export function isPersonalBookable(startsAt: Date, now = new Date()) {
  return now.getTime() < personalBookingClosesAt(startsAt).getTime();
}

/**
 * Cancellation closes at the same moment booking does, and deliberately so.
 *
 * The twelve-hour rule for a group class exists because a place given up in
 * time can be taken by somebody else. Here there is nobody else: once the
 * studio has asked an instructor to come in at noon, that hour is worked and
 * paid whether the member arrives or not. Closing cancellation at the end of
 * the previous day is the same line as booking, which makes it one rule to
 * explain rather than two, and it is honest: after that point the studio has
 * already spent the money.
 */
export function isPersonalCancellable(startsAt: Date, now = new Date()) {
  return isPersonalBookable(startsAt, now);
}
