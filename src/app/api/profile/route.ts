import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import {
  kgToGrams,
  parseBirthDate,
  ageFromBirthDate,
  MAX_AGE_YEARS,
  MIN_AGE_YEARS,
} from "@/lib/profile";
import { rescheduleUpcoming } from "@/lib/reminders";
import { profileSchema } from "@/lib/validation";

/**
 * A member editing their own profile.
 *
 * Email and phone are not accepted here even if they are sent: they are the
 * studio's contact of record, and letting someone change the address a
 * password reset would go to is a different feature with different care around
 * it. Whatever arrives in those fields is ignored rather than rejected, so an
 * older client cannot fail confusingly.
 */
export async function PATCH(req: Request) {
  const user = await currentUser();
  if (!user)
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = profileSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "INVALID" },
      { status: 400 },
    );
  }
  const d = parsed.data;

  /* A date of birth has to be a real date, in the past, and old enough that
     the studio is not quietly taking bookings for a child. */
  let birthDate: string | null = null;
  if (d.birthDate) {
    const parsedDate = parseBirthDate(d.birthDate);
    if (!parsedDate || parsedDate.getTime() > Date.now()) {
      return NextResponse.json({ error: "BIRTHDATE_INVALID" }, { status: 400 });
    }
    const age = ageFromBirthDate(d.birthDate);
    if (age === null || age < MIN_AGE_YEARS || age > MAX_AGE_YEARS) {
      return NextResponse.json({ error: "BIRTHDATE_AGE" }, { status: 400 });
    }
    birthDate = d.birthDate;
  }

  const before = {
    reminderMinutes: user.reminderMinutes,
    notifyEmail: user.notifyEmail,
    notifySms: user.notifySms,
    notifyPush: user.notifyPush,
  };

  db.update(users)
    .set({
      name: d.name,
      /* Recorded once, the first time it is given. Never cleared here: an
         existing consent is a fact about the past. */
      serviceOptInAt:
        user.serviceOptInAt ?? (d.serviceOptIn ? new Date() : null),
      birthDate,
      heightCm: d.heightCm ?? null,
      weightGrams: d.weightKg == null ? null : kgToGrams(d.weightKg),
      marketingOptIn: d.marketingOptIn,
      notifyEmail: d.notifyEmail,
      notifySms: d.notifySms,
      notifyPush: d.notifyPush,
      reminderMinutes: d.reminderMinutes,
    })
    .where(eq(users.id, user.id))
    .run();

  /* Only touch the queue when the reminder actually changed, so saving a new
     weight does not quietly rewrite every reminder already promised. */
  const remindersChanged =
    before.reminderMinutes !== d.reminderMinutes ||
    before.notifyEmail !== d.notifyEmail ||
    before.notifySms !== d.notifySms ||
    before.notifyPush !== d.notifyPush;

  const rescheduled = remindersChanged ? rescheduleUpcoming(user.id) : 0;

  return NextResponse.json({ ok: true, remindersChanged, rescheduled });
}
