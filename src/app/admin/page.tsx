import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminBody } from "@/components/admin/AdminBody";
import { currentUser, isStaff } from "@/lib/auth";
import { daySessions, memberList, studioStats } from "@/lib/admin";

export const metadata: Metadata = { title: "Studio admin", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await currentUser();
  if (!user) redirect("/login?next=/admin");
  if (!isStaff(user)) redirect("/account");

  const [stats, today, members] = await Promise.all([
    studioStats(),
    daySessions(new Date()),
    memberList(),
  ]);

  return (
    <AdminBody
      stats={stats}
      today={today.map((s) => ({
        ...s,
        startsAt: s.startsAt.toISOString(),
        endsAt: s.endsAt.toISOString(),
      }))}
      members={members.map((m) => ({
        ...m,
        createdAt: m.createdAt.toISOString(),
      }))}
    />
  );
}
