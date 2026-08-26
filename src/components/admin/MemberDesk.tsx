"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";
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
  marketingOptIn: boolean;
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

export function MemberDesk({ onNotice }: { onNotice: (s: string) => void }) {
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

  /* Contact form */
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [channels, setChannels] = useState({
    notifyEmail: true,
    notifySms: false,
    notifyPush: false,
    marketingOptIn: false,
  });
  const [newPassword, setNewPassword] = useState("");

  const search = useCallback(async (q: string) => {
    const res = await fetch(`/api/admin/members?q=${encodeURIComponent(q)}`);
    if (!res.ok) return;
    const data = (await res.json()) as { members: Found[] };
    setFound(data.members ?? []);
  }, []);

  useEffect(() => {
    const id = window.setTimeout(() => void search(query), 220);
    return () => window.clearTimeout(id);
  }, [query, search]);

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
    setNewPassword("");
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
        onNotice(String(data.error ?? t.common.somethingWrong));
        return null;
      }
      if (member) await load(member.id);
      await search(query);
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
                  <span className="text-[14px]">{m.name}</span>
                  <span className="text-[12px] lining-nums tabular-nums opacity-70">
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
              disabled={busy === "sell" || credits === 0}
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

            <Button
              size="sm"
              className="mt-5"
              disabled={busy === "contact"}
              onClick={async () => {
                const res = await post(
                  "/api/admin/member",
                  { userId: member.id, email, phone, ...channels },
                  "contact",
                  "PATCH",
                );
                if (res) onNotice(`${member.name}: ${t.common.save}d`);
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
}: {
  title: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-3xl border border-mocha-200/70 bg-white/60 p-6">
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
