import { NextResponse } from "next/server";
import { desk } from "@/lib/api-guard";
import { runDueReminders } from "@/lib/messaging/events";

/**
 * The reminder sweep, on a schedule.
 *
 *   curl -X POST -H "authorization: Bearer $CRON_SECRET" \
 *        https://apexpilates.cy/api/cron/reminders
 *
 * A reminder has to go out at two hours before the class whether or not anybody
 * happens to be looking at the website, so something outside the app has to
 * knock on this door — a hosting provider's scheduler, or Windows Task
 * Scheduler. Every five minutes is plenty: the sweep sends everything that has
 * come due, so a missed run catches up on the next one rather than losing
 * anybody's reminder.
 *
 * Two ways in, and no third: the shared secret for a machine, or a signed-in
 * member of staff for a person testing it. Left open, this would be a way for
 * anyone to make four hundred phones buzz.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const offered = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");

  /* A configured secret is the machine's way in. Timing-safe comparison is not
     the point here — the secret is long and there is no oracle to probe — but a
     blank secret must never match a blank header. */
  const bySecret = Boolean(secret) && offered === secret;

  if (!bySecret) {
    const gate = await desk();
    if ("res" in gate) return gate.res;
  }

  const result = await runDueReminders();
  return NextResponse.json({ ok: true, ...result });
}

/** Convenience for a scheduler that can only issue GETs. Same two doors. */
export async function GET(req: Request) {
  return POST(req);
}
