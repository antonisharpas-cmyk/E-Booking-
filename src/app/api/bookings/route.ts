import { NextResponse } from "next/server";
import { bookClass, listMyBookings } from "@/lib/booking";
import { notOnboarded, notVerified } from "@/lib/api-guard";
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
  /* An account whose email has never been confirmed cannot take a place in a
     class. The seat is real and finite, and the studio has no way to tell the
     holder it has moved. */
  const stop = notVerified(user);
  if (stop) return stop;
  /* And the three questions, for an account that signed up after the studio
     started asking. The seat is real: whoever is teaching should know who is
     new and who has a shoulder before five people are on reformers, not
     afterwards. See lib/intake.ts for why older accounts are not caught. */
  const ask = notOnboarded(user);
  if (ask) return ask;

  const parsed = bookSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const result = bookClass(user.id, parsed.data.sessionId, {
    guestName: parsed.data.guestName ?? null,
  });
  if (!result.ok) {
    /* The three "you are holding the wrong kind of session" answers are 402
       alongside NO_CREDITS, because from the client's point of view they are the
       same class of problem: something has to be bought before this can work. */
    const needsPayment =
      result.code === "NO_CREDITS" ||
      result.code === "NEEDS_PERSONAL_CREDIT" ||
      result.code === "NEEDS_DUET_CREDIT" ||
      result.code === "DUET_IS_FOR_TWO";
    return NextResponse.json(
      {
        error: result.code,
        credits: await getAvailableCredits(user.id),
        /* Only ever set on SESSIONS_EXPIRE_FIRST, where the refusal is only
           useful if it can name the last date that would have worked. */
        until: result.until?.toISOString(),
      },
      { status: needsPayment ? 402 : 409 },
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
