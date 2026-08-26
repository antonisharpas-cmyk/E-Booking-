import { NextResponse } from "next/server";
import { desk } from "@/lib/api-guard";
import { daySessions } from "@/lib/admin";

/**
 * One day's classes with their rosters.
 *
 * Any date, not only today: the desk is as often answering "who is in on
 * Saturday" as it is checking people in this morning.
 */
export const dynamic = "force-dynamic";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const gate = await desk();
  if ("res" in gate) return gate.res;

  const asked = new URL(req.url).searchParams.get("date");
  if (asked && !DAY.test(asked)) {
    return NextResponse.json({ error: "BAD_DAY" }, { status: 400 });
  }

  /* Midday keeps the parse inside the intended calendar day whatever the
     server's own timezone is; studioStartOfDay then anchors it to Larnaca. */
  const day = asked ? new Date(`${asked}T12:00:00Z`) : new Date();
  const sessions = await daySessions(day);

  return NextResponse.json({
    date: asked,
    sessions: sessions.map((s) => ({
      ...s,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
    })),
  });
}
