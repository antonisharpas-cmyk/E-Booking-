import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { getAvailableCredits } from "@/lib/credits";
import { unreadCount } from "@/lib/notices";

/**
 * The two numbers on the header, and nothing else.
 *
 * Exists so the header can keep itself honest without a page reload. Both of
 * those numbers are rendered on the server, which is right for the first paint
 * and wrong for the next twenty minutes: a member with the site open on their
 * phone had a stale badge until they reloaded, so a notice written while they
 * were looking at the timetable appeared to have not arrived at all. Sessions
 * sold at the desk had the same problem, and that one is worse — somebody pays
 * at the counter and their balance still says zero.
 *
 * Deliberately tiny. `/api/notices` would answer the same question, but it
 * carries every notice body and its paging with it, and this is polled: the
 * difference between two integers and a page of text matters when it is asked
 * for on a timer, on a phone, on a mobile connection.
 *
 * 200 with nulls rather than a 401 when nobody is signed in. The header polls
 * this and a signed-out browser asking a question it is allowed to ask should
 * not fill the console with authentication errors.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ signedIn: false, unread: null, credits: null });
  }

  return NextResponse.json({
    signedIn: true,
    unread: unreadCount(user.id),
    credits: await getAvailableCredits(user.id),
  });
}
