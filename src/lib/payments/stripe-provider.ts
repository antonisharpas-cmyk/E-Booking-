import type {
  PaymentProvider,
  PaymentRequest,
  PurchaseLike,
  Settlement,
  StartedPayment,
} from "./types";
import { getStripe, stripeConfigured } from "@/lib/stripe";

/**
 * Stripe, with the card fields inside our own page.
 *
 * This is a Payment Intent rather than a Checkout Session, and the difference
 * is the whole point: a Checkout Session sends the member to a page at
 * stripe.com, while an intent hands back a one-time secret that the Payment
 * Element uses to talk to Stripe directly from the browser. The card number
 * never touches this server, so the studio stays out of PCI scope, and the
 * member never leaves apexpilates.
 *
 * The one exception is 3-D Secure. When the bank wants the member to confirm,
 * Stripe takes over the screen for a moment and then returns to `returnUrl`.
 * That is the bank's requirement, not a design choice, and it is the same for
 * every provider.
 */
export const stripeProvider: PaymentProvider = {
  id: "stripe",
  label: "Stripe",

  configured: () => stripeConfigured() && Boolean(publishableKey()),

  async start(req: PaymentRequest): Promise<StartedPayment> {
    const stripe = getStripe();
    if (!stripe) throw new Error("STRIPE_NOT_CONFIGURED");

    const intent = await stripe.paymentIntents.create({
      amount: req.amountCents,
      currency: req.currency,
      /* Lets the studio turn on Apple Pay, Google Pay, Link or Bancontact from
         the Stripe dashboard without a code change: whatever is enabled and
         applicable shows up in the same Element. */
      automatic_payment_methods: { enabled: true },
      receipt_email: req.email,
      description: `APEX pilates — ${req.packName}`,
      statement_descriptor_suffix: "APEX PILATES",
      metadata: {
        purchaseId: req.purchaseId,
        userId: req.userId,
        credits: String(req.credits),
        validityDays: String(req.validityDays),
        packName: req.packName,
      },
    });

    if (!intent.client_secret) throw new Error("STRIPE_NO_CLIENT_SECRET");

    return {
      mode: "fields",
      provider: "stripe",
      clientSecret: intent.client_secret,
      publicKey: publishableKey()!,
      ref: intent.id,
    };
  },

  async settle(purchase: PurchaseLike): Promise<Settlement> {
    const stripe = getStripe();
    const ref = purchase.providerRef ?? purchase.stripeIntent;
    if (!stripe || !ref) return { status: "PENDING", ref: ref ?? null };

    const intent = await stripe.paymentIntents.retrieve(ref);

    switch (intent.status) {
      case "succeeded":
        return {
          status: "PAID",
          ref: intent.id,
          amountCents: intent.amount_received || intent.amount,
        };
      /* Taken but not settled yet. Some methods sit here for hours, so the
         sessions are not granted until Stripe says succeeded. */
      case "processing":
      case "requires_capture":
      case "requires_action":
      case "requires_confirmation":
      case "requires_payment_method":
        return { status: "PENDING", ref: intent.id };
      case "canceled":
        return {
          status: "FAILED",
          ref: intent.id,
          reason: intent.cancellation_reason ?? "canceled",
        };
      default:
        return { status: "PENDING", ref: intent.id };
    }
  },
};

/** Safe in the browser; it is meant to be published. */
function publishableKey() {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
  return key && key.startsWith("pk_") && !/x{3,}/i.test(key) ? key : null;
}
