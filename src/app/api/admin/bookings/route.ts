import { NextResponse } from "next/server";
import { body, desk } from "@/lib/api-guard";
import { cancelForMember } from "@/lib/reception";

/** Cancel a member's booking from the desk, refunding the session or not. */
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
