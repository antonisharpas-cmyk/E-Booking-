import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { creditPackages, purchases } from "@/db/schema";

export async function getMyPurchases(userId: string, limit = 20) {
  const rows = await db
    .select({ p: purchases, pkg: creditPackages })
    .from(purchases)
    .leftJoin(creditPackages, eq(purchases.packageId, creditPackages.id))
    .where(eq(purchases.userId, userId))
    .orderBy(desc(purchases.createdAt))
    .limit(limit);

  return rows.map(({ p, pkg }) => ({
    id: p.id,
    credits: p.credits,
    amountCents: p.amountCents,
    status: p.status,
    provider: p.provider,
    createdAt: p.createdAt,
    paidAt: p.paidAt,
    packageName: pkg ? { en: pkg.nameEn, el: pkg.nameEl } : null,
  }));
}
