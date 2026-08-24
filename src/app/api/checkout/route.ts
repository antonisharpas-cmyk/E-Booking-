import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { getPackageById } from "@/lib/catalogue";
import { grantCredits } from "@/lib/credits";
import {
  getStripe,
  siteUrl,
  stripeConfigured,
  testPaymentsAllowed,
} from "@/lib/stripe";
import { checkoutSchema } from "@/lib/validation";

/**
 * Starts a Stripe Checkout session for a credit pack.
 *
 * Until Stripe keys are added to .env the route falls back to a development
 * grant so the whole credits + booking flow is clickable end to end. The
 * fallback is disabled in production.
 */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const pkg = await getPackageById(parsed.data.packageId);
  if (!pkg || !pkg.active) {
    return NextResponse.json({ error: "PACKAGE_NOT_FOUND" }, { status: 404 });
  }

  const purchase = db
    .insert(purchases)
    .values({
      userId: user.id,
      packageId: pkg.id,
      credits: pkg.credits,
      amountCents: pkg.priceCents,
      status: "PENDING",
      provider: stripeConfigured() ? "stripe" : "manual",
    })
    .returning()
    .get();

  const stripe = getStripe();

  /* ---------- No Stripe keys yet: local test grant ---------- */
  if (!stripe) {
    if (!testPaymentsAllowed()) {
      return NextResponse.json({ error: "PAYMENTS_NOT_CONFIGURED" }, { status: 503 });
    }
    db.update(purchases)
      .set({ status: "PAID", paidAt: new Date() })
      .where(eq(purchases.id, purchase.id))
      .run();

    grantCredits({
      userId: user.id,
      credits: pkg.credits,
      validityDays: pkg.validityDays,
      purchaseId: purchase.id,
      reason: "PURCHASE",
      note: `DEV grant: ${pkg.nameEn}`,
    });

    return NextResponse.json({ devGranted: true, credits: pkg.credits });
  }

  /* ---------- Real Stripe Checkout ---------- */
  let checkout;
  try {
    checkout = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      client_reference_id: purchase.id,
      payment_method_types: ["card"],
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "eur",
            unit_amount: pkg.priceCents,
            product_data: {
              name: `APEX pilates ${pkg.nameEn}`,
              description: `${pkg.credits} class credit${pkg.credits > 1 ? "s" : ""}, valid ${pkg.validityDays} days`,
            },
          },
        },
      ],
      metadata: {
        purchaseId: purchase.id,
        userId: user.id,
        packageId: pkg.id,
        credits: String(pkg.credits),
        validityDays: String(pkg.validityDays),
      },
      success_url: `${siteUrl()}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl()}/checkout/cancelled`,
    });
  } catch (err) {
    console.error("[stripe] could not create checkout session", err);
    db.update(purchases)
      .set({ status: "FAILED" })
      .where(eq(purchases.id, purchase.id))
      .run();
    return NextResponse.json({ error: "PAYMENT_PROVIDER_ERROR" }, { status: 502 });
  }

  db.update(purchases)
    .set({ stripeSession: checkout.id })
    .where(eq(purchases.id, purchase.id))
    .run();

  return NextResponse.json({ url: checkout.url });
}
