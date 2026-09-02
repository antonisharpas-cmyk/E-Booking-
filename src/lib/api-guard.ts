import { NextResponse } from "next/server";
import type { User } from "@/db/schema";
import {
  AuthError,
  isVerified,
  requireDesk,
  requireOwner,
  requireUser,
  requireVerified,
} from "@/lib/auth";
import { intakeRequired } from "@/lib/intake";

/**
 * The two guards every route starts with, in one place.
 *
 * Each returns either the user or the response to send instead, so a route body
 * reads as a straight line and cannot forget the check:
 *
 *     const gate = await desk();
 *     if ("res" in gate) return gate.res;
 *     … gate.user is staff, and this browser has unlocked the desk
 *
 * The three states are told apart on purpose. Not signed in is 401, signed in
 * as a member is 403, and staff who have not typed their password is 423 with
 * LOCKED — because that last one is not an error, it is the desk asking to be
 * unlocked, and the console shows the password box instead of a failure.
 */
export async function desk(): Promise<{ user: User } | { res: NextResponse }> {
  try {
    return { user: await requireDesk() };
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "LOCKED") {
        return {
          res: NextResponse.json({ error: "LOCKED" }, { status: 423 }),
        };
      }
      if (e.code === "FORBIDDEN") {
        return {
          res: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
        };
      }
    }
    return {
      res: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }),
    };
  }
}

/**
 * The desk, restricted to the owner.
 *
 * Same three states as `desk()`, and a receptionist gets the same 403 a member
 * would: the route does not explain that the figures exist and are not theirs.
 */
export async function owner(): Promise<
  { user: User } | { res: NextResponse }
> {
  try {
    return { user: await requireOwner() };
  } catch (e) {
    if (e instanceof AuthError) {
      if (e.code === "LOCKED") {
        return { res: NextResponse.json({ error: "LOCKED" }, { status: 423 }) };
      }
      if (e.code === "FORBIDDEN") {
        return {
          res: NextResponse.json({ error: "FORBIDDEN" }, { status: 403 }),
        };
      }
    }
    return {
      res: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }),
    };
  }
}

export async function member(): Promise<{ user: User } | { res: NextResponse }> {
  try {
    return { user: await requireUser() };
  } catch {
    return {
      res: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }),
    };
  }
}

/**
 * A member whose email address has been proved.
 *
 * The guard for anything that *does* something — booking a class, spending a
 * session, paying, changing a detail the studio will act on. An unverified
 * account can exist and can sign in, and that is all it can do.
 *
 * Told apart from plain 403 by its own code, because the screen has somewhere to
 * send them: `EMAIL_UNVERIFIED` means "go and type the code", which is a step
 * forward, while a bare "forbidden" reads as a wall.
 *
 * Deliberately not used by the two verification routes themselves — an account
 * proving its address must be able to reach the thing that proves it.
 */
export async function verified(): Promise<
  { user: User } | { res: NextResponse }
> {
  try {
    return { user: await requireVerified() };
  } catch (e) {
    if (e instanceof AuthError && e.code === "UNVERIFIED") {
      return {
        res: NextResponse.json({ error: "EMAIL_UNVERIFIED" }, { status: 403 }),
      };
    }
    return {
      res: NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 }),
    };
  }
}

/**
 * The verification check for the routes that read `currentUser()` themselves.
 *
 * Most member routes were written before the guards above existed and fetch the
 * user directly, which is fine — they only need one more line, and this is it:
 *
 *     const stop = notVerified(user);
 *     if (stop) return stop;
 *
 * Returns the response to send, or null to carry on. A function rather than a
 * boolean so the status code and the error string are decided in one place and
 * cannot drift between fifteen routes.
 */
export function notVerified(user: {
  role: string;
  emailVerifiedAt: Date | null;
}): NextResponse | null {
  if (isVerified(user)) return null;
  return NextResponse.json({ error: "EMAIL_UNVERIFIED" }, { status: 403 });
}

/**
 * The three questions, still unanswered.
 *
 * Used by the booking routes and nothing else. The welcome step is a screen a
 * member is *sent* to, and a screen can be walked around: typing a booking URL,
 * an old tab, a phone that restored yesterday's page. So the rule lives on the
 * routes that matter rather than on the redirect, which is the difference
 * between a prompt and a requirement.
 *
 * Deliberately narrow. It guards taking a seat in a class, not reading the
 * timetable or the price list: somebody who has not answered can look at
 * everything, and is asked at the one moment the answer is needed.
 */
export function notOnboarded(user: {
  role: string;
  intakeAt: Date | null;
  createdAt: Date;
}): NextResponse | null {
  if (!intakeRequired(user)) return null;
  return NextResponse.json({ error: "INTAKE_REQUIRED" }, { status: 403 });
}

/** Reads a JSON body without throwing on an empty or malformed one. */
export async function body<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
