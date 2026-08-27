import { NextResponse } from "next/server";
import { body, desk } from "@/lib/api-guard";
import { generateSessions, removeGeneratedSessions } from "@/lib/schedule";
import { generateSchema } from "@/lib/validation";

/**
 * Rolls the weekly rota forward, and takes one roll-forward back.
 *
 * Behind the desk lock. DELETE undoes a run by the ids it created — see
 * removeGeneratedSessions, which refuses to remove a class somebody has booked.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const gate = await desk();
  if ("res" in gate) return gate.res;

  const parsed = generateSchema.safeParse(await req.json().catch(() => ({ weeks: 6 })));
  const weeks = parsed.success ? parsed.data.weeks : 6;

  const result = generateSessions(weeks);
  return NextResponse.json({ ok: true, ...result });
}

export async function DELETE(req: Request) {
  const gate = await desk();
  if ("res" in gate) return gate.res;

  const data = await body<{ ids?: string[] }>(req);
  const ids = (data?.ids ?? []).filter(
    (id): id is string => typeof id === "string" && id.length > 0,
  );
  if (ids.length === 0 || ids.length > 5000) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, ...removeGeneratedSessions(ids) });
}
