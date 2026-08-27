import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
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
