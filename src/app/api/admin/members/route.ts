import { NextResponse } from "next/server";
import { desk } from "@/lib/api-guard";
import { isOwner } from "@/lib/auth";
import { findMembers, isDeskAccount, memberDetail } from "@/lib/reception";

/**
 * Search the membership, or read one member in full with ?id=.
 *
 * The studio's own accounts are not part of the membership as far as reception
 * is concerned: they are left out of the search, and asked for by id they come
 * back as not found. The owner sees them.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await desk();
  if ("res" in gate) return gate.res;

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const canSeeDesk = isOwner(gate.user);

  if (id) {
    /* Not FORBIDDEN: a 403 here would tell reception that the account exists
       and is a colleague's. It is simply not in the membership they can see. */
    if (!canSeeDesk && isDeskAccount(id)) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const detail = await memberDetail(id);
    if (!detail) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    return NextResponse.json({ member: detail });
  }

  const asked = url.searchParams.get("filter");
  const filter =
    asked === "test" || asked === "real" ? asked : ("all" as const);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? 1) || 1);

  const found = await findMembers(url.searchParams.get("q") ?? "", {
    includeDesk: canSeeDesk,
    filter,
    page,
  });

  return NextResponse.json({
    /* `members` is the rows, as it always was, with the paging alongside. */
    members: found.rows,
    total: found.total,
    page: found.page,
    pages: found.pages,
    counts: found.counts,
    filter,
  });
}
