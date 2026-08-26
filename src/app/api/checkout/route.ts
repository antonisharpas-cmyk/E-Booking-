import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { purchases } from "@/db/schema";
import { currentUser } from "@/lib/auth";
import { getPackageById, getPackageBySlug } from "@/lib/catalogue";
import { activeProvider } from "@/lib/payments";
import { siteUrl } from "@/lib/stripe";
import { checkoutSchema } from "@/lib/validation";

/**
 * Opens a payment for one pack.
 *
 * The order of events matters. The purchase row is written *before* the
 * provider is called, with status PENDING, because its id is the reference the
 * provider carries and hands back. A payment we cannot match to a purchase is
 * a member charged with nothing to show for it, which is the one outcome this
 * whole design exists to prevent.
 *
 * Nothing here grants sessions. That happens once, in fulfilPurchase, after the
 * provider confirms — see src/lib/payments/fulfil.ts.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const parsed = checkoutSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }

  const pkg = parsed.data.packageId
    ? await getPackageById(parsed.data.packageId)
    : await getPackageBySlug(parsed.data.packSlug!);
  if (!pkg || !pkg.active) {
    return NextResponse.json({ error: "PACKAGE_NOT_FOUND" }, { status: 404 });
  }

  let provider;
  try {
    provider = activeProvider();
  } catch (err) {
    console.error("[pay] no usable provider", err);
    return NextResponse.json(
      { error: "PAYMENTS_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  const purchase = db
    .insert(purchases)
    .values({
      userId: user.id,
      packageId: pkg.id,
      credits: pkg.credits,
      amountCents: pkg.priceCents,
      currency: "eur",
      status: "PENDING",
      provider: provider.id,
    })
    .returning()
    .get();

  try {
    const started = await provider.start({
      purchaseId: purchase.id,
      userId: user.id,
      email: user.email,
      name: user.name,
      packName: pkg.nameEn,
      credits: pkg.credits,
      validityDays: pkg.validityDays,
      amountCents: pkg.priceCents,
      currency: "eur",
      /* Both come back to our own pages, and both carry the purchase id so the
         result can be checked with the provider rather than trusted. */
      returnUrl: `${siteUrl()}/checkout/success?p=${purchase.id}`,
      cancelUrl: `${siteUrl()}/checkout/cancelled?p=${purchase.id}`,
    });

    if (started.mode === "fields") {
      db.update(purchases)
        .set({
          providerRef: started.ref,
          stripeIntent: started.provider === "stripe" ? started.ref : null,
        })
        .where(eq(purchases.id, purchase.id))
        .run();
    }

    return NextResponse.json({ purchaseId: purchase.id, ...started });
  } catch (err) {
    console.error("[pay] could not open a payment", err);
    db.update(purchases)
      .set({ status: "FAILED" })
      .where(eq(purchases.id, purchase.id))
      .run();
    return NextResponse.json(
      { error: "PAYMENT_PROVIDER_ERROR" },
      { status: 502 },
    );
  }
}
