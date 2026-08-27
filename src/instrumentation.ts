/**
 * Things that have to happen because time passed, not because somebody asked.
 *
 * Next.js calls `register()` once when the server starts. It is the only hook
 * that runs without a request, which makes it the only place a clock can live.
 *
 * Why this file exists at all: the reminder sweep used to be nudged by ordinary
 * traffic — any visit to the timetable pushed the queue along. That is fine as a
 * backstop and useless as a mechanism, and the evidence was thirteen reminders
 * sitting unsent in a real database, the oldest from the previous day, because
 * nobody had happened to load the right page in the right minute. A reminder
 * that depends on somebody visiting the site is not a reminder: the member it is
 * for is, by definition, not visiting the site.
 *
 * So the server now keeps its own clock. Every minute, whether or not anything
 * else is happening.
 *
 * This is not a replacement for the scheduled call in production — see
 * docs/notifications.md. A hosting platform that sleeps an idle server, or runs
 * several of them, needs something outside the process. But it means a single
 * running server is enough, which is what development and a small VPS both are.
 */

/** Guards against a second timer when the dev server recompiles. */
declare global {
  // eslint-disable-next-line no-var
  var __apexSweep: NodeJS.Timeout | undefined;
}

const EVERY_MS = 60_000;

export async function register() {
  /* Edge runtime has no timers worth the name and no database. Node only. */
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  /* `next dev` re-evaluates modules on change. Without this, every edit would
     leave another timer running and a member would be reminded four times. */
  if (global.__apexSweep) return;

  const { runDueReminders } = await import("@/lib/messaging/events");

  const tick = async () => {
    try {
      const r = await runDueReminders();
      if (r.due > 0) {
        console.log(
          `[reminders] ${r.due} due · pushed ${r.pushed} · emailed ${r.emailed} · texted ${r.texted}`,
        );
      }
    } catch (e) {
      /* Logged rather than swallowed. The old code caught this silently, which
         is how a sweep that never worked went unnoticed for two days. */
      console.error("[reminders] sweep failed", e);
    }
  };

  global.__apexSweep = setInterval(tick, EVERY_MS);
  /* Do not hold the process open on account of a timer. */
  global.__apexSweep.unref?.();

  /* And once now, so a server that has just started catches anything that came
     due while it was down. */
  void tick();

  console.log(`[reminders] sweeping every ${EVERY_MS / 1000}s`);
}
