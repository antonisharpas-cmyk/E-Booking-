import type { Metadata } from "next";
import { AdminBody } from "@/components/admin/AdminBody";
import { DeskLock } from "@/components/admin/DeskLock";
import { currentUser, deskUnlocked, isOwner, isStaff } from "@/lib/auth";
import { studioStats, upcomingClassCount } from "@/lib/admin";
import { getPackages } from "@/lib/catalogue";

export const metadata: Metadata = {
  title: "Reception",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

/**
 * The desk console.
 *
 * /admin is a door of its own. Nobody is bounced to the member sign-in page and
 * back: whoever arrives is asked for a staff email and password right here, and
 * that one form both signs them in and unlocks the desk. Staff already signed
 * in whose 45-minute unlock has lapsed are asked for the password alone.
 *
 * Until the door is open this page loads *nothing* — no member list, no
 * takings, no phone numbers. That is the point: a locked console that has
 * already fetched the data it is protecting is not locked, it is decorated.
 * A visitor who is signed in as a member sees the same sign-in form as a
 * stranger, so the page never confirms who does or does not work here.
 */
export default async function AdminPage() {
  const user = await currentUser();
  const staff = user && isStaff(user);

  if (!staff) return <DeskLock />;
  if (!(await deskUnlocked(user.id))) return <DeskLock name={user.name} />;

  /* Reception's console never fetches the takings. The Analytics tab is not
     merely hidden from them — the query does not run, and /api/admin/stats
     refuses them — so there is nothing on the machine to find. */
  const owner = isOwner(user);
  const [stats, packs] = await Promise.all([
    owner ? studioStats() : Promise.resolve(null),
    getPackages(),
  ]);

  return (
    <AdminBody
      staffName={user.name}
      owner={owner}
      scheduled={upcomingClassCount()}
      stats={stats}
      packs={packs.map((p) => ({
        id: p.id,
        slug: p.slug,
        nameEn: p.nameEn,
        credits: p.credits,
        priceCents: p.priceCents,
        listPriceCents: p.listPriceCents,
        discountLabelEn: p.discountLabelEn,
      }))}
    />
  );
}
