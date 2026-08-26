import { NextResponse } from "next/server";
import { desk } from "@/lib/api-guard";
import { generateSessions } from "@/lib/schedule";
import { generateSchema } from "@/lib/validation";

/** Rolls the weekly rota forward. Behind the desk lock. */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await desk();
  if ("res" in gate) return gate.res;

  const parsed = generateSchema.safeParse(await req.json().catch(() => ({ weeks: 6 })));
  const weeks = parsed.success ? parsed.data.weeks : 6;

  const result = generateSessions(weeks);
  return NextResponse.json({ ok: true, ...result });
}
