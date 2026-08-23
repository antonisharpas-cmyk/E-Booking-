import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountBody } from "@/components/account/AccountBody";
import { currentUser } from "@/lib/auth";
import { listMyBookings } from "@/lib/booking";
import { getCreditSummary, getLedger } from "@/lib/credits";
import { getMyPurchases } from "@/lib/purchases";

export const metadata: Metadata = { title: "My account" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/account");

  const [wallet, bookings, purchases, ledger] = await Promise.all([
    getCreditSummary(user.id),
    listMyBookings(user.id),
    getMyPurchases(user.id),
    getLedger(user.id, 25),
  ]);

  const taken = bookings.past.filter(
    (b) => b.status === "ATTENDED" || b.status === "CONFIRMED",
  ).length;

  return (
    <AccountBody
      user={{
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        createdAt: user.createdAt.toISOString(),
      }}
      wallet={{
        available: wallet.available,
        nextExpiry: wallet.nextExpiry?.toISOString() ?? null,
        nextExpiryCredits: wallet.nextExpiryCredits,
        batches: wallet.batches.map((b) => ({
          id: b.id,
          creditsRemaining: b.creditsRemaining,
          creditsTotal: b.creditsTotal,
          expiresAt: b.expiresAt?.toISOString() ?? null,
          source: b.source,
        })),
      }}
      classesTaken={taken}
      upcoming={bookings.upcoming.map(serialiseBooking)}
      past={bookings.past.slice(0, 20).map(serialiseBooking)}
      purchases={purchases.map((p) => ({
        ...p,
        createdAt: p.createdAt.toISOString(),
        paidAt: p.paidAt?.toISOString() ?? null,
      }))}
      ledger={ledger.map((l) => ({
        id: l.id,
        delta: l.delta,
        reason: l.reason,
        note: l.note,
        createdAt: l.createdAt.toISOString(),
      }))}
    />
  );
}

function serialiseBooking(b: {
  id: string;
  status: string;
  creditRefunded: boolean;
  startsAt: Date;
  endsAt: Date;
  className: { en: string; el: string };
  instructor: string | null;
  freeCancellationUntil: Date;
}) {
  return {
    id: b.id,
    status: b.status,
    creditRefunded: b.creditRefunded,
    startsAt: b.startsAt.toISOString(),
    endsAt: b.endsAt.toISOString(),
    className: b.className,
    instructor: b.instructor,
    freeCancellationUntil: b.freeCancellationUntil.toISOString(),
  };
}
