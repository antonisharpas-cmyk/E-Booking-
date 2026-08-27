import { NextResponse } from "next/server";
import { bookClass, listMyBookings } from "@/lib/booking";
import { currentUser } from "@/lib/auth";
import { getAvailableCredits } from "@/lib/credits";
import { notifyBooked, nudgeReminders } from "@/lib/messaging/events";
import { scheduleReminder } from "@/lib/reminders";
import { bookSchema } from "@/lib/validation";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  /* Any page view is a chance to push the reminder queue along, in case the
     scheduled sweep is not running. Never awaited. */
  nudgeReminders();
  const bookings = await listMyBookings(user.id);
  return NextResponse.json({
    ...bookings,
    credits: await getAvailableCredits(user.id),
  });
}

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = bookSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const result = bookClass(user.id, parsed.data.sessionId);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.code, credits: await getAvailableCredits(user.id) },
      { status: result.code === "NO_CREDITS" ? 402 : 409 },
    );
  }

  /* Queue the reminder outside the booking transaction: a reminder that fails
     to schedule must never cost someone their booking. */
  let reminderAt: string | null = null;
  try {
    reminderAt = scheduleReminder(result.bookingId)?.dueAt.toISOString() ?? null;
  } catch {
    reminderAt = null;
  }

  /* The confirmation goes out on its own time. Deliberately not awaited: a
     push service being slow must not make the member wait to see their booking,
     and a push that fails must not read as a booking that failed. */
  void notifyBooked(result.bookingId).catch(() => {});

  return NextResponse.json({
    ok: true,
    bookingId: result.bookingId,
    reminderAt,
    credits: await getAvailableCredits(user.id),
  });
}
