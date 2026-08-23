import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { createSession, hashPassword } from "@/lib/auth";
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
      phone: phone || null,
      passwordHash: await hashPassword(password),
      marketingOptIn: Boolean(marketingOptIn),
    })
    .returning()
    .get();

  await createSession(user);

  return NextResponse.json({
    ok: true,
    user: { id: user.id, name: user.name, email: user.email },
  });
}
