import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditBatches, creditLedger } from "@/db/schema";
import { windowAllows } from "./promo";

export type CreditSummary = {
  available: number;
  batches: {
    id: string;
    creditsRemaining: number;
    creditsTotal: number;
    expiresAt: Date | null;
    source: string;
    /** Set when these sessions may only be spent on classes in a date range. */
    usableFrom: Date | null;
    usableTo: Date | null;
  }[];
  /** Soonest expiry among batches that still hold credits */
  nextExpiry: Date | null;
  nextExpiryCredits: number;
};

/** Batches that still hold credits and have not expired, soonest expiry first. */
export async function liveBatches(userId: string, now = new Date()) {
  return db
    .select()
    .from(creditBatches)
    .where(
      and(
        eq(creditBatches.userId, userId),
        gt(creditBatches.creditsRemaining, 0),
        or(isNull(creditBatches.expiresAt), gt(creditBatches.expiresAt, now)),
      ),
    )
    .orderBy(asc(creditBatches.expiresAt), asc(creditBatches.createdAt));
}

export async function getCreditSummary(
  userId: string,
  now = new Date(),
): Promise<CreditSummary> {
  const batches = await liveBatches(userId, now);
  const available = batches.reduce((n, b) => n + b.creditsRemaining, 0);
  const withExpiry = batches.filter((b) => b.expiresAt);
  const nextExpiry = withExpiry[0]?.expiresAt ?? null;
  const nextExpiryCredits = nextExpiry
    ? batches
        .filter((b) => b.expiresAt?.getTime() === nextExpiry.getTime())
        .reduce((n, b) => n + b.creditsRemaining, 0)
    : 0;

  return {
    available,
    batches: batches.map((b) => ({
      id: b.id,
      creditsRemaining: b.creditsRemaining,
      creditsTotal: b.creditsTotal,
      expiresAt: b.expiresAt,
      source: b.source,
      usableFrom: b.usableFrom,
      usableTo: b.usableTo,
    })),
    nextExpiry,
    nextExpiryCredits,
  };
}

/**
 * Does this member hold anything at all, window or no window?
 *
 * Used only to tell two failures apart: "you have no sessions" and "you have
 * sessions that cannot pay for *this* class". Those need different words on
 * screen, and a member with a visible balance of 1 being told they have none is
 * how a site loses somebody's trust in one sentence.
 */
export function spendableAnywhere(userId: string, now = new Date()) {
  return (
    db
      .select()
      .from(creditBatches)
      .where(
        and(
          eq(creditBatches.userId, userId),
          gt(creditBatches.creditsRemaining, 0),
          or(isNull(creditBatches.expiresAt), gt(creditBatches.expiresAt, now)),
        ),
      )
      .all().length > 0
  );
}

export async function getAvailableCredits(userId: string, now = new Date()) {
  const rows = await liveBatches(userId, now);
  return rows.reduce((n, b) => n + b.creditsRemaining, 0);
}

/**
 * Spend one credit on one class.
 *
 * From the batch that expires soonest **among those allowed to pay for a class
 * on that date**. The second half is not a detail: a free opening-week session
 * carries a spend window, and without checking it here the member would book a
 * class in November, silently burn the free session, and then find they had
 * nothing left for the week the offer was for. Nobody would have seen an error;
 * they would simply have been robbed by a sort order.
 *
 * `classStartsAt` is optional so that callers with nothing to do with the
 * timetable — an adjustment at the desk, a test — keep working. Omitting it
 * means "any batch will do", which is the old behaviour.
 *
 * Returns the batch id it came from, or null if the member has nothing that can
 * pay for this class. Safe under concurrency: the UPDATE is conditional on
 * creditsRemaining > 0.
 */
export function spendOneCredit(
  userId: string,
  opts: { bookingId?: string; note?: string; classStartsAt?: Date } = {},
  now = new Date(),
): string | null {
  const all = db
    .select()
    .from(creditBatches)
    .where(
      and(
        eq(creditBatches.userId, userId),
        gt(creditBatches.creditsRemaining, 0),
        or(isNull(creditBatches.expiresAt), gt(creditBatches.expiresAt, now)),
      ),
    )
    .orderBy(asc(creditBatches.expiresAt), asc(creditBatches.createdAt))
    .all();

  const batches = opts.classStartsAt
    ? all.filter((b) => windowAllows(b, opts.classStartsAt!))
    : all;

  for (const batch of batches) {
    const res = db
      .update(creditBatches)
      .set({ creditsRemaining: sql`${creditBatches.creditsRemaining} - 1` })
      .where(
        and(eq(creditBatches.id, batch.id), gt(creditBatches.creditsRemaining, 0)),
      )
      .run();

    if (res.changes > 0) {
      db.insert(creditLedger)
        .values({
          userId,
          delta: -1,
          reason: "BOOKING",
          note: opts.note,
          batchId: batch.id,
          bookingId: opts.bookingId,
        })
        .run();
      return batch.id;
    }
  }
  return null;
}

/** Return one credit to the batch it was taken from (used on free cancellation). */
export function refundOneCredit(
  userId: string,
  batchId: string | null,
  opts: { bookingId?: string; note?: string } = {},
) {
  if (batchId) {
    const res = db
      .update(creditBatches)
      .set({
        creditsRemaining: sql`min(${creditBatches.creditsRemaining} + 1, ${creditBatches.creditsTotal})`,
      })
      .where(eq(creditBatches.id, batchId))
      .run();
    if (res.changes > 0) {
      db.insert(creditLedger)
        .values({
          userId,
          delta: 1,
          reason: "CANCELLATION_REFUND",
          note: opts.note,
          batchId,
          bookingId: opts.bookingId,
        })
        .run();
      return true;
    }
  }

  /* Batch is gone (or expired away) — issue a compensation credit instead. */
  const batch = db
    .insert(creditBatches)
    .values({
      userId,
      creditsTotal: 1,
      creditsRemaining: 1,
      source: "COMPENSATION",
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    })
    .returning()
    .get();

  db.insert(creditLedger)
    .values({
      userId,
      delta: 1,
      reason: "CANCELLATION_REFUND",
      note: opts.note ?? "Original credit batch unavailable",
      batchId: batch.id,
      bookingId: opts.bookingId,
    })
    .run();
  return true;
}

/** Grant credits: used by the Stripe webhook and by admin adjustments. */
export function grantCredits(args: {
  userId: string;
  credits: number;
  validityDays: number | null;
  source?: "PURCHASE" | "GRANT" | "COMPENSATION";
  purchaseId?: string;
  reason?: string;
  note?: string;
  /** An exact expiry, when it is a date rather than a number of days. */
  expiresAt?: Date | null;
  /**
   * Which class dates these sessions may be spent on. Both null — the normal
   * case — means any class. See lib/promo.ts for why this is separate from
   * expiry.
   */
  usableFrom?: Date | null;
  usableTo?: Date | null;
}) {
  const {
    userId,
    credits,
    validityDays,
    source = "PURCHASE",
    purchaseId,
    reason = "PURCHASE",
    note,
  } = args;

  const expiresAt =
    args.expiresAt !== undefined
      ? args.expiresAt
      : validityDays && validityDays > 0
        ? new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000)
        : null;

  const batch = db
    .insert(creditBatches)
    .values({
      userId,
      purchaseId,
      creditsTotal: credits,
      creditsRemaining: credits,
      source,
      expiresAt,
      usableFrom: args.usableFrom ?? null,
      usableTo: args.usableTo ?? null,
    })
    .returning()
    .get();

  db.insert(creditLedger)
    .values({
      userId,
      delta: credits,
      reason,
      note,
      batchId: batch.id,
      purchaseId,
    })
    .run();

  return batch;
}

export async function getLedger(userId: string, limit = 40) {
  return db
    .select()
    .from(creditLedger)
    .where(eq(creditLedger.userId, userId))
    .orderBy(desc(creditLedger.createdAt))
    .limit(limit);
}
