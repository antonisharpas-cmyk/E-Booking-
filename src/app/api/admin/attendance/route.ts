import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bookings } from "@/db/schema";
import { AuthError, requireStaff } from "@/lib/auth";
import { attendanceSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    await requireStaff();
  } catch (e) {
    const status = e instanceof AuthError && e.code === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "NOT_ALLOWED" }, { status });
  }

  const parsed = attendanceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  db.update(bookings)
    .set({ status: parsed.data.status })
    .where(eq(bookings.id, parsed.data.bookingId))
    .run();

  return NextResponse.json({ ok: true });
}
