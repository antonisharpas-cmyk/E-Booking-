import type { Metadata } from "next";
import {
  ScheduleClient,
  type ScheduleClassType,
  type ScheduleSession,
} from "@/components/booking/ScheduleClient";
import { TimetableIntro } from "@/components/booking/TimetableIntro";
import { readSession } from "@/lib/auth";
import { closedDaySet } from "@/lib/closures";
import { listSessions } from "@/lib/booking";
import { getAvailableCredits } from "@/lib/credits";
import {
  studioAddDays,
  studioDateKey,
  studioDayKeys,
  studioStartOfDay,
} from "@/lib/time";
import { STUDIO } from "@/lib/studio";
import { isBookable } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Timetable",
  description:
    "Live Reformer Pilates timetable at APEX pilates. Book with sessions, free cancellation up to 12 hours before class.",
};

export const dynamic = "force-dynamic";

const DAYS_SHOWN = 28;

export default async function TimetablePage() {
  const session = await readSession();
  const from = studioStartOfDay(new Date());
  const to = studioAddDays(from, DAYS_SHOWN);

  const [rows, credits] = await Promise.all([
    listSessions({ from, to, userId: session?.sub ?? null }),
    session ? getAvailableCredits(session.sub) : Promise.resolve(0),
  ]);

  const now = new Date();
  const sessions: ScheduleSession[] = rows
    .filter((s) => s.status === "SCHEDULED")
    .map((s) => ({
      id: s.id,
      day: studioDateKey(s.startsAt),
      startsAt: s.startsAt.toISOString(),
      capacity: s.capacity,
      booked: s.booked,
      spotsLeft: s.spotsLeft,
      status: s.status,
      bookable: isBookable(s.startsAt, now),
      type: s.classType.slug,
      instructor: s.instructor?.name ?? null,
      myBookingId: s.myBookingId ?? null,
    }));

  /* Sent once, keyed by slug, instead of repeated on all ~230 classes. */
  const types: Record<string, ScheduleClassType> = {};
  for (const s of rows) {
    types[s.classType.slug] ??= {
      slug: s.classType.slug,
      nameEn: s.classType.nameEn,
      nameEl: s.classType.nameEl,
      level: s.classType.level,
      intensity: s.classType.intensity,
      /* Class length is a studio fact, not something to infer from a row. It
         used to be measured off the first session of each type, and because
         the window starts at midnight that first session is often one that has
         already finished today — so a single class left over from an older
         rota made every class of that type read 50 minutes. */
      durationMin: STUDIO.classLengthMinutes,
    };
  }

  /* Keep Sundays and any manually closed days visible so the timetable makes the
     studio's closure status explicit instead of silently dropping the date. */
  const closed = closedDaySet();
  const days = studioDayKeys(from, DAYS_SHOWN);

  return (
    <TimetableIntro>
      <ScheduleClient
        sessions={sessions}
        types={types}
        signedIn={Boolean(session)}
        credits={credits}
        days={days}
        closedDays={closed}
      />
    </TimetableIntro>
  );
}
