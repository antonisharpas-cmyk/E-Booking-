import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditBatches, purchases } from "@/db/schema";
import { grantCredits } from "@/lib/credits";
import { getPackageById } from "@/lib/catalogue";
import { notifyPurchased } from "@/lib/messaging/events";

/**
 * The one place a payment turns into sessions.
 *
 * Three different things can report the same successful payment: the provider's
 * webhook, the member's browser coming back from the card form, and a later
 * check from the account page. Each of them calls this, and it must be safe to
 * call twice a second apart from two different requests.
 *
 * How it is made safe: the purchase row is the lock. The status moves
 * PENDING -> PAID inside a transaction, and the update is conditional on the
 * row still being PENDING, so whichever caller gets there first is the one that
 * grants the batch. The others see zero rows changed and do nothing.
 *
 * (SQLite through better-sqlite3 is synchronous and single-writer, which makes
 * this airtight here. The conditional update is what carries the guarantee, so
 * it stays correct on a server with real concurrency too.)
 */
export type FulfilResult = {
  /** True only for the caller that actually granted the sessions. */
  granted: boolean;
  credits: number;
  /** The purchase as it stands after the call. */
  status: string;
};

export async function fulfilPurchase(args: {
  purchaseId: string;
  /** The provider's own reference, for the receipt trail. */
  ref?: string | null;
  /** What the provider says was taken, if it says. */
  amountCents?: number | null;
  note?: string;
}): Promise<FulfilResult> {
  const { purchaseId, ref = null, amountCents = null, note } = args;

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .get();

  if (!purchase) {
    console.error(`[pay] fulfil called for a purchase that is not there: ${purchaseId}`);
    return { granted: false, credits: 0, status: "MISSING" };
  }

  if (purchase.status === "PAID") {
    /* Already done. Record the reference if this caller knows it and the
       earlier one did not — a webhook often carries more than the browser. */
    if (ref && !purchase.providerRef) {
      db.update(purchases)
        .set({ providerRef: ref })
        .where(eq(purchases.id, purchase.id))
        .run();
    }
    return { granted: false, credits: purchase.credits, status: "PAID" };
  }

  /* Validity comes from the pack as it was sold. Falling back to 90 days would
     silently shorten or lengthen what the member paid for, so if the pack has
     gone from the catalogue since, the purchase row is still the record of what
     was bought and the batch is granted without an expiry rather than with a
     guessed one. */
  const pkg = purchase.packageId ? await getPackageById(purchase.packageId) : null;
  const validityDays = pkg?.validityDays ?? null;

  let granted = false;

  db.transaction(() => {
    /* The guard, and the whole reason this is safe to call twice: the update
       only matches a row that is *still* PENDING, and RETURNING tells us
       whether this call is the one that claimed it. A second caller matches
       nothing and grants nothing. */
    const claimed = db
      .update(purchases)
      .set({
        status: "PAID",
        paidAt: new Date(),
        providerRef: ref ?? purchase.providerRef,
        amountCents: amountCents ?? purchase.amountCents,
      })
      .where(
        and(eq(purchases.id, purchase.id), eq(purchases.status, "PENDING")),
      )
      .returning({ id: purchases.id })
      .all();

    if (!claimed.length) return;

    /* Belt as well as braces: if a batch is somehow already attached to this
       purchase, granting a second one would double the member's balance. */
    const already = db
      .select({ id: creditBatches.id })
      .from(creditBatches)
      .where(eq(creditBatches.purchaseId, purchase.id))
      .all();
    if (already.length) {
      console.error(
        `[pay] purchase ${purchase.id} was PENDING but already had a credit batch — not granting again`,
      );
      return;
    }

    grantCredits({
      userId: purchase.userId,
      credits: purchase.credits,
      validityDays,
      purchaseId: purchase.id,
      reason: "PURCHASE",
      note: note ?? `${purchase.provider} ${ref ?? purchase.id}`,
    });
    granted = true;
  });

  if (granted) {
    console.log(
      `[pay] ${purchase.credits} sessions granted to ${purchase.userId} for purchase ${purchase.id}`,
    );
    /* Told once, by whichever caller actually granted. The webhook, the browser
       coming back and a later check all arrive here; only one of them gets
       `granted`, which is exactly the one that should say so. Not awaited: the
       sessions are already in the balance, and a message that fails to send must
       not turn a completed payment into an error. */
    void notifyPurchased(purchase.id).catch(() => {});
  }

  return { granted, credits: purchase.credits, status: "PAID" };
}

/** Marks a payment that did not go through. Never touches a paid purchase. */
export function failPurchase(purchaseId: string, reason?: string) {
  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .get();
  if (!purchase || purchase.status === "PAID") return;
  db.update(purchases)
    .set({ status: "FAILED" })
    .where(eq(purchases.id, purchaseId))
    .run();
  if (reason) console.log(`[pay] purchase ${purchaseId} failed: ${reason}`);
}
