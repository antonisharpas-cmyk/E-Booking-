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
import { hashPassword, isVerified } from "@/lib/auth";
import { toE164 } from "@/lib/messaging/sms";
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
  /** A dummy account the studio keeps for testing. Shown as a badge. */
  isTest: boolean;
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

export const MEMBERS_PER_PAGE = 10;

export type MemberFilter = "all" | "test" | "real";

/**
 * The membership, searched or simply browsed.
 *
 * Paged, because browsing is a real way to use this screen and it used to be
 * impossible: the list was capped at twelve with no way past them, so a studio
 * with a hundred members could only reach somebody by typing their name. Which
 * is fine when you know who you are looking for and useless when you are looking
 * *for* somebody — the member who came in last week, the one whose name you half
 * remember.
 *
 * `filter` separates the studio's dummy accounts from real members. Both
 * directions are useful: "real" to see the actual membership, "test" to find the
 * account you were experimenting with an hour ago.
 */
export async function findMembers(
  query: string,
  {
    limit = MEMBERS_PER_PAGE,
    includeDesk = false,
    filter = "all",
    page = 1,
  }: {
    limit?: number;
    includeDesk?: boolean;
    filter?: MemberFilter;
    page?: number;
  } = {},
) {
  const q = query.trim().toLowerCase();
  const all = db.select().from(users).orderBy(desc(users.createdAt)).all();
  /* The studio's own accounts are not part of the membership as far as the desk
     is concerned. The owner sees them; reception does not. */
  const visible = includeDesk
    ? all
    : all.filter((u) => u.role !== "STAFF" && u.role !== "ADMIN");

  const searched = q
    ? visible.filter(
        (u) =>
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          (u.phone ?? "").replace(/\s/g, "").includes(q.replace(/\s/g, "")),
      )
    : visible;

  /* Counted before the filter is applied, so the three pills can each show how
     many they would find rather than only the one in use. */
  const counts = {
    all: searched.length,
    test: searched.filter((u) => u.isTest).length,
    real: searched.filter((u) => !u.isTest).length,
  };

  const matched =
    filter === "test"
      ? searched.filter((u) => u.isTest)
      : filter === "real"
        ? searched.filter((u) => !u.isTest)
        : searched;

  const perPage = Math.min(Math.max(limit, 1), 100);
  const pages = Math.max(1, Math.ceil(matched.length / perPage));
  /* Somebody on page 6 who then types a search would otherwise be looking at an
     empty page and conclude there were no results. */
  const current = Math.min(Math.max(page, 1), pages);

  const out: MemberSummary[] = [];
  for (const u of matched.slice((current - 1) * perPage, current * perPage)) {
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
      isTest: u.isTest,
    });
  }

  return { rows: out, total: matched.length, page: current, pages, counts };
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
    isTest: user.isTest,
    /* Both shown on the member's card. Unverified explains why somebody cannot
       book despite having sessions, which is otherwise the desk's problem to
       guess at; erased explains why the row has no name on it. */
    emailVerifiedAt: user.emailVerifiedAt,
    erasedAt: user.erasedAt,
    erasedBy: user.erasedBy,
    upcoming,
    payments,
    ledger,
  };
}

/* ------------------------------------------------- sessions sold at the desk */

export type SellResult =
  | { ok: true; credits: number; balance: number }
  | {
      ok: false;
      code: "NOT_FOUND" | "NOTHING_TO_TAKE" | "BAD_AMOUNT" | "EMAIL_UNVERIFIED";
    };

/**
 * Add sessions a member paid for in cash, or take sessions back off them.
 *
 * A cash sale is recorded as a purchase as well as a batch, so it shows up in
 * the member's payment history and in the studio's takings beside the card
 * ones. Removing sessions writes a negative ledger line instead, because there
 * is no such thing as a negative purchase.
 *
 * ---
 *
 * **An unconfirmed account cannot be sold to, and that is deliberate.**
 *
 * The rule the studio set is that nothing happens on an account until its email
 * address has been proved, and "nothing" has to include the desk or it is not a
 * rule. It was not, briefly, and the hole it left was a nasty one: reception
 * takes 110 euro in cash against an account whose address is a typo, and now the
 * studio has a paying customer it cannot send a receipt to, cannot remind about a
 * class, and cannot reach when one moves. The member believes they are a member;
 * the studio believes it has told them things.
 *
 * The remedy is in front of the person who can apply it. Reception is standing
 * with the member: correct the address on this same screen if it is wrong, have
 * them sign in and type the code from their phone, then sell them the pack. It is
 * half a minute, and it is the only half-minute in which anybody will ever have
 * both the member and the right address in the same room.
 *
 * **Taking sessions back is still allowed**, and so is cancelling their classes.
 * The asymmetry is the point: an unconfirmed account can never be *given*
 * anything, and the studio can always correct what an earlier version of this
 * code let through. Blocking a correction would strand exactly the rows that most
 * need fixing.
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

  /* Giving, not taking. See the note above. */
  if (credits > 0 && !isVerified(user)) {
    return { ok: false, code: "EMAIL_UNVERIFIED" };
  }

  const reason = note?.trim()
    ? `${note.trim()}, ${staffName}`
    : `At the desk, ${staffName}`;

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
          ? `${note.trim()}, ${staffName}`
          : `Cancelled at the desk, ${staffName}`,
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
  /** A dummy account for testing. Left out of campaigns unless included. */
  isTest?: boolean;
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
    const digits = (phone.match(/\d/g) ?? []).length;
    if (digits < 8 || digits > 15) {
      return { ok: false as const, code: "PHONE_INVALID" as const };
    }
    /* Same rule as registration, compared the same way: one number, one member.
       Otherwise the desk correcting a typo could quietly create the duplicate
       that registration is careful to refuse. */
    const asked = toE164(phone);
    if (asked) {
      const clash = db
        .select({ id: users.id, phone: users.phone })
        .from(users)
        .all()
        .find((u) => u.id !== userId && toE164(u.phone) === asked);
      if (clash) return { ok: false as const, code: "PHONE_TAKEN" as const };
    }
    next.phone = phone;
  }

  for (const key of [
    "notifyEmail",
    "notifySms",
    "notifyPush",
    "marketingOptIn",
    "isTest",
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
