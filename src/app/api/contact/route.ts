import { NextResponse } from "next/server";
import { db } from "@/db";
import { contactMessages } from "@/db/schema";
import { contactSchema } from "@/lib/validation";

/**
 * Stores enquiries in the database so nothing is lost before email is wired up.
 * To also send email, add your provider (Resend / SendGrid / SMTP) here.
 */
export async function POST(req: Request) {
  const parsed = contactSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid message" },
      { status: 400 },
    );
  }

  db.insert(contactMessages)
    .values({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: parsed.data.phone || null,
      message: parsed.data.message,
    })
    .run();

  return NextResponse.json({ ok: true });
}
