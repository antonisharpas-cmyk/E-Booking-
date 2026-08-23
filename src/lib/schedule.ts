import { and, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import { classSessions, classTemplates } from "@/db/schema";
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
 * Times are studio wall-clock times, so a 06:00 template produces a class at
 * 06:00 in Nicosia no matter what timezone the server runs in.
 *
 * Idempotent: (templateId, startsAt) is unique, so running it twice never
 * creates duplicates. Call it from the admin panel, or from a cron job.
 */
export function generateSessions(weeksAhead = 6, from = new Date()) {
  const templates = db
    .select()
    .from(classTemplates)
    .where(eq(classTemplates.active, true))
    .all();

  const start = studioStartOfDay(from);
  const days = weeksAhead * 7;
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

        const res = db
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
          .run();
        if (res.changes > 0) created++;
        else skipped++;
      }
    }
  });

  return { created, skipped, templates: templates.length };
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
