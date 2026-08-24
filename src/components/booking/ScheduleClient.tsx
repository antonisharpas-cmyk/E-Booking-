"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export type ScheduleSession = {
  id: string;
  /** Local YYYY-MM-DD the class belongs to */
  day: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  booked: number;
  spotsLeft: number;
  status: string;
  bookable: boolean;
  classType: {
    slug: string;
    nameEn: string;
    nameEl: string;
    level: string;
    intensity: number;
  };
  instructor: string | null;
  myBookingId: string | null;
};

const LEVEL: Record<string, { en: string; el: string }> = {
  ALL: { en: "All levels", el: "Όλα τα επίπεδα" },
  BEGINNER: { en: "Beginner", el: "Αρχάριοι" },
  INTERMEDIATE: { en: "Intermediate", el: "Μεσαίο" },
  ADVANCED: { en: "Advanced", el: "Προχωρημένοι" },
};

export function ScheduleClient({
  sessions: initial,
  signedIn,
  credits,
  days,
}: {
  sessions: ScheduleSession[];
  signedIn: boolean;
  credits: number;
  days: string[]; // ISO date strings, one per day shown
}) {
  const { t, locale, fmtTime, fmtLongDate, fmtDayNumber, fmtWeekdayShort } =
    useI18n();
  const router = useRouter();
  const el = locale === "el";

  const [sessions, setSessions] = useState(initial);
  const [balance, setBalance] = useState(credits);
  /* Open on the first day that actually has classes — the studio is closed on
     Sundays, and landing on an empty day reads as a broken timetable. */
  const [activeDay, setActiveDay] = useState(
    () =>
      days.find((d) => initial.some((s) => s.day === d && s.bookable)) ??
      days.find((d) => initial.some((s) => s.day === d)) ??
      days[0]!,
  );
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    kind: "ok" | "warn" | "error";
    text: string;
    cta?: { href: string; label: string };
  } | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, ScheduleSession[]>();
    for (const d of days) map.set(d, []);
    for (const s of sessions) {
      if (map.has(s.day)) map.get(s.day)!.push(s);
    }
    return map;
  }, [sessions, days]);

  const list = (byDay.get(activeDay) ?? []).filter((s) =>
    onlyAvailable ? s.spotsLeft > 0 && s.bookable : true,
  );

  function flash(next: NonNullable<typeof toast>) {
    setToast(next);
    window.setTimeout(() => setToast(null), 6000);
  }

  async function book(s: ScheduleSession) {
    if (!signedIn) {
      router.push("/login?next=/timetable");
      return;
    }
    setBusy(s.id);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: s.id }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        bookingId?: string;
        credits?: number;
        error?: string;
      };

      if (data.ok && data.bookingId) {
        setSessions((prev) =>
          prev.map((x) =>
            x.id === s.id
              ? {
                  ...x,
                  booked: x.booked + 1,
                  spotsLeft: Math.max(0, x.spotsLeft - 1),
                  myBookingId: data.bookingId!,
                }
              : x,
          ),
        );
        if (typeof data.credits === "number") setBalance(data.credits);
        flash({ kind: "ok", text: `${t.booking.successTitle} ${t.booking.successBody}` });
        router.refresh();
        return;
      }

      if (data.error === "NO_CREDITS") {
        flash({
          kind: "warn",
          text: t.booking.noCredits,
          cta: { href: "/pricing", label: t.booking.noCreditsCta },
        });
        return;
      }
      const messages: Record<string, string> = {
        CLASS_FULL: t.booking.classFull,
        ALREADY_BOOKED: t.booking.alreadyBooked,
        TOO_LATE: t.booking.tooLate,
        UNAUTHENTICATED: t.timetablePage.signedOut,
      };
      flash({
        kind: "error",
        text: messages[data.error ?? ""] ?? t.common.somethingWrong,
      });
    } catch {
      flash({ kind: "error", text: t.common.somethingWrong });
    } finally {
      setBusy(null);
    }
  }

  async function cancel(s: ScheduleSession) {
    if (!s.myBookingId) return;
    setBusy(s.id);
    try {
      const res = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: s.myBookingId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        refunded?: boolean;
        credits?: number;
      };
      if (data.ok) {
        setSessions((prev) =>
          prev.map((x) =>
            x.id === s.id
              ? {
                  ...x,
                  booked: Math.max(0, x.booked - 1),
                  spotsLeft: Math.min(x.capacity, x.spotsLeft + 1),
                  myBookingId: null,
                }
              : x,
          ),
        );
        if (typeof data.credits === "number") setBalance(data.credits);
        flash({
          kind: data.refunded ? "ok" : "warn",
          text: data.refunded
            ? `${t.booking.cancelled} ${t.booking.cancelRefund}`
            : `${t.booking.cancelled} ${t.booking.cancelNoRefund}`,
        });
        router.refresh();
      } else {
        flash({ kind: "error", text: t.common.somethingWrong });
      }
    } catch {
      flash({ kind: "error", text: t.common.somethingWrong });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {/* wallet + filter bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-mocha-200/70 bg-white/60 px-5 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-4">
          {signedIn ? (
            <>
              <span className="flex items-baseline gap-2">
                <span className="font-display text-3xl text-mocha-600">{balance}</span>
                <span className="text-[11px] uppercase tracking-widest text-clay">
                  {t.common.creditsLeft}
                </span>
              </span>
              <Link
                href="/pricing"
                className="link-underline text-[11px] uppercase tracking-widest text-mocha-500"
              >
                {t.account.walletTopUp}
              </Link>
            </>
          ) : (
            <p className="text-sm text-mocha-500">{t.timetablePage.signedOut}</p>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setOnlyAvailable((v) => !v)}
            className={cn(
              "rounded-full border px-4 py-2 text-[10px] uppercase tracking-widest transition-all duration-500",
              onlyAvailable
                ? "border-mocha-600 bg-mocha-600 text-cream"
                : "border-mocha-200 text-mocha-500 hover:border-mocha-400",
            )}
          >
            {onlyAvailable ? t.timetablePage.filterAvailable : t.timetablePage.filterAll}
          </button>
          {!signedIn && (
            <ButtonLink href="/login?next=/timetable" size="sm">
              {t.nav.login}
            </ButtonLink>
          )}
        </div>
      </div>

      {/* day picker */}
      <div className="no-scrollbar -mx-6 mt-8 flex gap-2 overflow-x-auto px-6 pb-2 md:-mx-10 md:px-10">
        {days.map((d, i) => {
          const date = new Date(`${d}T12:00:00`);
          const count = (byDay.get(d) ?? []).filter((s) => s.spotsLeft > 0).length;
          const active = d === activeDay;
          return (
            <button
              key={d}
              onClick={() => setActiveDay(d)}
              className={cn(
                "group flex min-w-[86px] shrink-0 flex-col items-center rounded-2xl border px-4 py-3 transition-all duration-500 ease-silk",
                active
                  ? "border-mocha-600 bg-mocha-600 text-cream"
                  : "border-mocha-200/70 bg-white/50 hover:border-mocha-400",
              )}
            >
              <span
                className={cn(
                  "text-[9px] uppercase tracking-widest",
                  active ? "text-cream/60" : "text-clay",
                )}
              >
                {i === 0
                  ? t.common.today
                  : i === 1
                    ? t.common.tomorrow
                    : fmtWeekdayShort(date)}
              </span>
              <span className="mt-1 font-display text-2xl tabular-nums">
                {fmtDayNumber(date)}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-[9px] tabular-nums",
                  active ? "text-cream/60" : "text-clay/70",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* toast */}
      {toast && (
        <div
          className={cn(
            "animate-fade-up",
            "mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4 text-sm",
            toast.kind === "ok" && "border-mocha-300 bg-white text-mocha-600",
            toast.kind === "warn" && "border-gold/40 bg-[#FBF6E7] text-mocha-700",
            toast.kind === "error" && "border-red-200 bg-red-50 text-red-700",
          )}
          role="status"
        >
          <span>{toast.text}</span>
          {toast.cta && (
            <ButtonLink href={toast.cta.href} size="sm">
              {toast.cta.label}
            </ButtonLink>
          )}
        </div>
      )}

      {/* class list */}
      <div className="mt-8">
        <p className="eyebrow mb-6">
          {fmtLongDate(new Date(`${activeDay}T12:00:00`))}
        </p>

        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-mocha-200 px-6 py-14 text-center text-sm text-clay">
            {t.timetablePage.noClasses}
          </p>
        ) : (
          <ul className="divide-y divide-mocha-200/70 border-y border-mocha-200/70">
            {list.map((s) => {
              const mine = Boolean(s.myBookingId);
              const full = s.spotsLeft <= 0;
              return (
                <li
                  key={s.id}
                  className="group grid gap-4 py-6 sm:grid-cols-[112px_1fr_auto] sm:items-center"
                >
                  <div>
                    <p className="font-display text-2xl tabular-nums text-mocha-600">
                      {fmtTime(s.startsAt)}
                    </p>
                    <p className="text-[10px] uppercase tracking-widest text-clay">
                      {fmtTime(s.endsAt)}
                    </p>
                  </div>

                  <div>
                    <p className="text-[15px] text-mocha-600">
                      {el ? s.classType.nameEl : s.classType.nameEn}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-clay">
                      <span className="uppercase tracking-widest">
                        {el
                          ? (LEVEL[s.classType.level]?.el ?? s.classType.level)
                          : (LEVEL[s.classType.level]?.en ?? s.classType.level)}
                      </span>
                      {s.instructor && (
                        <>
                          <span className="h-1 w-1 rounded-full bg-clay/50" />
                          <span>{s.instructor}</span>
                        </>
                      )}
                      <span className="h-1 w-1 rounded-full bg-clay/50" />
                      <span
                        className={cn(
                          "tabular-nums",
                          full ? "text-red-600/80" : "text-mocha-500",
                        )}
                      >
                        {full
                          ? t.common.full
                          : `${s.spotsLeft}/${s.capacity} ${t.common.spotsLeft}`}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3 sm:justify-end">
                    {/* occupancy meter */}
                    <span
                      aria-hidden
                      className="hidden h-1 w-20 overflow-hidden rounded-full bg-mocha-200 sm:block"
                    >
                      <span
                        className="block h-full rounded-full bg-mocha-500 transition-all duration-700 ease-silk"
                        style={{ width: `${(s.booked / s.capacity) * 100}%` }}
                      />
                    </span>

                    {mine ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === s.id}
                        onClick={() => cancel(s)}
                      >
                        {busy === s.id ? t.common.loading : t.account.cancelBooking}
                      </Button>
                    ) : !s.bookable ? (
                      <span className="text-[10px] uppercase tracking-widest text-clay/70">
                        {t.booking.tooLate}
                      </span>
                    ) : full ? (
                      <span className="text-[10px] uppercase tracking-widest text-clay/70">
                        {t.common.full}
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        disabled={busy === s.id}
                        onClick={() => book(s)}
                      >
                        {busy === s.id ? t.booking.booking : t.booking.bookNow}
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
