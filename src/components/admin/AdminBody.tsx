"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Section } from "@/components/ui/Section";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

type Attendee = {
  bookingId: string;
  status: string;
  name: string;
  email: string;
  phone: string | null;
};

type SessionRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: string;
  className: { en: string; el: string };
  instructor: string | null;
  attendees: Attendee[];
};

type Member = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  createdAt: string;
  credits: number;
  classes: number;
  spentCents: number;
};

export function AdminBody({
  stats,
  today,
  members,
}: {
  stats: {
    members: number;
    bookings: number;
    creditsOutstanding: number;
    revenueCents: number;
    upcomingSessions: number;
  };
  today: SessionRow[];
  members: Member[];
}) {
  const { t, locale, fmtTime, fmtMoney, fmtLongDate } = useI18n();
  const router = useRouter();
  const el = locale === "el";

  const [tab, setTab] = useState<"today" | "members">("today");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [weeks, setWeeks] = useState(6);
  const [query, setQuery] = useState("");
  const [grantFor, setGrantFor] = useState<Member | null>(null);
  const [grantAmount, setGrantAmount] = useState(10);
  const [grantNote, setGrantNote] = useState("");

  async function mark(bookingId: string, status: "ATTENDED" | "NO_SHOW" | "CONFIRMED") {
    setBusy(bookingId);
    await fetch("/api/admin/attendance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status }),
    });
    setBusy(null);
    router.refresh();
  }

  async function generate() {
    setBusy("generate");
    const res = await fetch("/api/admin/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weeks }),
    });
    const data = (await res.json()) as { created?: number; skipped?: number };
    setNotice(`+${data.created ?? 0} classes created, ${data.skipped ?? 0} skipped`);
    setBusy(null);
    router.refresh();
  }

  async function grant() {
    if (!grantFor) return;
    setBusy("grant");
    const res = await fetch("/api/admin/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: grantFor.id,
        credits: grantAmount,
        validityDays: 90,
        note: grantNote || undefined,
      }),
    });
    const data = (await res.json()) as { credits?: number; error?: string };
    setNotice(
      data.error
        ? data.error
        : `${grantFor.name}: ${data.credits} ${t.common.credits}`,
    );
    setBusy(null);
    setGrantFor(null);
    setGrantNote("");
    router.refresh();
  }

  const filtered = members.filter((m) =>
    query.trim()
      ? `${m.name} ${m.email}`.toLowerCase().includes(query.trim().toLowerCase())
      : true,
  );

  return (
    <Section className="pt-12 md:pt-16">
      <div className="container-x">
        <p className="eyebrow mb-4">{t.admin.title}</p>
        <h1 className="h-display text-[2.4rem] leading-tight sm:text-5xl">
          {fmtLongDate(today[0]?.startsAt ?? new Date())}
        </h1>

        {/* stats */}
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label={t.admin.totalMembers} value={String(stats.members)} />
          <Kpi label={t.admin.totalBookings} value={String(stats.bookings)} />
          <Kpi
            label={t.admin.creditsOutstanding}
            value={String(stats.creditsOutstanding)}
          />
          <Kpi label={t.admin.revenue} value={fmtMoney(stats.revenueCents)} />
        </div>

        {notice && (
          <p className="mt-8 rounded-2xl border border-mocha-300 bg-white px-5 py-4 text-sm text-mocha-600">
            {notice}
          </p>
        )}

        {/* tabs */}
        <div className="mt-12 flex flex-wrap items-center gap-2">
          {(["today", "members"] as const).map((key) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "rounded-full border px-5 py-2.5 text-[10px] uppercase tracking-widest transition-all duration-500",
                tab === key
                  ? "border-mocha-600 bg-mocha-600 text-cream"
                  : "border-mocha-200 text-mocha-500 hover:border-mocha-400",
              )}
            >
              {key === "today" ? t.admin.tabs.today : t.admin.tabs.members}
            </button>
          ))}

          <div className="ml-auto flex items-center gap-3">
            <span className="text-[11px] text-clay">
              {stats.upcomingSessions} {t.admin.upcomingClasses}
            </span>
            <input
              type="number"
              min={1}
              max={26}
              value={weeks}
              onChange={(e) => setWeeks(Number(e.target.value))}
              className="w-16 rounded-xl border border-mocha-200 bg-white/80 px-3 py-2 text-sm tabular-nums"
              aria-label={t.admin.weeks}
            />
            <Button size="sm" onClick={generate} disabled={busy === "generate"}>
              {busy === "generate" ? t.common.loading : t.admin.generate}
            </Button>
          </div>
        </div>

        {/* today */}
        {tab === "today" && (
          <div className="mt-10">
            {today.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-mocha-200 px-6 py-14 text-center text-sm text-clay">
                {t.timetablePage.noClasses}
              </p>
            ) : (
              <ul className="space-y-4">
                {today.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-3xl border border-mocha-200/70 bg-white/60 p-6"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-4">
                      <div>
                        <p className="font-display text-2xl tabular-nums text-mocha-600">
                          {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}
                        </p>
                        <p className="mt-1 text-sm text-mocha-500">
                          {el ? s.className.el : s.className.en}
                          {s.instructor ? ` · ${s.instructor}` : ""}
                        </p>
                      </div>
                      <p className="text-[11px] uppercase tracking-widest text-clay">
                        {s.attendees.length}/{s.capacity}
                      </p>
                    </div>

                    {s.attendees.length > 0 && (
                      <ul className="mt-6 divide-y divide-mocha-200/60 border-t border-mocha-200/60">
                        {s.attendees.map((a) => (
                          <li
                            key={a.bookingId}
                            className="flex flex-wrap items-center justify-between gap-3 py-3"
                          >
                            <span className="text-sm text-mocha-600">
                              {a.name}
                              <span className="ml-3 text-[11px] text-clay">
                                {a.phone ?? a.email}
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              <button
                                onClick={() => mark(a.bookingId, "ATTENDED")}
                                disabled={busy === a.bookingId}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-[9px] uppercase tracking-widest transition",
                                  a.status === "ATTENDED"
                                    ? "border-mocha-600 bg-mocha-600 text-cream"
                                    : "border-mocha-200 text-mocha-500 hover:border-mocha-400",
                                )}
                              >
                                {t.admin.markAttended}
                              </button>
                              <button
                                onClick={() => mark(a.bookingId, "NO_SHOW")}
                                disabled={busy === a.bookingId}
                                className={cn(
                                  "rounded-full border px-3 py-1.5 text-[9px] uppercase tracking-widest transition",
                                  a.status === "NO_SHOW"
                                    ? "border-red-400 bg-red-500 text-white"
                                    : "border-mocha-200 text-mocha-500 hover:border-red-300",
                                )}
                              >
                                {t.admin.markNoShow}
                              </button>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* members */}
        {tab === "members" && (
          <div className="mt-10">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name or email"
              className="input max-w-sm"
            />

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-mocha-200/70 text-[10px] uppercase tracking-widest text-clay">
                    <th className="py-3 pr-4 font-normal">{t.common.fullName}</th>
                    <th className="py-3 pr-4 font-normal">{t.common.email}</th>
                    <th className="py-3 pr-4 font-normal">{t.common.credits}</th>
                    <th className="py-3 pr-4 font-normal">{t.nav.classes}</th>
                    <th className="py-3 pr-4 font-normal">{t.admin.revenue}</th>
                    <th className="py-3 font-normal" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b border-mocha-200/50 text-mocha-600"
                    >
                      <td className="py-3 pr-4">
                        {m.name}
                        {m.role !== "MEMBER" && (
                          <span className="ml-2 rounded-full border border-mocha-300 px-2 py-0.5 text-[9px] uppercase tracking-widest text-clay">
                            {m.role}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-clay">{m.email}</td>
                      <td className="py-3 pr-4 tabular-nums">{m.credits}</td>
                      <td className="py-3 pr-4 tabular-nums">{m.classes}</td>
                      <td className="py-3 pr-4 tabular-nums">
                        {fmtMoney(m.spentCents)}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          onClick={() => setGrantFor(m)}
                          className="link-underline text-[10px] uppercase tracking-widest text-mocha-500"
                        >
                          {t.admin.grantCredits}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* grant modal */}
      {grantFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-mocha-900/40 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-cream p-8 shadow-lift">
            <h3 className="h-display text-2xl">{t.admin.grantCredits}</h3>
            <p className="mt-2 text-sm text-clay">{grantFor.name}</p>

            <label className="label mt-6">{t.common.credits}</label>
            <input
              type="number"
              value={grantAmount}
              onChange={(e) => setGrantAmount(Number(e.target.value))}
              className="input tabular-nums"
            />
            <p className="mt-2 text-[11px] text-clay">
              Negative numbers remove credits.
            </p>

            <label className="label mt-5">{t.admin.grantReason}</label>
            <input
              value={grantNote}
              onChange={(e) => setGrantNote(e.target.value)}
              className="input"
            />

            <div className="mt-8 flex gap-3">
              <Button className="flex-1" onClick={grant} disabled={busy === "grant"}>
                {busy === "grant" ? t.common.loading : t.common.confirm}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setGrantFor(null)}
              >
                {t.common.back}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-mocha-200/70 bg-white/60 p-6">
      <p className="text-[10px] uppercase tracking-brand text-clay">{label}</p>
      <p className="mt-4 font-display text-3xl text-mocha-600">{value}</p>
    </div>
  );
}
