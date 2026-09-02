"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";
import {
  CONDITION_MAX_CHARS,
  PILATES_EXPERIENCE,
  PILATES_LEVELS,
} from "@/lib/intake";
import { Pager } from "@/components/ui/Pager";
import { cn } from "@/lib/utils";

/**
 * One member, and everything the desk can do about them.
 *
 * Search on the left, the member on the right: sessions in and out, their
 * contact details, the channels they agreed to, a new password, and their booked
 * classes with a cancel that can refund or not. Every action reloads the member
 * from the server rather than guessing what changed, because the balance is the
 * thing somebody is standing at the counter asking about.
 */

type Found = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  credits: number;
  isTest: boolean;
};

type MemberFilter = "all" | "real" | "test";
type ListMeta = {
  page: number;
  pages: number;
  total: number;
  counts: { all: number; real: number; test: number };
};

type Detail = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
  credits: number;
  notifyEmail: boolean;
  notifySms: boolean;
  notifyPush: boolean;
  /** How many of their devices have allowed notifications. Read-only. */
  pushDevices: number;
  marketingOptIn: boolean;
  isTest: boolean;
  emailVerifiedAt: string | null;
  erasedAt: string | null;
  erasedBy: string | null;
  pilatesLevel: string | null;
  pilatesSince: string | null;
  healthCondition: string | null;
  intakeAt: string | null;
  upcoming: { id: string; startsAt: string; className: string }[];
  payments: {
    id: string;
    credits: number;
    amountCents: number;
    status: string;
    provider: string;
    createdAt: string;
  }[];
  ledger: {
    id: string;
    delta: number;
    reason: string;
    note: string | null;
    createdAt: string;
  }[];
};

export function MemberDesk({
  onNotice,
  owner,
}: {
  onNotice: (s: string) => void;
  /* Erasing a member is the owner's decision, not reception's. Passed in rather
     than fetched here so this component has one source of truth about who is
     looking at it, and so the panel is absent from the HTML rather than merely
     hidden by a class. */
  owner: boolean;
}) {
  const { t, fmtMoney, fmtShortDate, fmtTime, fmtMonthYear } = useI18n();
  const d = t.desk;

  const [query, setQuery] = useState("");
  const [found, setFound] = useState<Found[]>([]);
  const [member, setMember] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  /* Sessions form */
  const [credits, setCredits] = useState(10);
  const [amount, setAmount] = useState("200");
  const [validity, setValidity] = useState(90);
  const [method, setMethod] = useState<"cash" | "card_at_desk" | "adjustment">(
    "cash",
  );
  const [note, setNote] = useState("");
  /**
   * What the desk is selling, not just how many.
   *
   * The studio takes cash for a one to one as often as the website takes a card
   * for one, and until this existed the desk could only ever hand over class
   * sessions. Somebody who paid €30 at the counter would have found their
   * session refused by the only slot it was bought for.
   */
  const [sellKind, setSellKind] = useState<"CLASS" | "PERSONAL" | "DUET">(
    "CLASS",
  );

  /* Contact form */
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channels, setChannels] = useState({
    notifyEmail: true,
    notifySms: false,
    notifyPush: false,
    marketingOptIn: false,
  });
  /* Not folded into `channels` above: this is not a consent, it is a label the
     studio puts on an account, and mixing an administrative marker in with "may
     we email you" invites somebody to switch it by accident. */
  const [isTest, setIsTest] = useState(false);
  /* The member's own three answers, editable here for the member who joined at
     the counter or who mentions something in passing. */
  const [level, setLevel] = useState<string>("");
  const [since, setSince] = useState<string>("");
  const [condition, setCondition] = useState<string>("");
  const [newPassword, setNewPassword] = useState("");
  /* Cleared whenever a different member is loaded, below: a typed confirmation
     left sitting in the box while the desk clicks onto somebody else is the one
     way this could erase the wrong person. */
  const [eraseConfirm, setEraseConfirm] = useState("");

  /* Browsing the list is a real way to use this screen, not a fallback for
     failing to search: the member who came in last week, the one whose name you
     half remember. It used to be capped at twelve with no way past them. */
  const [filter, setFilter] = useState<MemberFilter>("all");
  const [meta, setMeta] = useState<ListMeta | null>(null);
  const [paging, setPaging] = useState(false);

  const search = useCallback(
    async (q: string, f: MemberFilter, page: number) => {
      const params = new URLSearchParams({
        q,
        filter: f,
        page: String(page),
      });
      const res = await fetch(`/api/admin/members?${params}`);
      if (!res.ok) return;
      const data = (await res.json()) as { members: Found[] } & ListMeta;
      setFound(data.members ?? []);
      setMeta({
        page: data.page,
        pages: data.pages,
        total: data.total,
        counts: data.counts,
      });
    },
    [],
  );

  /* Typing or changing the filter always returns to page 1: staying on page 4
     of a new result set shows an empty list, which reads as "no matches". */
  useEffect(() => {
    const id = window.setTimeout(() => void search(query, filter, 1), 220);
    return () => window.clearTimeout(id);
  }, [query, filter, search]);

  async function goPage(page: number) {
    setPaging(true);
    try {
      await search(query, filter, page);
    } finally {
      setPaging(false);
    }
  }

  const load = useCallback(async (id: string) => {
    const res = await fetch(`/api/admin/members?id=${id}`);
    if (!res.ok) return;
    const data = (await res.json()) as { member: Detail };
    setMember(data.member);
    setEmail(data.member.email);
    setPhone(data.member.phone ?? "");
    setChannels({
      notifyEmail: data.member.notifyEmail,
      notifySms: data.member.notifySms,
      notifyPush: data.member.notifyPush,
      marketingOptIn: data.member.marketingOptIn,
    });
    setIsTest(data.member.isTest);
    setLevel(data.member.pilatesLevel ?? "");
    setSince(data.member.pilatesSince ?? "");
    setCondition(data.member.healthCondition ?? "");
    setNewPassword("");
    setEraseConfirm("");
  }, []);

  async function post(url: string, payload: unknown, key: string, method = "POST") {
    setBusy(key);
    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        /* Said in words. The server answers in codes, which is right for a
           server and useless at a counter: "PHONE_TAKEN" in capitals tells a
           receptionist neither what went wrong nor whose fault it was. Unknown
           codes still fall through to the code itself, because a rare unmapped
           one is something they can at least quote down the phone. */
        const known: Record<string, string> = {
          EMAIL_TAKEN: d.errEmailTaken,
          PHONE_TAKEN: d.errPhoneTaken,
          EMAIL_INVALID: d.errEmailInvalid,
          PHONE_INVALID: d.errPhoneInvalid,
          EMAIL_UNVERIFIED: d.errSellUnverified,
          ALREADY_ERASED: d.eraseAlready,
          DESK_ACCOUNT: d.eraseDeskAccount,
          CONFIRM_MISMATCH: d.eraseMismatch,
        };
        const code = String(data.error ?? "");
        onNotice(known[code] ?? code ?? t.common.somethingWrong);
        return null;
      }
      if (member) await load(member.id);
      /* Stay where the desk was: a save on page 3 should not throw them back to
         page 1 of the list. */
      await search(query, filter, meta?.page ?? 1);
      return data;
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-10 grid gap-8 lg:grid-cols-[320px_1fr]">
      {/* ------------------------------------------------------------ search */}
      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={d.search}
          className="input"
          aria-label={d.search}
        />

        {/* Both directions are useful: the real membership, and the dummy
            account you were experimenting with an hour ago. Hidden entirely
            when there are no test accounts to separate out. */}
        {meta && meta.counts.test > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {(
              [
                ["all", d.memberFilterAll, meta.counts.all],
                ["real", d.memberFilterReal, meta.counts.real],
                ["test", d.memberFilterTest, meta.counts.test],
              ] as const
            ).map(([key, label, count]) => (
              <button
                key={key}
                type="button"
                data-member-filter={key}
                aria-pressed={filter === key}
                disabled={paging}
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-[10px] uppercase tracking-widest transition-colors duration-300",
                  filter === key
                    ? "border-mocha-600 bg-mocha-600 text-cream"
                    : "border-mocha-200 text-mocha-500 hover:border-mocha-400",
                )}
              >
                {label}
                <span className="ml-2 lining-nums tabular-nums opacity-70">
                  {count}
                </span>
              </button>
            ))}
          </div>
        )}

        <ul className="mt-4 space-y-2">
          {found.length === 0 && (
            <li className="px-4 py-3 text-sm text-clay">{d.noMembers}</li>
          )}
          {found.map((m) => (
            <li key={m.id}>
              <button
                onClick={() => void load(m.id)}
                className={cn(
                  "w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                  member?.id === m.id
                    ? "border-mocha-600 bg-mocha-600 text-cream"
                    : "border-mocha-200/70 bg-white/60 hover:border-mocha-400",
                )}
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex-1 text-[14px] [overflow-wrap:anywhere]">
                    {m.name}
                    {/* Marked on the row, not only inside the profile: the
                        whole point is telling a dummy account apart from a
                        real member at a glance. */}
                    {m.isTest && (
                      <span
                        className={cn(
                          "ml-2 rounded-full px-2 py-0.5 align-middle text-[9px] uppercase tracking-widest",
                          member?.id === m.id
                            ? "bg-cream/20 text-cream"
                            : "bg-gold/20 text-[#8a6f1a]",
                        )}
                      >
                        {d.memberFilterTest}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12px] lining-nums tabular-nums opacity-70">
                    {m.credits}
                  </span>
                </span>
                <span
                  className={cn(
                    "mt-1 block truncate text-[11px]",
                    member?.id === m.id ? "text-cream/60" : "text-clay",
                  )}
                >
                  {m.email}
                  {m.role !== "MEMBER" ? ` · ${m.role}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>

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

      {/* ------------------------------------------------------------ member */}
      {!member ? (
        <div className="rounded-3xl border border-dashed border-mocha-200 px-6 py-20 text-center text-sm text-clay">
          {d.member}
        </div>
      ) : (
        <div className="space-y-6">
          {/* who */}
          <div className="rounded-3xl border border-mocha-200/70 bg-white/60 p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <div>
                <p className="font-display text-2xl text-mocha-600">
                  {member.name}
                </p>
                <p className="mt-1 text-[12px] text-clay">
                  {d.joined} {fmtMonthYear(member.createdAt)}
                  {member.role !== "MEMBER" ? ` · ${member.role}` : ""}
                </p>

                {/* Two states worth saying out loud on the card rather than
                    leaving the desk to deduce from a balance that will not
                    spend. Both explain themselves underneath, because the
                    person reading this is being asked "why can't I book?" by
                    somebody standing in front of them. */}
                {!member.erasedAt && !member.emailVerifiedAt && (
                  <Flag
                    tone="warn"
                    label={d.memberUnverified}
                    why={d.memberUnverifiedWhy}
                  />
                )}
                {member.erasedAt && (
                  <Flag
                    tone="quiet"
                    label={d.memberErased}
                    why={d.memberErasedWhy
                      .replace("{who}", member.erasedBy ?? "—")
                      .replace("{when}", fmtShortDate(member.erasedAt))}
                  />
                )}
              </div>
              <p className="text-right">
                <span className="block font-display text-3xl text-mocha-600 lining-nums tabular-nums">
                  {member.credits}
                </span>
                <span className="text-[10px] uppercase tracking-widest text-clay">
                  {d.balance}
                </span>
              </p>
            </div>
          </div>

          {/* sessions in and out */}
          <Panel title={d.sellTitle} help={d.sellHelp}>
            {/* Said before the form rather than after the press. The rule is that
                nothing lands on an account until its address is proved, and the
                desk is not an exception to it — but taking sessions back is,
                because the studio must always be able to correct itself. */}
            {!member.erasedAt && !member.emailVerifiedAt && (
              <p className="mb-5 rounded-2xl border border-gold/60 bg-gold/[0.07] px-4 py-3 text-[12px] leading-relaxed text-mocha-700">
                {d.errSellUnverified}
              </p>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={d.sellCredits}>
                <input
                  type="number"
                  value={credits}
                  onChange={(e) => setCredits(Number(e.target.value))}
                  className="input lining-nums tabular-nums"
                />
              </Field>
              <Field label={d.sellMethod}>
                <select
                  value={method}
                  onChange={(e) =>
                    setMethod(e.target.value as typeof method)
                  }
                  className="input"
                >
                  <option value="cash">{d.methodCash}</option>
                  <option value="card_at_desk">{d.methodCard}</option>
                  <option value="adjustment">{d.methodAdjust}</option>
                </select>
              </Field>
              {method !== "adjustment" && (
                <Field label={d.sellPaid}>
                  <input
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="input lining-nums tabular-nums"
                  />
                </Field>
              )}
              <Field label={d.sellValidity}>
                <input
                  type="number"
                  value={validity}
                  onChange={(e) => setValidity(Number(e.target.value))}
                  className="input lining-nums tabular-nums"
                />
              </Field>
              <div className="sm:col-span-2">
                <Field label={d.sellKind}>
                  <div className="flex flex-wrap gap-2">
                    {(
                      [
                        ["CLASS", d.sellKindClass],
                        ["PERSONAL", d.sellKindPersonal],
                        ["DUET", d.sellKindDuet],
                      ] as const
                    ).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setSellKind(value);
                          /* An appointment session lives thirty days, like the
                             pack it is sold as. Moved with the choice rather
                             than left at ninety, because the default that is
                             right for a class pack is wrong here and nobody
                             remembers to change two fields. */
                          setValidity(value === "CLASS" ? 90 : 30);
                        }}
                        aria-pressed={sellKind === value}
                        className={cn(
                          "rounded-full border px-4 py-2 text-[11px] uppercase tracking-widest transition-colors",
                          sellKind === value
                            ? "border-mocha-600 bg-mocha-600 text-cream"
                            : "border-mocha-300 text-mocha-500 hover:border-mocha-500",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Field>
                {sellKind !== "CLASS" && (
                  <p className="mt-2 text-[11px] leading-relaxed text-clay">
                    {d.sellKindNote}
                  </p>
                )}
              </div>
              <div className="sm:col-span-2">
                <Field label={d.sellNote}>
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
            </div>

            <Button
              size="sm"
              className="mt-5"
              disabled={
                busy === "sell" ||
                credits === 0 ||
                /* Only the giving half. A negative number is a correction and
                   stays available whatever state the account is in. */
                (credits > 0 && !member.emailVerifiedAt && !member.erasedAt)
              }
              onClick={async () => {
                const res = await post(
                  "/api/admin/sessions",
                  {
                    userId: member.id,
                    credits,
                    validityDays: validity,
                    amountCents:
                      method === "adjustment"
                        ? 0
                        : Math.round(Number(amount.replace(",", ".")) * 100) || 0,
                    method,
                    note: note || undefined,
                    kind: sellKind,
                  },
                  "sell",
                );
                if (res) {
                  onNotice(
                    `${member.name}: ${res.credits as number} → ${res.balance as number}`,
                  );
                  setNote("");
                }
              }}
            >
              {busy === "sell" ? t.common.loading : d.sellDo}
            </Button>
          </Panel>

          {/* their classes */}
          <Panel title={d.bookings}>
            {member.upcoming.length === 0 ? (
              <p className="text-sm text-clay">{d.noBookings}</p>
            ) : (
              <ul className="divide-y divide-mocha-200/70">
                {member.upcoming.map((b) => (
                  <li
                    key={b.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span className="text-[14px] text-mocha-600">
                      {b.className}
                      <span className="ml-3 text-[12px] text-clay lining-nums tabular-nums">
                        {fmtShortDate(b.startsAt)} {fmtTime(b.startsAt)}
                      </span>
                    </span>
                    <span className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy === b.id}
                        onClick={async () => {
                          const res = await post(
                            "/api/admin/bookings",
                            { bookingId: b.id, refund: true },
                            b.id,
                          );
                          if (res) onNotice(`${member.name}: ${res.balance}`);
                        }}
                      >
                        {d.cancelRefund}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy === b.id}
                        onClick={async () => {
                          const res = await post(
                            "/api/admin/bookings",
                            { bookingId: b.id, refund: false },
                            b.id,
                          );
                          if (res) onNotice(`${member.name}: ${res.balance}`);
                        }}
                      >
                        {d.cancelNoRefund}
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          {/* contact + channels */}
          <Panel title={d.contact} help={d.contactHelp}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t.common.email}>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label={t.common.phone}>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="input"
                />
              </Field>
            </div>

            <p className="label mt-6">{d.channels}</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ["notifyEmail", d.chEmail],
                  ["notifySms", d.chSms],
                  ["notifyPush", d.chPush],
                  ["marketingOptIn", d.chOffers],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() =>
                    setChannels((c) => ({ ...c, [key]: !c[key] }))
                  }
                  className={cn(
                    "rounded-full border px-4 py-2 text-[11px] uppercase tracking-widest transition-colors",
                    channels[key]
                      ? "border-mocha-600 bg-mocha-600 text-cream"
                      : "border-mocha-200 text-mocha-500 hover:border-mocha-400",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            {/**
              * Whether the member's phone actually rings, which the chips above
              * cannot say.
              *
              * The push chip is the studio's side: we keep push on and there is
              * no switch here that turns it off. The member's side is a browser
              * permission on their own handset, granted only by a press on that
              * handset — no API grants it from anywhere else, for us or for
              * anybody. So reception is given the fact rather than a button
              * that would have to lie: zero devices is the answer to "why did
              * they not hear the class was cancelled", and it is fixable in ten
              * seconds on the member's phone while they are at the counter.
              */}
            <p className="mt-2 text-[11px] leading-relaxed text-clay">
              {member.pushDevices > 0
                ? d.pushDevices.replace("{n}", String(member.pushDevices))
                : `${d.pushNoDevices} ${d.pushCannotGrant}`}
            </p>

            {/**
              * Their pilates, and anything to be careful of.
              *
              * On the member's card and nowhere else. It is the one field on
              * this screen that is about somebody's body, and the day view and
              * the class lists are read on a monitor in a room with other
              * people in it. Reception looks a member up to talk to them, which
              * is exactly the moment this is worth having.
              */}
            <div className="mt-6 rounded-2xl border border-mocha-200 p-4">
              <p className="text-[13px] text-mocha-700">
                {t.intake.sectionTitle}
              </p>
              {!member.intakeAt && (
                <p className="mt-1 text-[11px] text-clay">
                  {t.intake.deskUnanswered}
                </p>
              )}

              <label className="label mt-4 block" htmlFor="md-level">
                {t.intake.deskLevel}
              </label>
              <select
                id="md-level"
                className="input"
                value={level}
                onChange={(e) => setLevel(e.currentTarget.value)}
              >
                <option value="">{t.intake.notAnswered}</option>
                {PILATES_LEVELS.map((option) => (
                  <option key={option} value={option}>
                    {t.intake.levels[option]}
                  </option>
                ))}
              </select>

              <label className="label mt-4 block" htmlFor="md-since">
                {t.intake.deskExperience}
              </label>
              <select
                id="md-since"
                className="input"
                value={since}
                onChange={(e) => setSince(e.currentTarget.value)}
              >
                <option value="">{t.intake.notAnswered}</option>
                {PILATES_EXPERIENCE.map((option) => (
                  <option key={option} value={option}>
                    {t.intake.experience[option]}
                  </option>
                ))}
              </select>

              <label className="label mt-4 block" htmlFor="md-condition">
                {t.intake.deskCondition}
              </label>
              <textarea
                id="md-condition"
                rows={3}
                maxLength={CONDITION_MAX_CHARS}
                className="input resize-y"
                value={condition}
                placeholder={
                  member.intakeAt
                    ? t.intake.deskNothing
                    : t.intake.deskUnanswered
                }
                onChange={(e) => setCondition(e.currentTarget.value)}
              />
            </div>

            {/* A marker, not a preference. Deliberately below the channels and
                deliberately spelt out: an account switched to a test stops
                receiving campaigns and stops being counted as a member, and
                somebody discovering that by accident weeks later would rightly
                be annoyed. */}
            <button
              type="button"
              data-member-test={isTest ? "on" : "off"}
              aria-pressed={isTest}
              onClick={() => setIsTest((v) => !v)}
              className={cn(
                "mt-6 flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-colors duration-300",
                isTest
                  ? "border-gold/60 bg-gold/[0.07]"
                  : "border-mocha-200 hover:border-mocha-400",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border text-[11px]",
                  isTest ? "border-gold bg-gold text-mocha-700" : "border-mocha-300",
                )}
              >
                {isTest ? "✓" : ""}
              </span>
              <span className="flex-1">
                <span className="text-[13px] text-mocha-700">{d.memberTest}</span>
                <span className="mt-1 block text-[11px] leading-relaxed text-clay">
                  {d.memberTestWhy}
                </span>
              </span>
            </button>

            <Button
              size="sm"
              className="mt-5"
              disabled={busy === "contact"}
              onClick={async () => {
                const res = await post(
                  "/api/admin/member",
                  {
                    userId: member.id,
                    email,
                    phone,
                    ...channels,
                    isTest,
                    /* Only sent when there is something to send: an empty
                       level means nobody has answered, and writing "" would
                       fail validation on a member the desk never asked. */
                    ...(level ? { pilatesLevel: level } : {}),
                    ...(since ? { pilatesSince: since } : {}),
                    ...(condition !== (member.healthCondition ?? "")
                      ? { healthCondition: condition }
                      : {}),
                  },
                  "contact",
                  "PATCH",
                );
                if (res) {
                  onNotice(`${member.name}: ${t.common.save}d`);
                  /* A full reload, back to the members list.
                   *
                   * The desk edits an email, a phone, a consent, a test-account
                   * marker — none of which changes anything visible on this
                   * screen, so "Saved" was the only evidence and it looked
                   * identical whether the save had taken or not. Reloading makes
                   * the screen re-read every one of those values from the
                   * database, and picks up the knock-on effects: the test badge
                   * in the list, and the reach counts over in Notices.
                   *
                   * `?tab=members` because a plain reload landed on Bookings —
                   * the tab is client state, and a reload reset it. Saving a
                   * member and being thrown onto a different screen is worse
                   * than no confirmation at all. */
                  window.location.assign("/admin?tab=members");
                }
              }}
            >
              {busy === "contact" ? t.common.loading : t.common.save}
            </Button>
          </Panel>

          {/* password */}
          <Panel title={d.password} help={d.passwordHelp}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[220px] flex-1">
                <Field label={t.common.password}>
                  <input
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="input"
                  />
                </Field>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy === "password" || newPassword.length < 8}
                onClick={async () => {
                  const res = await post(
                    "/api/admin/member/password",
                    { userId: member.id, password: newPassword },
                    "password",
                  );
                  if (res) {
                    onNotice(`${member.name}: ${d.passwordDo}`);
                    setNewPassword("");
                  }
                }}
              >
                {busy === "password" ? t.common.loading : d.passwordDo}
              </Button>
            </div>
          </Panel>

          {/* erasure — the owner's screen only, and never on a desk account */}
          {owner && !member.erasedAt && member.role === "MEMBER" && (
            <Panel title={d.eraseTitle} help={d.eraseHelp} mark="erase">
              {/* Said before the box rather than after the press. A member with
                  a class on Thursday is a conversation, not a keystroke. */}
              {member.upcoming.length > 0 && (
                <p className="mb-5 rounded-2xl border border-gold/60 bg-gold/[0.07] px-4 py-3 text-[12px] leading-relaxed text-mocha-700">
                  {d.eraseWarnBookings.replace(
                    "{n}",
                    String(member.upcoming.length),
                  )}
                </p>
              )}

              <Field label={d.eraseConfirmLabel}>
                <input
                  value={eraseConfirm}
                  onChange={(e) => setEraseConfirm(e.target.value)}
                  placeholder={member.email}
                  autoComplete="off"
                  spellCheck={false}
                  className="input"
                />
              </Field>
              <p className="mt-2 text-[11px] text-clay">
                {d.eraseConfirmHint}
              </p>

              <Button
                size="sm"
                variant="outline"
                className="mt-5 border-red-300 text-red-700 hover:border-red-500 hover:bg-red-50"
                /* Compared here as well as on the server, and the server is the
                   one that counts. This only stops the press being wasted. */
                disabled={
                  busy === "erase" ||
                  eraseConfirm.trim().toLowerCase() !==
                    member.email.trim().toLowerCase()
                }
                onClick={async () => {
                  const res = await post(
                    "/api/admin/member/erase",
                    { userId: member.id, confirmEmail: eraseConfirm },
                    "erase",
                  );
                  if (res) {
                    onNotice(
                      d.eraseDone
                        .replace("{n}", String(res.paymentsKept ?? 0))
                        .replace("{d}", String(res.devicesRemoved ?? 0)),
                    );
                    setEraseConfirm("");
                  }
                }}
              >
                {busy === "erase" ? t.common.loading : d.eraseDo}
              </Button>
            </Panel>
          )}

          {/* history */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title={d.ledger}>
              <ul className="space-y-2 text-[13px]">
                {member.ledger.map((l) => (
                  <li key={l.id} className="flex justify-between gap-4">
                    <span className="text-clay">
                      {fmtShortDate(l.createdAt)}
                      {l.note ? ` · ${l.note}` : ""}
                    </span>
                    <span
                      className={cn(
                        "shrink-0 lining-nums tabular-nums",
                        l.delta > 0 ? "text-mocha-600" : "text-clay",
                      )}
                    >
                      {l.delta > 0 ? "+" : ""}
                      {l.delta}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel title={d.payments}>
              <ul className="space-y-2 text-[13px]">
                {member.payments.map((p) => (
                  <li key={p.id} className="flex justify-between gap-4">
                    <span className="text-clay">
                      {fmtShortDate(p.createdAt)} · {p.provider} · {p.status}
                    </span>
                    <span className="shrink-0 lining-nums tabular-nums text-mocha-600">
                      {fmtMoney(p.amountCents)}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function Panel({
  title,
  help,
  children,
  mark,
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
  /* A stable hook for the tests and for the manual's screenshots, in the same
     style as data-desk-console and data-sms-panel. Class names are for looks and
     change with the design; these do not. */
  mark?: string;
}) {
  return (
    <div
      data-desk-panel={mark}
      className="rounded-3xl border border-mocha-200/70 bg-white/60 p-6"
    >
      <p className="text-[10px] uppercase tracking-brand text-clay">{title}</p>
      {help && (
        <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-clay">
          {help}
        </p>
      )}
      <div className="mt-5">{children}</div>
    </div>
  );
}

/**
 * A state the desk needs to know about, with the reason underneath.
 *
 * Two tones and no third. Amber is something to act on — a member who cannot
 * book yet; grey is something to be aware of — a member who has been erased and
 * whose row will never look normal again. A red one would say "error", and
 * neither of these is one.
 */
function Flag({
  tone,
  label,
  why,
}: {
  tone: "warn" | "quiet";
  label: string;
  why: string;
}) {
  return (
    <span
      data-member-flag={tone}
      className={cn(
        "mt-3 block max-w-md rounded-2xl border px-3.5 py-2.5",
        tone === "warn"
          ? "border-gold/60 bg-gold/[0.07]"
          : "border-mocha-200 bg-cream-200/60",
      )}
    >
      <span
        className={cn(
          "block text-[10px] uppercase tracking-widest",
          tone === "warn" ? "text-[#8a6f1a]" : "text-clay",
        )}
      >
        {label}
      </span>
      <span className="mt-1 block text-[11px] leading-relaxed text-mocha-600">
        {why}
      </span>
    </span>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  );
}
