import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
import { grantCredits } from "@/lib/credits";
import { notifyPromoGranted, sendVerificationCode } from "@/lib/messaging/events";
import { toE164 } from "@/lib/messaging/sms";
import { activePromo } from "@/lib/promo";
import { REMINDER_DEFAULT_MINUTES } from "@/lib/profile";
import { registerSchema } from "@/lib/validation";
import { OTP_TTL_MINUTES, issueCode } from "@/lib/verify";

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

  /**
   * Both checks above read the table and then this writes to it, and in between
   * those two moments somebody else's registration can land. Rare, and the
   * database refuses it — see the unique indexes in db/schema.ts — but a refusal
   * that arrives as a thrown constraint error would reach the member as "500,
   * something went wrong" rather than "that email is already registered".
   *
   * So the throw is caught and turned back into the answer the checks above
   * would have given. The message names the column, which is the only thing we
   * need from it.
   */
  let user;
  try {
    user = db
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
        /* Stamped in the same breath, because it was given in the same act. The
           schema has already refused anything but a literal true. */
        termsAcceptedAt: new Date(),
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
        /* Left null deliberately: the account exists and can do nothing until a
           code from that mailbox comes back. See lib/verify.ts. */
        emailVerifiedAt: null,
      })
      .returning()
      .get();
  } catch (e) {
    const msg = (e as Error).message ?? "";
    if (/unique/i.test(msg)) {
      return NextResponse.json(
        { error: /phone/i.test(msg) ? "PHONE_TAKEN" : "EMAIL_TAKEN" },
        { status: 409 },
      );
    }
    throw e;
  }

  /**
   * The code, on its way.
   *
   * Awaited rather than fired and forgotten, because unlike a booking
   * confirmation this message *is* the next step: if it cannot be sent, the
   * member is looking at a box asking for something that will never arrive, and
   * they deserve to be told so on the spot rather than after two minutes of
   * waiting.
   *
   * A failure is still not a failed registration. The account is made, they are
   * signed in, and the verify screen has a "send it again" button — which is a
   * far better place to be than back at an empty form having lost everything
   * they typed.
   */
  const { code } = issueCode(user.id);
  let sent = true;
  try {
    /**
     * Capped, because the SMTP client allows twenty seconds *per reply* and a
     * conversation with a mail server is half a dozen replies. A sulking server
     * could hold this request open for a minute and a half, and the person on
     * the other end would have pressed the button three more times by then.
     *
     * Eight seconds is generous for a mail server that is working. When it is
     * exceeded the send is not cancelled — it may well arrive — the *waiting*
     * is, and the member goes to a screen with a "send it again" button on it.
     */
    const res = await Promise.race([
      sendVerificationCode(user.email, code, OTP_TTL_MINUTES, user.id),
      new Promise<{ ok: false; error: string }>((resolve) =>
        setTimeout(() => resolve({ ok: false, error: "TIMED_OUT" }), 8_000),
      ),
    ]);
    sent = res.ok;
    if (!res.ok) console.error("[verify] send failed for", user.email, res.error);
  } catch (e) {
    sent = false;
    console.error("[verify] send threw for", user.email, e);
  }

  /* Signed in, but not yet allowed to do anything: the session identifies them
     so the verify screen knows whose code to check. Every route that acts on a
     member's behalf checks the stamp, not the cookie. */
  await createSession(user);

  /**
   * The opening-week offer.
   *
   * Granted here rather than waiting for the code to come back, and I went back
   * and forth on that. Waiting would mean one email at a time instead of two
   * landing together — but it would also mean somebody who registers at 23:58 on
   * the last day of the offer and reads their email at 00:05 has lost the session
   * the page promised them. A promise made at registration should be kept at
   * registration.
   *
   * The two-emails problem is handled where it belongs, in the code email itself:
   * the six digits are in its subject line, so it is the one message in the inbox
   * that can be identified without opening anything.
   *
   * Never allowed to fail the registration. An account that exists without its
   * free session is a problem the desk can fix in ten seconds; a registration
   * that failed because a promotional grant threw is a customer lost.
   */
  const promo = activePromo();
  if (promo) {
    try {
      grantCredits({
        userId: user.id,
        credits: promo.credits,
        validityDays: null,
        expiresAt: promo.expiresAt,
        usableFrom: promo.spendFrom,
        usableTo: promo.spendUntil,
        source: "GRANT",
        reason: "ADMIN_GRANT",
        note: `${promo.name}: free session on joining`,
      });
      void notifyPromoGranted(user.id, promo).catch(() => {});
    } catch (e) {
      console.error("[promo] grant failed for", user.email, e);
    }
  }

  return NextResponse.json({
    ok: true,
    /* The form reads this and goes to /verify rather than to the timetable. */
    verify: true,
    sent,
    user: { id: user.id, name: user.name, email: user.email },
  });
}
