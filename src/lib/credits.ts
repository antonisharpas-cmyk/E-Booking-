import { and, asc, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { creditBatches, creditLedger } from "@/db/schema";

export type CreditSummary = {
  available: number;
  batches: {
    id: string;
    creditsRemaining: number;
    creditsTotal: number;
    expiresAt: Date | null;
    source: string;
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
    })),
    nextExpiry,
    nextExpiryCredits,
  };
}

export async function getAvailableCredits(userId: string, now = new Date()) {
  const rows = await liveBatches(userId, now);
  return rows.reduce((n, b) => n + b.creditsRemaining, 0);
}

/**
 * Spend one credit from the batch that expires soonest.
 * Returns the batch id it came from, or null if the member has none.
 * Safe under concurrency: the UPDATE is conditional on creditsRemaining > 0.
 */
export function spendOneCredit(
  userId: string,
  opts: { bookingId?: string; note?: string } = {},
  now = new Date(),
): string | null {
  const batches = db
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
    validityDays && validityDays > 0
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
