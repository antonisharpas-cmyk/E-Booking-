import type { Metadata } from "next";
import { PricingPageBody } from "@/components/marketing/PricingPageBody";
import { readSession } from "@/lib/auth";
import { getPackages } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Reformer Pilates credit packs at APEX pilates. One credit = one class. From a single class to 20-class packs, no contracts.",
};

export const dynamic = "force-dynamic";

export default async function PricingPage() {
  const [packages, session] = await Promise.all([getPackages(), readSession()]);

  return <PricingPageBody packages={packages} signedIn={Boolean(session)} />;
}
