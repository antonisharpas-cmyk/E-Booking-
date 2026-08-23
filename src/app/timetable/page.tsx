import type { Metadata } from "next";
import { ScheduleClient, type ScheduleSession } from "@/components/booking/ScheduleClient";
import { TimetableIntro } from "@/components/booking/TimetableIntro";
import { readSession } from "@/lib/auth";
import { listSessions } from "@/lib/booking";
import { getAvailableCredits } from "@/lib/credits";
import {
  studioAddDays,
  studioDateKey,
  studioDayKeys,
  studioStartOfDay,
} from "@/lib/time";
import { isBookable } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Timetable",
  description:
    "Live Reformer Pilates timetable at APEX pilates. Book with credits, free cancellation up to 12 hours before class.",
};

export const dynamic = "force-dynamic";

const DAYS_SHOWN = 14;

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
      endsAt: s.endsAt.toISOString(),
      capacity: s.capacity,
      booked: s.booked,
      spotsLeft: s.spotsLeft,
      status: s.status,
      bookable: isBookable(s.startsAt, now),
      classType: {
        slug: s.classType.slug,
        nameEn: s.classType.nameEn,
        nameEl: s.classType.nameEl,
        level: s.classType.level,
        intensity: s.classType.intensity,
      },
      instructor: s.instructor?.name ?? null,
      myBookingId: s.myBookingId ?? null,
    }));

  const days = studioDayKeys(from, DAYS_SHOWN);

  return (
    <TimetableIntro>
      <ScheduleClient
        sessions={sessions}
        signedIn={Boolean(session)}
        credits={credits}
        days={days}
      />
    </TimetableIntro>
  );
}
