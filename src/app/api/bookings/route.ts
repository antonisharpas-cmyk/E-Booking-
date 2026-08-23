import { NextResponse } from "next/server";
import { bookClass, listMyBookings } from "@/lib/booking";
import { currentUser } from "@/lib/auth";
import { getAvailableCredits } from "@/lib/credits";
import { bookSchema } from "@/lib/validation";

export async function GET() {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
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

  return NextResponse.json({
    ok: true,
    bookingId: result.bookingId,
    credits: await getAvailableCredits(user.id),
  });
}
