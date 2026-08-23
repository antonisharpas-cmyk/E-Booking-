import { NextResponse } from "next/server";
import { readSession } from "@/lib/auth";
import { listSessions } from "@/lib/booking";
import { studioAddDays, studioStartOfDay } from "@/lib/time";

/** GET /api/sessions?from=ISO&days=7 — live timetable with occupancy. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fromParam = url.searchParams.get("from");
  const days = Math.min(Number(url.searchParams.get("days") ?? 7) || 7, 42);

  const from = studioStartOfDay(fromParam ? new Date(fromParam) : new Date());
  const to = studioAddDays(from, days);

  const session = await readSession();
  const sessions = await listSessions({ from, to, userId: session?.sub ?? null });

  return NextResponse.json({
    from: from.toISOString(),
    to: to.toISOString(),
    sessions,
  });
}
