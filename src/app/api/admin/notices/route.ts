import { NextResponse } from "next/server";
import { body, desk } from "@/lib/api-guard";
import { createNotice, deleteNotice, noticeHistory } from "@/lib/notices";

/** Messages from the studio to every member's account. */
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await desk();
  if ("res" in gate) return gate.res;
  return NextResponse.json({ notices: noticeHistory() });
}

export async function POST(req: Request) {
  const gate = await desk();
  if ("res" in gate) return gate.res;

  const data = await body<{
    titleEn?: string;
    bodyEn?: string;
    titleEl?: string;
    bodyEl?: string;
    important?: boolean;
  }>(req);

  const title = (data?.titleEn ?? "").trim();
  const text = (data?.bodyEn ?? "").trim();

  /* A notice with no words in it would still light up everybody's badge. */
  if (title.length < 3 || text.length < 3) {
    return NextResponse.json({ error: "TOO_SHORT" }, { status: 400 });
  }
  if (title.length > 120 || text.length > 2000) {
    return NextResponse.json({ error: "TOO_LONG" }, { status: 400 });
  }

  const notice = createNotice({
    titleEn: title,
    bodyEn: text,
    titleEl: (data?.titleEl ?? "").trim(),
    bodyEl: (data?.bodyEl ?? "").trim(),
    important: Boolean(data?.important),
    staffId: gate.user.id,
  });

  return NextResponse.json({ ok: true, id: notice.id });
}

export async function DELETE(req: Request) {
  const gate = await desk();
  if ("res" in gate) return gate.res;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  return NextResponse.json({ ok: deleteNotice(id) });
}
