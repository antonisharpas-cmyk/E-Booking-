import { NextResponse } from "next/server";
import { member } from "@/lib/api-guard";
import { noticesFor, unreadCount } from "@/lib/notices";

/**
 * The member's own notices.
 *
 * Only what they are allowed to see: studio and timetable notices always, and
 * offers only if they accepted offers — checked on the way out, so withdrawing
 * that consent hides the ones already sent rather than leaving them sitting
 * there.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await member();
  if ("res" in gate) return gate.res;

  const locale = new URL(req.url).searchParams.get("locale") === "el" ? "el" : "en";

  return NextResponse.json({
    notices: noticesFor(gate.user.id, locale).map((n) => ({
      ...n,
      createdAt: n.createdAt.toISOString(),
    })),
    unread: unreadCount(gate.user.id),
  });
}
