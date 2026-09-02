/**
 * The weekly rota, in one place: which hours the studio runs classes in.
 *
 * This used to live in `src/db/seed.ts`, which meant it only existed at the
 * moment a database was created. Two consequences, and the studio hit both:
 *
 *   - a rota change reached a live database only by re-seeding it, which nobody
 *     is going to do to a database holding real bookings;
 *   - the published opening hours were written out by hand in three components
 *     and a constant. When Saturday gained an 11:00 class, the timetable said
 *     one thing and the footer said another, and the footer was the one members
 *     read before driving over.
 *
 * So the hours are the source and everything else is derived: the seed builds
 * templates from them, `timetable-repair` adds any that a live database is
 * missing, and the opening hours shown on the site are *computed* from them
 * rather than typed alongside them. A class cannot appear on the timetable
 * without appearing in the published hours, because they are the same fact.
 */

/**
 * Weekdays: a morning block and an evening block, with the middle of the day
 * kept for Personal and Duet appointments. See lib/personal.ts.
 */
export const WEEKDAY_CLASS_HOURS = [6, 7, 8, 9, 10, 11, 15, 16, 17, 18, 19] as const;

/**
 * Saturday: one morning block to a midday close.
 *
 * The last class starts at 11:00. The studio closes at 12:00, which is what the
 * 11:00 class finishing at 11:50 is for — it had been advertised as closing at
 * 11:00, which lost the studio the busiest hour of a Saturday morning and read
 * to a member as "do not come late".
 */
export const SATURDAY_CLASS_HOURS = [7, 8, 9, 10, 11] as const;

/** Sunday: closed. Present so the week is stated in full rather than implied. */
export const SUNDAY_CLASS_HOURS = [] as const;

/** Which hours run on a given day of the week, Sunday being 0. */
export function classHoursOn(dayOfWeek: number): readonly number[] {
  if (dayOfWeek >= 1 && dayOfWeek <= 5) return WEEKDAY_CLASS_HOURS;
  if (dayOfWeek === 6) return SATURDAY_CLASS_HOURS;
  return SUNDAY_CLASS_HOURS;
}

/**
 * The opening hours as a member reads them, worked out from the rota.
 *
 * A run of consecutive starting hours becomes one block, and the block ends an
 * hour after the last class starts rather than when it starts: a 19:00 class
 * means the studio is open until 20:00, and saying "until 19:00" would be both
 * wrong and discouraging. The class itself is fifty minutes; the slot is an
 * hour, and the ten minutes are the changeover.
 *
 *   [6,7,8,9,10,11,15,16,17,18,19]  ->  ["06:00 – 12:00", "15:00 – 20:00"]
 *   [7,8,9,10,11]                   ->  ["07:00 – 12:00"]
 */
export function openingBlocks(hours: readonly number[]): string[] {
  const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const out: string[] = [];
  let start: number | null = null;
  let previous: number | null = null;

  for (const h of [...hours].sort((a, b) => a - b)) {
    if (start === null) {
      start = h;
    } else if (previous !== null && h !== previous + 1) {
      out.push(`${hh(start)} – ${hh(previous + 1)}`);
      start = h;
    }
    previous = h;
  }
  if (start !== null && previous !== null) {
    out.push(`${hh(start)} – ${hh(previous + 1)}`);
  }
  return out;
}
