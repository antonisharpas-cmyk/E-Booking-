import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/db";
import { users, type User } from "@/db/schema";

export const SESSION_COOKIE = "apex_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 16) {
    throw new Error(
      "AUTH_SECRET is missing or too short. Add it to .env (see .env.example).",
    );
  }
  return new TextEncoder().encode(s);
}

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  role: string;
};

export async function hashPassword(plain: string) {
  return bcrypt.hash(plain, 11);
}

export async function verifyPassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash);
}

export async function createSession(user: {
  id: string;
  email: string;
  name: string;
  role: string;
}) {
  const token = await new SignJWT({
    email: user.email,
    name: user.name,
    role: user.role,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySession() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

export async function readSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: String(payload.email ?? ""),
      name: String(payload.name ?? ""),
      role: String(payload.role ?? "MEMBER"),
    };
  } catch {
    return null;
  }
}

/** Full user row for the signed-in visitor, or null. */
export async function currentUser(): Promise<User | null> {
  const session = await readSession();
  if (!session) return null;
  const row = await db.query.users.findFirst({
    where: eq(users.id, session.sub),
  });
  return row ?? null;
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new AuthError("UNAUTHENTICATED");
  return user;
}

export async function requireStaff(): Promise<User> {
  const user = await requireUser();
  if (user.role !== "STAFF" && user.role !== "ADMIN") {
    throw new AuthError("FORBIDDEN");
  }
  return user;
}

export class AuthError extends Error {
  constructor(public code: "UNAUTHENTICATED" | "FORBIDDEN") {
    super(code);
  }
}

export function isStaff(user: { role: string } | null | undefined) {
  return user?.role === "STAFF" || user?.role === "ADMIN";
}
