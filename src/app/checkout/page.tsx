import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CheckoutBody } from "@/components/checkout/CheckoutBody";
import { currentUser } from "@/lib/auth";
import { getPackageBySlug } from "@/lib/catalogue";
import { getCreditSummary } from "@/lib/credits";
import { paymentModeSummary } from "@/lib/payments";

export const metadata: Metadata = {
  title: "Checkout",
  /* A payment page has no business in anybody's search results. */
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ pack?: string }>;
}) {
  const { pack } = await searchParams;
  if (!pack) redirect("/pricing");

  const user = await currentUser();
  /* Straight back here once they are in, with the pack still chosen. */
  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/checkout?pack=${pack}`)}`);
  }

  const pkg = await getPackageBySlug(pack);
  if (!pkg || !pkg.active) redirect("/pricing");

  const wallet = await getCreditSummary(user.id);
  const payment = paymentModeSummary();

  return (
    <CheckoutBody
      pack={{
        id: pkg.id,
        slug: pkg.slug,
        nameEn: pkg.nameEn,
        nameEl: pkg.nameEl,
        credits: pkg.credits,
        priceCents: pkg.priceCents,
        validityDays: pkg.validityDays,
      }}
      member={{ name: user.name, email: user.email }}
      balance={wallet.available}
      payment={payment}
    />
  );
}
