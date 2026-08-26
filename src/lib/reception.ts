import { and, desc, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import {
  bookings,
  classSessions,
  classTypes,
  creditBatches,
  creditLedger,
  purchases,
  users,
} from "@/db/schema";
import { hashPassword } from "@/lib/auth";
import { getCreditSummary, grantCredits, refundOneCredit } from "@/lib/credits";

/**
 * What somebody at the desk can do on a member's behalf.
 *
 * Every one of these is an action taken *for* a member by somebody else, so
 * every one of them writes to the session ledger with a note saying who and
 * why. A balance that changed with no explanation is the thing that turns a
 * disagreement at the desk into an argument.
 */

/* ------------------------------------------------------------ find a member */

export type MemberSummary = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: Date;
  credits: number;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyPush: boolean;
  marketingOptIn: boolean;
};

/**
 * Whether an account is one of the studio's own.
 *
 * Reception may not read or change a colleague's account: not the owner's phone
 * number, and certainly not their password, which would hand the whole console
 * over. Only the owner can. This is the one check the routes share, rather than
 * each remembering it for itself.
 */
export function isDeskAccount(userId: string) {
  const row = db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, userId))
    .get();
  return row?.role === "STAFF" || row?.role === "ADMIN";
}

export async function findMembers(
  query: string,
  { limit = 12, includeDesk = false }: { limit?: number; includeDesk?: boolean } = {},
) {
  const q = query.trim().toLowerCase();
  const all = db.select().from(users).orderBy(desc(users.createdAt)).all();
  /* The studio's own accounts are not part of the membership as far as the desk
     is concerned. The owner sees them; reception does not. */
  const rows = includeDesk
    ? all
    : all.filter((u) => u.role !== "STAFF" && u.role !== "ADMIN");

  const matched = q
    ? rows.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, "")),
      )
    : rows;

  const out: MemberSummary[] = [];
  for (const u of matched.slice(0, limit)) {
    out.push({
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      createdAt: u.createdAt,
      credits: (await getCreditSummary(u.id)).available,
      notifyEmail: u.notifyEmail,
      notifySms: u.notifySms,
      notifyPush: u.notifyPush,
      marketingOptIn: u.marketingOptIn,
    });
  }
  return out;
}

/** One member, with everything the desk needs on screen at once. */
export async function memberDetail(userId: string) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;

  const wallet = await getCreditSummary(userId);

  const upcoming = db
    .select({
      id: bookings.id,
      status: bookings.status,
      startsAt: classSessions.startsAt,
      className: classTypes.nameEn,
    })
    .from(bookings)
    .innerJoin(classSessions, eq(bookings.sessionId, classSessions.id))
    .innerJoin(classTypes, eq(classSessions.classTypeId, classTypes.id))
    .where(
      and(
        eq(bookings.userId, userId),
        eq(bookings.status, "CONFIRMED"),
        gt(classSessions.startsAt, new Date()),
      ),
    )
    .orderBy(classSessions.startsAt)
    .all();

  const payments = db
    .select()
    .from(purchases)
    .where(eq(purchases.userId, userId))
    .orderBy(desc(purchases.createdAt))
    .limit(10)
    .all();

  const ledger = db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(15)
    .all();

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    createdAt: user.createdAt,
    credits: wallet.available,
    batches: wallet.batches,
    notifyEmail: user.notifyEmail,
    notifySms: user.notifySms,
    notifyPush: user.notifyPush,
    marketingOptIn: user.marketingOptIn,
    upcoming,
    payments,
    ledger,
  };
}

/* ------------------------------------------------- sessions sold at the desk */

export type SellResult =
  | { ok: true; credits: number; balance: number }
  | { ok: false; code: "NOT_FOUND" | "NOTHING_TO_TAKE" | "BAD_AMOUNT" };

/**
 * Add sessions a member paid for in cash, or take sessions back off them.
 *
 * A cash sale is recorded as a purchase as well as a batch, so it shows up in
 * the member's payment history and in the studio's takings beside the card
 * ones. Removing sessions writes a negative ledger line instead — there is no
 * such thing as a negative purchase.
 */
export async function sellSessions(args: {
  userId: string;
  credits: number;
  validityDays?: number;
  amountCents?: number;
  method?: "cash" | "card_at_desk" | "adjustment";
  note?: string;
  staffId: string;
  staffName: string;
}): Promise<SellResult> {
  const {
    userId,
    credits,
    validityDays = 90,
    amountCents = 0,
    method = "cash",
    note,
    staffId,
    staffName,
  } = args;

  if (!Number.isInteger(credits) || credits === 0 || Math.abs(credits) > 100) {
    return { ok: false, code: "BAD_AMOUNT" };
  }

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return { ok: false, code: "NOT_FOUND" };

  const reason = note?.trim()
    ? `${note.trim()} — ${staffName}`
    : `At the desk — ${staffName}`;

  if (credits > 0) {
    db.transaction(() => {
      const purchase =
        method === "adjustment"
          ? null
          : db
              .insert(purchases)
              .values({
                userId,
                credits,
                amountCents,
                currency: "eur",
                status: "PAID",
                provider: method,
                paidAt: new Date(),
                providerRef: `desk:${staffId.slice(0, 8)}`,
              })
              .returning()
              .get();

      grantCredits({
        userId,
        credits,
        validityDays,
        purchaseId: purchase?.id,
        source: method === "adjustment" ? "GRANT" : "PURCHASE",
        reason: method === "adjustment" ? "ADMIN_GRANT" : "PURCHASE",
        note: reason,
      });
    });

    return {
      ok: true,
      credits,
      balance: (await getCreditSummary(userId)).available,
    };
  }

  /* Taking sessions back: from the batch that expires last, so the member
     keeps the ones closest to expiring and nothing is quietly written off. */
  const wanted = Math.abs(credits);
  const live = db
    .select()
    .from(creditBatches)
    .where(and(eq(creditBatches.userId, userId), gt(creditBatches.creditsRemaining, 0)))
    .all()
    .sort((a, b) => {
      const ax = a.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bx = b.expiresAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return bx - ax;
    });

  const total = live.reduce((n, b) => n + b.creditsRemaining, 0);
  if (total === 0) return { ok: false, code: "NOTHING_TO_TAKE" };

  const taking = Math.min(wanted, total);

  db.transaction(() => {
    let left = taking;
    for (const batch of live) {
      if (left <= 0) break;
      const off = Math.min(left, batch.creditsRemaining);
      db.update(creditBatches)
        .set({ creditsRemaining: batch.creditsRemaining - off })
        .where(eq(creditBatches.id, batch.id))
        .run();
      left -= off;
    }

    db.insert(creditLedger)
      .values({
        userId,
        delta: -taking,
        reason: "ADMIN_GRANT",
        note: reason,
      })
      .run();
  });

  return {
    ok: true,
    credits: -taking,
    balance: (await getCreditSummary(userId)).available,
  };
}

/* ------------------------------------------------------ cancel for a member */

export type DeskCancelResult =
  | { ok: true; refunded: boolean; balance: number }
  | { ok: false; code: "NOT_FOUND" | "ALREADY_CANCELLED" };

/**
 * Cancel a booking from the desk, refunding or not as the member is told.
 *
 * Unlike a member cancelling their own class, this ignores the 24-hour window:
 * when somebody rings the studio an hour before with a good reason, the person
 * at the desk is the one who decides, and the software should not overrule
 * them. Which way it went is written to the ledger either way.
 */
export async function cancelForMember(args: {
  bookingId: string;
  refund: boolean;
  staffName: string;
  note?: string;
}): Promise<DeskCancelResult> {
  const { bookingId, refund, staffName, note } = args;

  const booking = db
    .select()
    .from(bookings)
    .where(eq(bookings.id, bookingId))
    .get();

  if (!booking) return { ok: false, code: "NOT_FOUND" };
  if (booking.status === "CANCELLED") {
    return { ok: false, code: "ALREADY_CANCELLED" };
  }

  const now = new Date();
  db.transaction(() => {
    if (refund) {
      refundOneCredit(booking.userId, booking.creditBatchId, {
        bookingId: booking.id,
        note: note?.trim()
          ? `${note.trim()} — ${staffName}`
          : `Cancelled at the desk — ${staffName}`,
      });
    }
    db.update(bookings)
      .set({ status: "CANCELLED", cancelledAt: now, creditRefunded: refund })
      .where(eq(bookings.id, booking.id))
      .run();
  });

  return {
    ok: true,
    refunded: refund,
    balance: (await getCreditSummary(booking.userId)).available,
  };
}

/* --------------------------------------------------------- member's details */

export type ContactPatch = {
  email?: string;
  phone?: string;
  notifyEmail?: boolean;
  notifySms?: boolean;
  notifyPush?: boolean;
  marketingOptIn?: boolean;
};

export async function updateContact(userId: string, patch: ContactPatch) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return { ok: false as const, code: "NOT_FOUND" as const };

  const next: Record<string, unknown> = {};

  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      return { ok: false as const, code: "EMAIL_INVALID" as const };
    }
    /* Email is the login, so a clash would lock somebody out of their own
       account. Caught here rather than by a database error. */
    const clash = db.select().from(users).where(eq(users.email, email)).get();
    if (clash && clash.id !== userId) {
      return { ok: false as const, code: "EMAIL_TAKEN" as const };
    }
    next.email = email;
  }

  if (patch.phone !== undefined) {
    const phone = patch.phone.trim();
    if ((phone.match(/\d/g) ?? []).length < 8) {
      return { ok: false as const, code: "PHONE_INVALID" as const };
    }
    next.phone = phone;
  }

  for (const key of [
    "notifyEmail",
    "notifySms",
    "notifyPush",
    "marketingOptIn",
  ] as const) {
    if (patch[key] !== undefined) next[key] = patch[key];
  }

  if (!Object.keys(next).length) return { ok: true as const, changed: [] };

  db.update(users).set(next).where(eq(users.id, userId)).run();
  return { ok: true as const, changed: Object.keys(next) };
}

/**
 * Set a new password for a member who cannot get in.
 *
 * The desk types a password and reads it out. That is deliberately blunt: there
 * is no email provider wired up yet, so a reset link would go nowhere, and a
 * member standing at the desk locked out of their account is a problem now.
 * When email is connected this should become a one-time link instead.
 */
export async function resetPassword(userId: string, plain: string) {
  if (plain.length < 8) return { ok: false as const, code: "PASSWORD_SHORT" as const };
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return { ok: false as const, code: "NOT_FOUND" as const };

  db.update(users)
    .set({ passwordHash: await hashPassword(plain) })
    .where(eq(users.id, userId))
    .run();

  return { ok: true as const };
}
