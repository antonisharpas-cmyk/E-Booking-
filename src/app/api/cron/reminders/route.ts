import { NextResponse } from "next/server";
import { desk } from "@/lib/api-guard";
import {
  sweepDeadChallenges,
  sweepUnverifiedAccounts,
} from "@/lib/housekeeping";
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
 *
 * It also carries the housekeeping: registrations nobody finished, and dead
 * confirmation codes. See `housekeeping()` at the bottom for why they live here
 * rather than in a second scheduled job.
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

  return NextResponse.json({ ok: true, ...result, ...housekeeping() });
}

/**
 * The tidying that rides along with the sweep.
 *
 * Here rather than in a second scheduled job because the studio should not have
 * to set up two, and because this is the one thing already knocking on the door
 * on a timer. It is not a reminder, so it keeps its own function and its own keys
 * in the response.
 *
 * Rate-limited to once an hour. The sweep itself runs every minute in
 * development, and looking for week-old registrations sixty times an hour would
 * be sixty queries finding the same nothing. The clock is module state, so a
 * restart brings it forward, which is better than a restart delaying it.
 *
 * Never allowed to fail the sweep. A class starting in two hours must not go
 * unannounced because a delete threw.
 */
let lastTidy = 0;
const TIDY_EVERY_MS = 60 * 60 * 1000;

function housekeeping() {
  const now = Date.now();
  if (now - lastTidy < TIDY_EVERY_MS) return {};
  lastTidy = now;
  try {
    const accounts = sweepUnverifiedAccounts();
    const codes = sweepDeadChallenges();
    if (accounts.deleted || accounts.kept.length || codes) {
      console.log(
        `[housekeeping] ${accounts.deleted} unfinished registration(s) cleared` +
          (codes ? ` · ${codes} dead code(s) cleared` : "") +
          (accounts.kept.length
            ? ` · ${accounts.kept.length} kept, they have history: ${accounts.kept.join(", ")}`
            : ""),
      );
    }
    return {
      unverifiedCleared: accounts.deleted,
      unverifiedKept: accounts.kept.length,
      deadCodesCleared: codes,
    };
  } catch (e) {
    console.error("[housekeeping] failed", (e as Error).message);
    return {};
  }
}

/** Convenience for a scheduler that can only issue GETs. Same two doors. */
export async function GET(req: Request) {
  return POST(req);
}
