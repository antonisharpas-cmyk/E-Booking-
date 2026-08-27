import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { cancelBooking } from "@/lib/booking";
import { getAvailableCredits } from "@/lib/credits";
import { notifyCancelled } from "@/lib/messaging/events";
import { cancelReminder } from "@/lib/reminders";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { bookingId?: string } | null;
  if (!body?.bookingId) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const result = cancelBooking(user.id, body.bookingId);
  if (!result.ok) {
    return NextResponse.json({ error: result.code }, { status: 409 });
  }

  /* The class is no longer booked, so the reminder is no longer owed. */
  cancelReminder(body.bookingId);

  /* Told before the row is forgotten, and told whether the session came back —
     that is the part a member actually wants confirmed. */
  void notifyCancelled(body.bookingId, result.refunded).catch(() => {});

  return NextResponse.json({
    ok: true,
    refunded: result.refunded,
    credits: await getAvailableCredits(user.id),
  });
}
