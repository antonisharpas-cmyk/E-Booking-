import { hostedProvider } from "./hosted-provider";
import { stripeProvider } from "./stripe-provider";
import { testProvider } from "./test-provider";
import type { PaymentProvider, ProviderId } from "./types";

export * from "./types";
export { fulfilPurchase, failPurchase } from "./fulfil";
export { verifyHostedReturn, hostedConfig } from "./hosted-provider";

const ALL: Record<ProviderId, PaymentProvider> = {
  stripe: stripeProvider,
  hosted: hostedProvider,
  test: testProvider,
};

/**
 * Which provider is taking payments right now.
 *
 * PAYMENT_PROVIDER in .env names one outright, which is what production should
 * do — being explicit means a missing key shows up as a loud error rather than
 * as a live site quietly handing out free sessions through the test adapter.
 *
 * Left unset it picks the first one that is actually configured, so a developer
 * cloning the repo gets a working checkout with no setup at all.
 */
export function activeProvider(): PaymentProvider {
  const named = process.env.PAYMENT_PROVIDER?.trim().toLowerCase();

  if (named && named in ALL) {
    const chosen = ALL[named as ProviderId];
    if (!chosen.configured()) {
      throw new Error(
        `PAYMENT_PROVIDER is set to "${named}" but that provider is not configured. Check .env against docs/payments.md.`,
      );
    }
    return chosen;
  }

  for (const p of [stripeProvider, hostedProvider, testProvider]) {
    if (p.configured()) return p;
  }

  /* Not even the test provider, which means this is production with nothing
     set up. The checkout route turns this into a plain "not switched on yet"
     message rather than an error page. */
  throw new Error("PAYMENTS_NOT_CONFIGURED");
}

/** For the interface: what to tell the member before they commit. */
export function paymentModeSummary() {
  try {
    const p = activeProvider();
    return { id: p.id, label: p.label, configured: true };
  } catch {
    return { id: null, label: null, configured: false };
  }
}
