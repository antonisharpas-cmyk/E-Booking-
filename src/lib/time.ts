import { STUDIO } from "./studio";

/**
 * Timezone helpers.
 *
 * Class times are wall-clock times in the studio's timezone: a 06:00 class is
 * 06:00 in Nicosia whether the server runs in Cyprus, on Vercel (UTC) or on a
 * laptop in another country. These helpers convert between studio wall time and
 * real instants without pulling in a date library.
 */

const TZ = STUDIO.timezone;

type Parts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const partsFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hour12: false,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** The calendar date and clock time in the studio's timezone for an instant. */
export function studioParts(instant: Date): Parts {
  const map: Record<string, string> = {};
  for (const p of partsFormatter.formatToParts(instant)) {
    if (p.type !== "literal") map[p.type] = p.value;
  }
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    // Intl can render midnight as "24" in some ICU versions
    hour: Number(map.hour) % 24,
    minute: Number(map.minute),
    second: Number(map.second),
  };
}

/** Offset of the studio timezone from UTC, in milliseconds, at that instant. */
function studioOffsetMs(instant: Date) {
  const p = studioParts(instant);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - instant.getTime() + (instant.getMilliseconds() ? 0 : 0);
}

/**
 * The real instant of a wall-clock time in the studio's timezone.
 * Two passes settle daylight-saving boundaries.
 */
export function studioWallTimeToInstant(
  year: number,
  month1to12: number,
  day: number,
  hour: number,
  minute = 0,
) {
  const naive = Date.UTC(year, month1to12 - 1, day, hour, minute, 0, 0);
  let instant = naive;
  for (let i = 0; i < 2; i++) {
    instant = naive - studioOffsetMs(new Date(instant));
  }
  return new Date(instant);
}

/** YYYY-MM-DD for an instant, as the studio's calendar sees it. */
export function studioDateKey(instant: Date) {
  const p = studioParts(instant);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

/** Midnight in the studio's timezone for the calendar day containing `instant`. */
export function studioStartOfDay(instant: Date) {
  const p = studioParts(instant);
  return studioWallTimeToInstant(p.year, p.month, p.day, 0, 0);
}

/** Adds whole calendar days in the studio's timezone (DST-safe). */
export function studioAddDays(instant: Date, days: number) {
  const p = studioParts(instant);
  return studioWallTimeToInstant(p.year, p.month, p.day + days, p.hour, p.minute);
}

/** Day of week (0 = Sunday) in the studio's timezone. */
export function studioDayOfWeek(instant: Date) {
  const p = studioParts(instant);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
}

/** The list of calendar day keys starting at `from`, in the studio's timezone. */
export function studioDayKeys(from: Date, count: number) {
  const keys: string[] = [];
  const start = studioStartOfDay(from);
  for (let i = 0; i < count; i++) {
    keys.push(studioDateKey(studioAddDays(start, i)));
  }
  return keys;
}
