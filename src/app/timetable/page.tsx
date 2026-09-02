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
import { getAvailableCredits, getCreditSummary } from "@/lib/credits";
import {
  studioAddDays,
  studioDateKey,
  studioDayKeys,
  studioStartOfDay,
} from "@/lib/time";
import { pushPublicKey } from "@/lib/messaging/push";
import { isPersonalBookable } from "@/lib/personal";
import { STUDIO } from "@/lib/studio";
import { isBookable } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Timetable",
  description:
    "Live Reformer Pilates timetable at APEX pilates, with personal and duet sessions at midday. Book with sessions, free cancellation up to 12 hours before a class.",
};

export const dynamic = "force-dynamic";

const DAYS_SHOWN = 28;

export default async function TimetablePage() {
  const session = await readSession();
  const from = studioStartOfDay(new Date());
  const to = studioAddDays(from, DAYS_SHOWN);

  const [rows, credits, summary] = await Promise.all([
    listSessions({ from, to, userId: session?.sub ?? null }),
    session ? getAvailableCredits(session.sub) : Promise.resolve(0),
    session ? getCreditSummary(session.sub) : Promise.resolve(null),
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
      /* Two cutoffs, one field. An appointment closes at the end of the
         previous day and a class closes a minute before it starts, and the chip
         on screen has to reflect whichever rule the Book button will apply. */
      bookable:
        s.classType.kind === "PERSONAL"
          ? isPersonalBookable(s.startsAt, now)
          : isBookable(s.startsAt, now),
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
      kind: s.classType.kind,
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
        /* Both halves separately, because the two are not interchangeable: the
           panel offers "two of us" only to somebody holding a Duet session, and
           insists on it when a Duet is the only thing they hold. Letting them
           fill in a name and then be refused by the server is the version of
           this that reads as a fault. */
        duetCredits={summary?.duetCredits ?? 0}
        soloCredits={summary?.soloCredits ?? 0}
        personalCredits={summary?.personalCredits ?? 0}
        days={days}
        closedDays={closed}
        /* For the notification offer made after a booking. Empty when the
           server has no usable VAPID pair, and the panel then never appears. */
        pushPublicKey={pushPublicKey()}
      />
    </TimetableIntro>
  );
}
