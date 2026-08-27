"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

/**
 * Writing to every member at once.
 *
 * The message always lands in each member's account, with a count on their
 * photograph until they open it. Beyond that the desk chooses who it goes to
 * and how it travels — push, email, SMS — and each channel says on the button
 * how many people it will actually reach before anything is sent. A channel
 * with no provider connected says so rather than silently doing nothing: a
 * receptionist who believes a text went out will not pick up the phone.
 */

type Delivery = {
  channel: string;
  sent: number;
  failed: number;
  skipped: number;
  detail: string;
};

type Sent = {
  id: string;
  titleEn: string;
  bodyEn: string;
  important: boolean;
  audience: string;
  channels: string;
  createdAt: string;
  author: string | null;
  reads: number;
  members: number;
  deliveries: Delivery[];
};

type Reach = { people: number; push: number; email: number; sms: number };
type Transports = Record<string, { name: string; ready: boolean }>;
type Channel = "push" | "email" | "sms";

export function NoticePanel({ onNotice }: { onNotice: (s: string) => void }) {
  const { t, fmtFullDate } = useI18n();
  const d = t.desk;

  const [history, setHistory] = useState<Sent[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [titleEl, setTitleEl] = useState("");
  const [textEl, setTextEl] = useState("");
  const [important, setImportant] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [audience, setAudience] = useState<"ALL" | "OFFERS">("ALL");
  /* Push starts ticked, because it is the channel the studio wants used and the
     one that costs nothing. Email and SMS are deliberate choices. */
  const [channels, setChannels] = useState<Channel[]>(["push"]);
  const [reach, setReach] = useState<Reach | null>(null);
  const [transports, setTransports] = useState<Transports>({});

  const load = useCallback(async (which: "ALL" | "OFFERS") => {
    const res = await fetch(`/api/admin/notices?audience=${which}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      notices: Sent[];
      reach: Reach;
      transports: Transports;
    };
    setHistory(data.notices ?? []);
    setReach(data.reach ?? null);
    setTransports(data.transports ?? {});
  }, []);

  useEffect(() => {
    void load(audience);
  }, [load, audience]);

  const toggle = (c: Channel) =>
    setChannels((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));

  async function send() {
    setBusy("send");
    try {
      const res = await fetch("/api/admin/notices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          titleEn: title,
          bodyEn: text,
          titleEl,
          bodyEl: textEl,
          important,
          audience,
          channels,
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        reports?: { channel: string; sent: number; failed: number }[];
      };
      if (data.error) {
        onNotice(data.error);
        return;
      }
      /* Say what actually happened per channel rather than "sent": the desk
         needs to know if the email provider refused forty of them. */
      const summary = (data.reports ?? [])
        .map(
          (r) =>
            `${r.channel} ${r.sent}${r.failed ? ` (${r.failed} failed)` : ""}`,
        )
        .join(" · ");
      onNotice(summary ? d.sentReport.replace("{summary}", summary) : d.noticeSent);
      setTitle("");
      setText("");
      setTitleEl("");
      setTextEl("");
      setImportant(false);
      await load(audience);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-10 grid gap-6 lg:grid-cols-2">
      <div className="rounded-3xl border border-mocha-200/70 bg-white/60 p-6">
        <p className="text-[10px] uppercase tracking-brand text-clay">
          {d.noticeTitle}
        </p>
        <p className="mt-3 text-[12px] leading-relaxed text-clay">
          {d.noticeHelp}
        </p>

        <label className="label mt-6" htmlFor="notice-subject">
          {d.noticeSubject}
        </label>
        <input
          id="notice-subject"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          className="input"
        />

        <label className="label mt-5" htmlFor="notice-body">
          {d.noticeBody}
        </label>
        <textarea
          id="notice-body"
          rows={5}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={2000}
          className="input resize-y"
        />

        <details className="mt-5">
          <summary className="cursor-pointer text-[11px] uppercase tracking-widest text-clay">
            {d.noticeGreek}
          </summary>
          <input
            value={titleEl}
            onChange={(e) => setTitleEl(e.target.value)}
            placeholder={d.noticeSubject}
            className="input mt-3"
          />
          <textarea
            rows={4}
            value={textEl}
            onChange={(e) => setTextEl(e.target.value)}
            placeholder={d.noticeBody}
            className="input mt-3 resize-y"
          />
        </details>

        <button
          onClick={() => setImportant((v) => !v)}
          className={cn(
            "mt-6 rounded-full border px-4 py-2 text-[11px] uppercase tracking-widest transition-colors",
            important
              ? "border-gold bg-gold/15 text-[#8a6f1a]"
              : "border-mocha-200 text-mocha-500 hover:border-mocha-400",
          )}
        >
          {d.noticeImportant}
        </button>

        {/* ------------------------------------------------- who it goes to */}
        <div className="mt-8 border-t border-mocha-200/70 pt-6">
          <p className="text-[10px] uppercase tracking-brand text-clay">
            {d.audienceTitle}
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["ALL", d.audienceAll, d.audienceAllWhy],
                ["OFFERS", d.audienceOffers, d.audienceOffersWhy],
              ] as const
            ).map(([key, label, why]) => (
              <button
                key={key}
                data-audience={key}
                onClick={() => setAudience(key)}
                className={cn(
                  "rounded-2xl border p-4 text-left transition-colors duration-300",
                  audience === key
                    ? "border-mocha-600 bg-mocha-600/[0.06]"
                    : "border-mocha-200 hover:border-mocha-400",
                )}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-mocha-700">{label}</span>
                  {reach && (
                    <span className="text-[11px] text-clay lining-nums tabular-nums">
                      {audience === key ? reach.people : ""}
                    </span>
                  )}
                </span>
                <span className="mt-1.5 block text-[11px] leading-relaxed text-clay">
                  {why}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* ------------------------------------------------ how it goes out */}
        <div className="mt-7">
          <p className="text-[10px] uppercase tracking-brand text-clay">
            {d.channelsTitle}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-clay">
            {d.channelsHelp}
          </p>

          <div className="mt-4 space-y-3">
            {(
              [
                ["push", d.chanPush, d.chanPushWhy, reach?.push],
                ["email", d.chanEmail, d.chanEmailWhy, reach?.email],
                ["sms", d.chanSms, d.chanSmsWhy, reach?.sms],
              ] as const
            ).map(([key, label, why, n]) => {
              const on = channels.includes(key);
              const ready = transports[key]?.ready ?? true;
              return (
                <button
                  key={key}
                  data-channel={key}
                  aria-pressed={on}
                  onClick={() => toggle(key)}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors duration-300",
                    on
                      ? "border-mocha-600 bg-mocha-600/[0.06]"
                      : "border-mocha-200 hover:border-mocha-400",
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px]",
                      on
                        ? "border-mocha-600 bg-mocha-600 text-cream"
                        : "border-mocha-300",
                    )}
                  >
                    {on ? "✓" : ""}
                  </span>
                  <span className="flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] text-mocha-700">{label}</span>
                      {/* The count is the point of this screen: nobody should
                          press send wondering who it reaches. */}
                      <span className="text-[11px] text-clay lining-nums tabular-nums">
                        {ready
                          ? d.chanReaches.replace("{n}", String(n ?? 0))
                          : key === "push"
                            ? d.chanNoKeys
                            : d.chanNotSet}
                      </span>
                    </span>
                    <span className="mt-1 block text-[11px] leading-relaxed text-clay">
                      {why}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <Button
          className="mt-6 block"
          size="sm"
          disabled={busy === "send" || title.trim().length < 3 || text.trim().length < 3}
          onClick={send}
        >
          {busy === "send"
            ? t.common.loading
            : audience === "OFFERS"
              ? d.noticeSendOffers
              : d.noticeSendAll}
        </Button>
      </div>

      <div className="rounded-3xl border border-mocha-200/70 bg-white/60 p-6">
        <p className="text-[10px] uppercase tracking-brand text-clay">
          {d.noticeHistory}
        </p>

        {history.length === 0 ? (
          <p className="mt-5 text-sm text-clay">{d.noticeNone}</p>
        ) : (
          <ul className="mt-5 divide-y divide-mocha-200/70">
            {history.map((h) => (
              <li key={h.id} className="py-4">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <span className="text-[14px] text-mocha-600">
                    {h.important && (
                      <span
                        aria-hidden
                        className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-gold align-middle"
                      />
                    )}
                    {h.titleEn}
                  </span>
                  <span className="text-[11px] text-clay lining-nums tabular-nums">
                    {h.reads}/{h.members} {d.noticeReads}
                  </span>
                </div>
                <p className="mt-1 text-[11px] uppercase tracking-widest text-clay">
                  {fmtFullDate(h.createdAt)}
                  {h.author ? ` · ${h.author}` : ""}
                  {` · ${
                    h.audience === "OFFERS"
                      ? d.noticeAudienceOffers
                      : d.noticeAudienceAll
                  }`}
                </p>
                {h.deliveries.length > 0 && (
                  <p className="mt-1 text-[11px] text-clay lining-nums tabular-nums">
                    {h.deliveries
                      .map(
                        (x) =>
                          `${x.channel} ${x.sent}${x.failed ? ` (${x.failed} failed)` : ""}`,
                      )
                      .join(" · ")}
                  </p>
                )}
                <p className="mt-2 line-clamp-2 text-[13px] text-mocha-500">
                  {h.bodyEn}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
