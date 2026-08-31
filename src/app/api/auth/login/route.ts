import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, isVerified, verifyPassword } from "@/lib/auth";
import { loginSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 400 });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.email, parsed.data.email),
  });
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return NextResponse.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  await createSession(user);
  return NextResponse.json({
    ok: true,
    /**
     * Somebody signing in to an account they never confirmed.
     *
     * They are let in — the password was right, and the account is theirs — and
     * then sent to the code box rather than to the timetable. The alternative is
     * worse than a redirect: they land on a page that looks like every other
     * member's, press Book, and are refused by a rule nobody has mentioned to
     * them since the day they registered.
     */
    verify: !isVerified(user),
    user: { id: user.id, name: user.name, role: user.role },
  });
}
