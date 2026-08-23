import { NextResponse } from "next/server";
import { AuthError, requireStaff } from "@/lib/auth";
import { generateSessions } from "@/lib/schedule";
import { generateSchema } from "@/lib/validation";

export async function POST(req: Request) {
  try {
    await requireStaff();
  } catch (e) {
    const status = e instanceof AuthError && e.code === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "NOT_ALLOWED" }, { status });
  }

  const parsed = generateSchema.safeParse(await req.json().catch(() => ({ weeks: 6 })));
  const weeks = parsed.success ? parsed.data.weeks : 6;

  const result = generateSessions(weeks);
  return NextResponse.json({ ok: true, ...result });
}
