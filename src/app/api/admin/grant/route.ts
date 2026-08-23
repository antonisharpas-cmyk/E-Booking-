import { and, asc, eq, gt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { creditBatches, creditLedger } from "@/db/schema";
import { AuthError, requireStaff } from "@/lib/auth";
import { getAvailableCredits, grantCredits } from "@/lib/credits";
import { grantSchema } from "@/lib/validation";

/**
 * Manual credit adjustment by studio staff.
 * Positive values create a new batch; negative values take credits away from
 * the batches expiring soonest. Every change is written to the ledger.
 */
export async function POST(req: Request) {
  let staff;
  try {
    staff = await requireStaff();
  } catch (e) {
    const status = e instanceof AuthError && e.code === "FORBIDDEN" ? 403 : 401;
    return NextResponse.json({ error: "NOT_ALLOWED" }, { status });
  }

  const parsed = grantSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  }
  const { userId, credits, validityDays, note } = parsed.data;
  if (credits === 0) {
    return NextResponse.json({ error: "ZERO" }, { status: 400 });
  }

  if (credits > 0) {
    grantCredits({
      userId,
      credits,
      validityDays: validityDays ?? 90,
      source: "GRANT",
      reason: "ADMIN_GRANT",
      note: note ? `${note} (by ${staff.name})` : `Granted by ${staff.name}`,
    });
  } else {
    let toRemove = Math.abs(credits);
    const batches = db
      .select()
      .from(creditBatches)
      .where(
        and(eq(creditBatches.userId, userId), gt(creditBatches.creditsRemaining, 0)),
      )
      .orderBy(asc(creditBatches.expiresAt))
      .all();

    db.transaction(() => {
      for (const b of batches) {
        if (toRemove <= 0) break;
        const take = Math.min(b.creditsRemaining, toRemove);
        db.update(creditBatches)
          .set({ creditsRemaining: sql`${creditBatches.creditsRemaining} - ${take}` })
          .where(eq(creditBatches.id, b.id))
          .run();
        db.insert(creditLedger)
          .values({
            userId,
            delta: -take,
            reason: "ADMIN_GRANT",
            note: note ? `${note} (by ${staff.name})` : `Removed by ${staff.name}`,
            batchId: b.id,
          })
          .run();
        toRemove -= take;
      }
    });
  }

  return NextResponse.json({
    ok: true,
    credits: await getAvailableCredits(userId),
  });
}
