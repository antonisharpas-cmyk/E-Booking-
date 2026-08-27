import { NextResponse } from "next/server";
import { body, desk } from "@/lib/api-guard";
import {
  deliverNotice,
  reachOf,
  transportStatus,
  type Audience,
} from "@/lib/messaging/deliver";
import { pushReady } from "@/lib/messaging/push";
import { CHANNELS, type Channel } from "@/lib/messaging/types";
import { createNotice, deleteNotice, noticeHistory } from "@/lib/notices";

/**
 * Messages from the studio to its members.
 *
 * Every notice lands in the member's account whatever else happens — that part
 * is not optional and not a channel. Push, email and SMS are then chosen at the
 * desk, and each one is filtered again by what the member agreed to.
 *
 * The audience is the important guard: OFFERS never reaches somebody who did not
 * tick offers, however the request is put together. That is checked here rather
 * than in the screen, because a screen is a suggestion.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const gate = await desk();
  if ("res" in gate) return gate.res;

  /* The desk asks before writing: how many people would each channel reach if
     I sent this now. Sending blind to four hundred people is how a studio
     discovers its SMS bill after the fact. */
  const audience: Audience =
    new URL(req.url).searchParams.get("audience") === "OFFERS" ? "OFFERS" : "ALL";

  return NextResponse.json({
    notices: noticeHistory(),
    reach: reachOf(audience),
    transports: { ...transportStatus(), push: { name: "Web push", ready: pushReady() } },
  });
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
    audience?: string;
    channels?: string[];
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

  const audience: Audience = data?.audience === "OFFERS" ? "OFFERS" : "ALL";
  const channels = (data?.channels ?? []).filter((c): c is Channel =>
    CHANNELS.includes(c as Channel),
  );

  const notice = createNotice({
    titleEn: title,
    bodyEn: text,
    titleEl: (data?.titleEl ?? "").trim(),
    bodyEl: (data?.bodyEl ?? "").trim(),
    important: Boolean(data?.important),
    audience,
    channels,
    staffId: gate.user.id,
  });

  /* The notice exists now. If a channel fails after this point the message is
     still in every member's account, which is the outcome that matters. */
  const reports = channels.length
    ? await deliverNotice({
        noticeId: notice.id,
        audience,
        channels,
        en: {
          subject: title,
          body: text,
          url: "/account?tab=notifications",
        },
        el:
          data?.titleEl && data?.bodyEl
            ? { subject: data.titleEl.trim(), body: data.bodyEl.trim() }
            : undefined,
      })
    : [];

  return NextResponse.json({ ok: true, id: notice.id, audience, reports });
}

export async function DELETE(req: Request) {
  const gate = await desk();
  if ("res" in gate) return gate.res;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });
  return NextResponse.json({ ok: deleteNotice(id) });
}
