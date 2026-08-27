import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
import { toE164 } from "@/lib/messaging/sms";
import { REMINDER_DEFAULT_MINUTES } from "@/lib/profile";
import { registerSchema } from "@/lib/validation";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid details" },
      { status: 400 },
    );
  }
  const { name, email, phone, password, marketingOptIn } = parsed.data;

  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });
  if (existing) {
    return NextResponse.json({ error: "EMAIL_TAKEN" }, { status: 409 });
  }

  /**
   * And the phone, which matters as much as the email.
   *
   * A number is how the studio reaches somebody when a class moves, and two
   * accounts sharing one is two people the desk cannot tell apart on the phone —
   * plus, once SMS is connected, two texts to the same handset for two different
   * bookings.
   *
   * Compared in normalised form rather than as typed. "+357 99 123456",
   * "99123456" and "0035799123456" are one number, and a plain string
   * comparison would happily let all three through as three members.
   */
  const asked = toE164(phone);
  if (asked) {
    const clash = db
      .select({ id: users.id, phone: users.phone })
      .from(users)
      .all()
      .find((u) => toE164(u.phone) === asked);
    if (clash) {
      return NextResponse.json({ error: "PHONE_TAKEN" }, { status: 409 });
    }
  }

  const user = db
    .insert(users)
    .values({
      name,
      email,
      phone,
      passwordHash: await hashPassword(password),
      /* Stamped with the moment it was given: a consent is a record, not a
         checkbox that can quietly flip. Required to register, so it is always
         set here. */
      serviceOptInAt: new Date(),
      marketingOptIn: Boolean(marketingOptIn),
      /* Reachable by email and reminded two hours before class until they say
         otherwise. Push is always on — see lib/messaging/push.ts.

         SMS follows the offers box: somebody who wants to hear about offers and
         new class types has said they want to be contacted, and a text is the
         one channel that reliably arrives. They can turn it off in one press,
         which is why it is a reasonable default rather than a presumption. */
      notifyEmail: true,
      notifySms: Boolean(marketingOptIn),
      notifyPush: true,
      reminderMinutes: REMINDER_DEFAULT_MINUTES,
    })
    .returning()
    .get();

  await createSession(user);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email },
  });
}
