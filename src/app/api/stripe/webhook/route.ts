import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { grantCredits } from "@/lib/credits";
import { getStripe } from "@/lib/stripe";

/**
 * Stripe webhook — the only place credits are granted for a real payment.
 *
 * Local testing:
 *   stripe listen --forward-to localhost:3000/api/stripe/webhook
 * then put the printed whsec_… into STRIPE_WEBHOOK_SECRET.
 *
 * Idempotent: a purchase already marked PAID is ignored, so Stripe's retries
 * can never double-credit an account.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !secret) {
    return NextResponse.json({ error: "STRIPE_NOT_CONFIGURED" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "NO_SIGNATURE" }, { status: 400 });
  }

  const raw = await req.text();

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch (err) {
    console.error("[stripe] signature verification failed", err);
    return NextResponse.json({ error: "BAD_SIGNATURE" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      await fulfil(session);
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object;
      const purchaseId = session.metadata?.purchaseId ?? session.client_reference_id;
      if (purchaseId) {
        db.update(purchases)
          .set({ status: "FAILED" })
          .where(eq(purchases.id, purchaseId))
          .run();
      }
      break;
    }
    case "charge.refunded": {
      const charge = event.data.object;
      const intent =
        typeof charge.payment_intent === "string" ? charge.payment_intent : null;
      if (intent) {
        db.update(purchases)
          .set({ status: "REFUNDED" })
          .where(eq(purchases.stripeIntent, intent))
          .run();
      }
      break;
    }
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

async function fulfil(session: Stripe.Checkout.Session) {
  const purchaseId = session.metadata?.purchaseId ?? session.client_reference_id;
  if (!purchaseId) {
    console.error("[stripe] completed session without purchaseId", session.id);
    return;
  }

  const purchase = db
    .select()
    .from(purchases)
    .where(eq(purchases.id, purchaseId))
    .get();

  if (!purchase) {
    console.error("[stripe] purchase not found", purchaseId);
    return;
  }
  if (purchase.status === "PAID") return; // already fulfilled

  const credits = Number(session.metadata?.credits ?? purchase.credits);
  const validityDays = Number(session.metadata?.validityDays ?? 90);

  db.transaction(() => {
    db.update(purchases)
      .set({
        status: "PAID",
        paidAt: new Date(),
        stripeSession: session.id,
        stripeIntent:
          typeof session.payment_intent === "string" ? session.payment_intent : null,
        amountCents: session.amount_total ?? purchase.amountCents,
      })
      .where(eq(purchases.id, purchase.id))
      .run();

    grantCredits({
      userId: purchase.userId,
      credits,
      validityDays,
      purchaseId: purchase.id,
      reason: "PURCHASE",
      note: `Stripe ${session.id}`,
    });
  });

  console.log(`[stripe] granted ${credits} credits to ${purchase.userId}`);
}
