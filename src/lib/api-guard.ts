import { NextResponse } from "next/server";
import type { User } from "@/db/schema";
import {
  AuthError,
  requireDesk,
  requireOwner,
  requireUser,
} from "@/lib/auth";

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

/** Reads a JSON body without throwing on an empty or malformed one. */
export async function body<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
