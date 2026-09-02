import { NextResponse } from "next/server";
import { body, desk } from "@/lib/api-guard";
import { bookForMember, cancelForMember } from "@/lib/reception";

/**
 * The desk's two ends of a booking.
 *
 * POST cancels one, PUT creates one. Splitting them by method rather than by
 * route because they are the same object from the same screen, and a desk that
 * can cancel from one place and book from another is a desk where somebody
 * eventually cancels the wrong class looking for the booking button.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await desk();
  if ("res" in gate) return gate.res;

  const data = await body<{
    bookingId?: string;
    refund?: boolean;
    note?: string;
  }>(req);

  if (!data?.bookingId) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const result = await cancelForMember({
    bookingId: data.bookingId,
    refund: data.refund !== false,
    note: data.note,
    staffName: gate.user.name,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.code }, { status: 400 });
  }
  return NextResponse.json(result);
}

/**
 * Book a class for a member, over the telephone.
 *
 * Every rule the member's own screen applies, applied here: the session comes
 * out of the package that expires soonest, a group session cannot buy a noon
 * appointment, a full class is full, and a member with nothing left is refused
 * rather than booked for free. See `bookForMember` for why that last one is not
 * negotiable.
 *
 * The refusal codes go back untranslated so the console can say the useful
 * sentence: "no sessions left" and "that class is full" send the person at the
 * desk in completely different directions.
 */
export async function PUT(req: Request) {
  const gate = await desk();
  if ("res" in gate) return gate.res;

  const data = await body<{
    sessionId?: string;
    userId?: string;
    guestName?: string | null;
  }>(req);

  if (!data?.sessionId || !data.userId) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const result = await bookForMember({
    sessionId: data.sessionId,
    userId: data.userId,
    guestName: data.guestName ?? null,
    staffName: gate.user.name,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.code, until: result.until?.toISOString() },
      { status: 400 },
    );
  }
  return NextResponse.json(result);
}
