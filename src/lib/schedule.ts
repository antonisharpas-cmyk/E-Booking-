import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { bookings, classSessions, classTemplates } from "@/db/schema";
import {
  studioAddDays,
  studioDayOfWeek,
  studioParts,
  studioStartOfDay,
  studioWallTimeToInstant,
} from "./time";

/**
 * Turn the weekly templates into real bookable sessions.
 *
 * The weekly rota — "Reformer Flow, Mondays at 06:00" — is a template. A member
 * cannot book a template; they book a class on a date. This walks forward the
 * number of weeks asked for and writes a real class for every day a template
 * falls on, which is what puts it on the timetable.
 *
 * Times are studio wall-clock times, so a 06:00 template produces a class at
 * 06:00 in Nicosia no matter what timezone the server runs in.
 *
 * **Idempotent, which is the important property.** (templateId, startsAt) is
 * unique, so running it twice never doubles a class up: the second run reports
 * everything as skipped and changes nothing. Pressing the button by accident is
 * therefore not a mistake that needs undoing — but the ids of what it did create
 * are returned anyway, so that a run which went further ahead than intended can
 * be taken back. See `removeGeneratedSessions`.
 */
export function generateSessions(weeksAhead = 6, from = new Date()) {
  const templates = db
    .select()
    .from(classTemplates)
    .where(eq(classTemplates.active, true))
    .all();

  const start = studioStartOfDay(from);
  const days = weeksAhead * 7;
  const createdIds: string[] = [];
  let created = 0;
  let skipped = 0;

  db.transaction(() => {
    for (let i = 0; i < days; i++) {
      const dayInstant = studioAddDays(start, i);
      const dow = studioDayOfWeek(dayInstant);
      const p = studioParts(dayInstant);

      for (const tpl of templates) {
        if (tpl.dayOfWeek !== dow) continue;

        const startsAt = studioWallTimeToInstant(
          p.year,
          p.month,
          p.day,
          Math.floor(tpl.startMinutes / 60),
          tpl.startMinutes % 60,
        );

        if (startsAt.getTime() < from.getTime()) {
          skipped++;
          continue;
        }
        const endsAt = new Date(startsAt.getTime() + tpl.durationMin * 60_000);

        const row = db
          .insert(classSessions)
          .values({
            classTypeId: tpl.classTypeId,
            instructorId: tpl.instructorId,
            templateId: tpl.id,
            startsAt,
            endsAt,
            capacity: tpl.capacity,
          })
          .onConflictDoNothing()
          .returning({ id: classSessions.id })
          .get();
        if (row) {
          created++;
          createdIds.push(row.id);
        } else skipped++;
      }
    }
  });

  return { created, skipped, templates: templates.length, createdIds };
}

/**
 * Undo one roll-forward.
 *
 * Only the classes that run passed back, and only the ones nobody has booked:
 * a class with a member on it is not an accident to be tidied away, it is a
 * commitment. Those are reported as kept rather than silently ignored, so the
 * desk is told why the numbers do not match.
 *
 * There is no time limit on this and no need for one — the ids are the whole
 * scope, and a class that has since been booked protects itself.
 */
export function removeGeneratedSessions(ids: string[]) {
  if (ids.length === 0) return { removed: 0, kept: 0 };

  let removed = 0;
  let kept = 0;

  db.transaction(() => {
    for (const id of ids) {
      const taken = db
        .select({ id: bookings.id })
        .from(bookings)
        .where(and(eq(bookings.sessionId, id), eq(bookings.status, "CONFIRMED")))
        .all().length;

      if (taken > 0) {
        kept++;
        continue;
      }
      removed += db.delete(classSessions).where(eq(classSessions.id, id)).run()
        .changes;
    }
  });

  return { removed, kept };
}

export async function countUpcomingSessions(from = new Date()) {
  const rows = await db
    .select({ id: classSessions.id })
    .from(classSessions)
    .where(
      and(gte(classSessions.startsAt, from), eq(classSessions.status, "SCHEDULED")),
    );
  return rows.length;
}

/** Studio opening hours, used by the marketing pages. */
export const STUDIO_HOURS = [
  { key: "weekday", days: [1, 2, 3, 4, 5], blocks: ["06:00 – 12:00", "15:00 – 20:00"] },
  { key: "saturday", days: [6], blocks: ["07:00 – 11:00"] },
  { key: "sunday", days: [0], blocks: [] },
] as const;
