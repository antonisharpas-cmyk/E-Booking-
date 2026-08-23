import type { Metadata } from "next";
import { CheckoutResult } from "@/components/marketing/CheckoutResult";
import { currentUser } from "@/lib/auth";
import { getAvailableCredits } from "@/lib/credits";

export const metadata: Metadata = { title: "Payment complete" };
export const dynamic = "force-dynamic";

export default async function CheckoutSuccessPage() {
  const user = await currentUser();
  const credits = user ? await getAvailableCredits(user.id) : 0;
  return <CheckoutResult kind="success" credits={credits} />;
}
