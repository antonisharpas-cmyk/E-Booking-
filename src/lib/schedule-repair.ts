import { sqlite } from "@/db";
import { STUDIO } from "./studio";
import { studioStartOfDay } from "./time";

/**
 * Bring the generated timetable in line with the studio's actual room.
 *
 * The number of reformers and the length of a class are studio facts, not
 * per-class ones, but they are copied onto every generated class row. So a
 * database seeded when the studio was described as 50 minutes and eight places
 * keeps serving those numbers to the timetable for as long as those rows exist,
 * however many times the constants are corrected in code.
 *
 * Rather than make people remember to re-seed, this repairs the data on the
 * first read after boot:
 *
 *   - every class from the start of today onwards is corrected, because that
 *     is the whole window the timetable shows. A class that finished two hours
 *     ago is still on today's page, and leaving it on the old rota was enough
 *     to make the entire class type read 50 minutes;
 *   - capacity is never dropped below the number of people already booked, so
 *     nobody is silently un-booked;
 *   - earlier days are left exactly as they were, because they are history.
 *
 * It is idempotent and costs one indexed UPDATE per process, so it is safe to
 * call from anywhere that reads the schedule.
 */

let done = false;

export function repairScheduleOnce() {
  if (done) return;
  done = true;
  repairSchedule();
}

/** Exposed for the seed and for tests; returns how many rows it touched. */
export function repairSchedule(now = new Date()) {
  const cutoff = Math.floor(studioStartOfDay(now).getTime() / 1000);
  const length = STUDIO.classLengthMinutes * 60;

  const info = sqlite
    .prepare(
      `update class_sessions
          set ends_at  = starts_at + ?,
              capacity = max(
                ?,
                (select count(*) from bookings b
                  where b.session_id = class_sessions.id
                    and b.status = 'CONFIRMED')
              )
        where starts_at >= ?
          and (capacity != ? or (ends_at - starts_at) != ?)`,
    )
    .run(length, STUDIO.capacity, cutoff, STUDIO.capacity, length);

  return info.changes;
}
