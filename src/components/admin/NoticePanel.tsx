"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Pager } from "@/components/ui/Pager";
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
  segment: string;
  createdAt: string;
  author: string | null;
  reads: number;
  members: number;
  deliveries: Delivery[];
};

type Reach = {
  people: number;
  push: number;
  email: number;
  sms: number;
  /** How many accounts are marked as tests, so their exclusion can be stated. */
  testAccounts: number;
};
type HistoryMeta = {
  page: number;
  pages: number;
  total: number;
  counts: { all: number; push: number; email: number; sms: number };
};
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

  /* Test accounts are out unless somebody deliberately puts them in. The default
     is the one that matters: a real announcement counted as reaching 41 people
     when four of them are the owner's dummy accounts is a number that will be
     quoted back at somebody later. */
  const [includeTest, setIncludeTest] = useState(false);

  /* Narrowing by what members have actually done. Separate from the audience
     above, which is about consent: these decide relevance, that decides
     permission, and the permission one is never weakened by these. */
  const [neverPaid, setNeverPaid] = useState(false);
  const [noSessionsLeft, setNoSessionsLeft] = useState(false);
  const [awayValue, setAwayValue] = useState(0);
  const [awayUnit, setAwayUnit] = useState<"days" | "weeks" | "months">("months");

  /* Months are 30 days. The desk is choosing a rough cohort — "people we have
     not seen since the summer" — not computing a billing period, and a filter
     that quietly disagreed with a calendar month by a day or two would never be
     noticed and never matter. */
  const awayDays =
    awayValue <= 0
      ? 0
      : awayValue * (awayUnit === "days" ? 1 : awayUnit === "weeks" ? 7 : 30);

  /* Which channel's history to show, and where in it. */
  const [channel, setChannel] = useState<Channel | null>(null);
  const [meta, setMeta] = useState<HistoryMeta | null>(null);
  const [paging, setPaging] = useState(false);

  const load = useCallback(
    async (opts: {
      audience: "ALL" | "OFFERS";
      includeTest: boolean;
      channel: Channel | null;
      page: number;
      neverPaid: boolean;
      noSessionsLeft: boolean;
      awayDays: number;
    }) => {
      const q = new URLSearchParams({
        audience: opts.audience,
        includeTest: opts.includeTest ? "1" : "0",
        page: String(opts.page),
        neverPaid: opts.neverPaid ? "1" : "0",
        noSessionsLeft: opts.noSessionsLeft ? "1" : "0",
        inactiveDays: String(opts.awayDays),
      });
      if (opts.channel) q.set("channel", opts.channel);

      const res = await fetch(`/api/admin/notices?${q}`);
      if (!res.ok) return;
      const data = (await res.json()) as {
        notices: Sent[];
        history: HistoryMeta;
        reach: Reach;
        transports: Transports;
      };
      setHistory(data.notices ?? []);
      setMeta(data.history ?? null);
      setReach(data.reach ?? null);
      setTransports(data.transports ?? {});
    },
    [],
  );

  const refresh = useCallback(
    (page = 1) =>
      load({
        audience,
        includeTest,
        channel,
        page,
        neverPaid,
        noSessionsLeft,
        awayDays,
      }),
    [load, audience, includeTest, channel, neverPaid, noSessionsLeft, awayDays],
  );

  useEffect(() => {
    void refresh(1);
  }, [refresh]);

  async function goPage(page: number) {
    setPaging(true);
    try {
      await refresh(page);
    } finally {
      setPaging(false);
    }
  }

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
          includeTest,
          neverPaid,
          noSessionsLeft,
          inactiveDays: awayDays,
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
      await refresh(1);
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

          {/* ------------------------------------- narrow it by what they did */}
          <p className="mt-6 text-[10px] uppercase tracking-brand text-clay">
            {d.segTitle}
          </p>
          <p className="mt-2 text-[11px] leading-relaxed text-clay">
            {d.segHelp}
          </p>

          <div className="mt-4 space-y-2">
            {(
              [
                ["neverPaid", d.segNeverPaid, d.segNeverPaidWhy, neverPaid, setNeverPaid],
                [
                  "noSessions",
                  d.segNoSessions,
                  d.segNoSessionsWhy,
                  noSessionsLeft,
                  setNoSessionsLeft,
                ],
              ] as const
            ).map(([key, label, why, on, set]) => (
              <button
                key={key}
                type="button"
                data-segment={key}
                aria-pressed={on}
                onClick={() => set((v: boolean) => !v)}
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
                    on ? "border-mocha-600 bg-mocha-600 text-cream" : "border-mocha-300",
                  )}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="flex-1">
                  <span className="text-[13px] text-mocha-700">{label}</span>
                  <span className="mt-1 block text-[11px] leading-relaxed text-clay">
                    {why}
                  </span>
                </span>
              </button>
            ))}

            {/* Not been in for a while. Zero means "do not filter by this" —
                a number is easier to clear than a fourth checkbox. */}
            <div
              className={cn(
                "rounded-2xl border p-4 transition-colors duration-300",
                awayDays > 0
                  ? "border-mocha-600 bg-mocha-600/[0.06]"
                  : "border-mocha-200",
              )}
            >
              <p className="text-[13px] text-mocha-700">{d.segAway}</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={120}
                  value={awayValue}
                  data-segment="awayValue"
                  onChange={(e) => setAwayValue(Math.max(0, Number(e.target.value) || 0))}
                  className="input w-20 lining-nums tabular-nums"
                  aria-label={d.segAway}
                />
                <div className="flex gap-1.5">
                  {(
                    [
                      ["days", d.segDays],
                      ["weeks", d.segWeeks],
                      ["months", d.segMonths],
                    ] as const
                  ).map(([unit, label]) => (
                    <button
                      key={unit}
                      type="button"
                      data-segment-unit={unit}
                      aria-pressed={awayUnit === unit}
                      onClick={() => setAwayUnit(unit)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-widest transition-colors",
                        awayUnit === unit
                          ? "border-mocha-600 bg-mocha-600 text-cream"
                          : "border-mocha-200 text-mocha-500 hover:border-mocha-400",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {awayValue > 0 && (
                  <button
                    type="button"
                    onClick={() => setAwayValue(0)}
                    className="text-[10px] uppercase tracking-widest text-clay underline decoration-clay/40 underline-offset-4"
                  >
                    {d.segClear}
                  </button>
                )}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-clay">
                {awayDays > 0
                  ? d.segAwayOn.replace("{n}", String(awayDays))
                  : d.segAwayOff}
              </p>
            </div>
          </div>

          {/* The number that matters. Filters can narrow an audience to nobody,
              and pressing send on nobody should not be a surprise. */}
          {reach && (
            <p
              data-reach-total
              className={cn(
                "mt-4 text-[12px] leading-relaxed",
                reach.people === 0 ? "text-red-700" : "text-mocha-600",
              )}
            >
              {reach.people === 0
                ? d.segNobody
                : d.segMatches.replace("{n}", String(reach.people))}
            </p>
          )}
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

        {/* Only shown when there is at least one test account. A checkbox that
            can never change anything is one more thing to read. */}
        {reach && reach.testAccounts > 0 && (
          <button
            type="button"
            data-include-test={includeTest ? "on" : "off"}
            aria-pressed={includeTest}
            onClick={() => setIncludeTest((v) => !v)}
            className={cn(
              "mt-6 flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors duration-300",
              includeTest
                ? "border-mocha-600 bg-mocha-600/[0.06]"
                : "border-mocha-200 hover:border-mocha-400",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px]",
                includeTest ? "border-mocha-600 bg-mocha-600 text-cream" : "border-mocha-300",
              )}
            >
              {includeTest ? "✓" : ""}
            </span>
            <span className="flex-1">
              <span className="text-[13px] text-mocha-700">
                {d.noticeIncludeTest}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-clay">
                {(includeTest ? d.noticeIncludeTestOn : d.noticeIncludeTestOff).replace(
                  "{n}",
                  String(reach.testAccounts),
                )}
              </span>
            </span>
          </button>
        )}

        <Button
          className="mt-6 block"
          size="sm"
          disabled={
            busy === "send" ||
            title.trim().length < 3 ||
            text.trim().length < 3 ||
            reach?.people === 0
          }
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

        {/* "What did we send by SMS" is a question with a bill attached, so it
            gets its own answer rather than a scroll through everything. */}
        <div className="mt-4 flex flex-wrap gap-2">
          {(
            [
              [null, d.noticeFilterAll, meta?.counts.all],
              ["push", d.chanPush, meta?.counts.push],
              ["email", d.chanEmail, meta?.counts.email],
              ["sms", d.chanSms, meta?.counts.sms],
            ] as const
          ).map(([key, label, count]) => (
            <button
              key={key ?? "all"}
              type="button"
              data-history-filter={key ?? "all"}
              aria-pressed={channel === key}
              disabled={paging}
              onClick={() => setChannel(key)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[10px] uppercase tracking-widest transition-colors duration-300",
                channel === key
                  ? "border-mocha-600 bg-mocha-600 text-cream"
                  : "border-mocha-200 text-mocha-500 hover:border-mocha-400",
              )}
            >
              {label}
              <span className="ml-2 lining-nums tabular-nums opacity-70">
                {count ?? 0}
              </span>
            </button>
          ))}
        </div>

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
                </p>
                {/* Who it went to, in the words recorded when it went out. It
                    cannot be worked out later: the audience for "not been for
                    three months" is different today, because people came back. */}
                <p className="mt-1 text-[11px] text-clay [overflow-wrap:anywhere]">
                  {h.segment ||
                    (h.audience === "OFFERS"
                      ? d.noticeAudienceOffers
                      : d.noticeAudienceAll)}
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

        {meta && (
          <Pager
            page={meta.page}
            pages={meta.pages}
            total={meta.total}
            busy={paging}
            onPage={(p) => void goPage(p)}
            labels={{
              newer: t.notices.pagerNewer,
              older: t.notices.pagerOlder,
              of: t.notices.pagerOf,
            }}
          />
        )}
      </div>
    </div>
  );
}
