"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn, FREE_CANCELLATION_HOURS } from "@/lib/utils";

/**
 * One class type, sent once per page rather than once per class. Four weeks of
 * timetable is ~230 classes; repeating the names and level on each of them
 * added tens of kilobytes to the HTML for no new information.
 */
export type ScheduleClassType = {
  slug: string;
  nameEn: string;
  nameEl: string;
  level: string;
  intensity: number;
  durationMin: number;
};

export type ScheduleSession = {
  id: string;
  /** Local YYYY-MM-DD the class belongs to */
  day: string;
  startsAt: string;
  capacity: number;
  booked: number;
  spotsLeft: number;
  status: string;
  bookable: boolean;
  /** key into the `types` map */
  type: string;
  instructor: string | null;
  myBookingId: string | null;
};

/** endsAt is startsAt plus the class type's length, so it is not sent per class. */
function endOf(
  s: ScheduleSession,
  types: Record<string, ScheduleClassType>,
): string {
  const start = new Date(s.startsAt);
  const mins = types[s.type]?.durationMin ?? 60;
  return new Date(start.getTime() + mins * 60_000).toISOString();
}

const LEVEL: Record<string, { en: string; el: string }> = {
  ALL: { en: "All levels", el: "Όλα τα επίπεδα" },
  BEGINNER: { en: "Beginner", el: "Αρχάριοι" },
  INTERMEDIATE: { en: "Intermediate", el: "Μεσαίο" },
  ADVANCED: { en: "Advanced", el: "Προχωρημένοι" },
};

export function ScheduleClient({
  sessions: initial,
  types,
  signedIn,
  credits,
  days,
}: {
  sessions: ScheduleSession[];
  types: Record<string, ScheduleClassType>;
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
  /* The class the member is looking at. Picking a time is a click, not a
     scroll: the times are chips on one or two lines and the detail below
     swaps in place. */
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const strip = useRef<HTMLDivElement | null>(null);
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

  /* Default to the first class of the day that can still be booked, so the
     detail panel is never empty and the common case is one click. */
  const picked =
    list.find((s) => s.id === pickedId) ??
    list.find((s) => s.bookable && s.spotsLeft > 0) ??
    list[0] ??
    null;

  useEffect(() => setPickedId(null), [activeDay, onlyAvailable]);

  /* The date strip holds four weeks, so it scrolls horizontally. The arrows
     move it a week at a time and keep the active chip in view. */
  function nudge(dir: -1 | 1) {
    const box = strip.current;
    if (!box) return;
    box.scrollBy({
      left: dir * Math.max(240, box.clientWidth * 0.8),
      behavior: "smooth",
    });
  }

  function stepDay(dir: -1 | 1) {
    const i = days.indexOf(activeDay);
    const next = days[i + dir];
    if (!next) return;
    setActiveDay(next);
    strip.current
      ?.querySelector<HTMLElement>(`[data-day="${next}"]`)
      ?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
  }

  const dayIndex = days.indexOf(activeDay);
  const canCancelPicked = picked
    ? new Date(picked.startsAt).getTime() - Date.now() >
      FREE_CANCELLATION_HOURS * 3600_000
    : false;

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
        flash({
          kind: "ok",
          text: `${t.booking.successTitle} ${t.booking.successBody}`,
        });
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
        error?: string;
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
          kind: "ok",
          text: `${t.booking.cancelled} ${t.booking.cancelRefund}`,
        });
        router.refresh();
      } else if (data.error === "TOO_LATE_TO_CANCEL") {
        flash({ kind: "warn", text: t.booking.cancelTooLate });
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
      {/* No enclosing bar: the balance and the two actions sit straight on the
          page, which keeps the eye on the dates below. */}
      <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        {signedIn ? (
          <p className="flex items-baseline gap-2.5">
            <span className="font-display text-3xl leading-none text-mocha-600">
              {balance}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-clay">
              {t.common.creditsLeft}
            </span>
          </p>
        ) : (
          <p className="text-[13px] text-mocha-500">
            {t.timetablePage.signedOut}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {signedIn ? (
            <ButtonLink href="/pricing" size="sm" variant="outline">
              {t.account.walletTopUp}
            </ButtonLink>
          ) : (
            <ButtonLink href="/login?next=/timetable" size="sm">
              {t.nav.login}
            </ButtonLink>
          )}
          <button
            onClick={() => setOnlyAvailable((v) => !v)}
            className={cn(
              "rounded-full border px-4 py-2 text-[10px] uppercase tracking-widest transition-all duration-500",
              onlyAvailable
                ? "border-mocha-600 bg-mocha-600 text-cream"
                : "border-mocha-300 text-mocha-500 hover:border-mocha-500",
            )}
          >
            {onlyAvailable
              ? t.timetablePage.filterAvailable
              : t.timetablePage.filterAll}
          </button>
        </div>
      </div>

      {/* Date strip with arrows either side. */}
      <div className="mt-7 flex items-center gap-3">
        <StripArrow
          dir="prev"
          label={t.timetablePage.prevWeek}
          disabled={dayIndex <= 0}
          onClick={() => {
            stepDay(-1);
            nudge(-1);
          }}
        />

        <div
          ref={strip}
          className="no-scrollbar flex flex-1 gap-2 overflow-x-auto scroll-smooth py-1"
        >
          {days.map((d, i) => {
            const date = new Date(`${d}T12:00:00`);
            const count = (byDay.get(d) ?? []).filter(
              (x) => x.spotsLeft > 0 && x.bookable,
            ).length;
            const active = d === activeDay;
            return (
              <button
                key={d}
                data-day={d}
                onClick={() => setActiveDay(d)}
                className={cn(
                  "flex min-w-[84px] shrink-0 flex-col items-center rounded-2xl border px-4 py-3 transition-all duration-500 ease-silk",
                  active
                    ? "border-mocha-600 bg-mocha-600 text-cream"
                    : count === 0
                      ? "border-mocha-200/60 bg-white/40 text-mocha-400"
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
                <span className="mt-1 font-display text-2xl lining-nums tabular-nums">
                  {fmtDayNumber(date)}
                </span>
                <span
                  className={cn(
                    "mt-0.5 text-[9px] lining-nums tabular-nums",
                    active ? "text-cream/60" : "text-clay/70",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <StripArrow
          dir="next"
          label={t.timetablePage.nextWeek}
          disabled={dayIndex >= days.length - 1}
          onClick={() => {
            stepDay(1);
            nudge(1);
          }}
        />
      </div>

      {/* toast */}
      {toast && (
        <div
          className={cn(
            "animate-fade-up",
            "mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-4 text-sm",
            toast.kind === "ok" && "border-mocha-300 bg-white text-mocha-600",
            toast.kind === "warn" &&
              "border-gold/40 bg-[#FBF6E7] text-mocha-700",
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

      {/* Times as chips, then one detail panel. No long list to scroll. */}
      <div className="mt-8">
        <p className="eyebrow mb-5">
          {fmtLongDate(new Date(`${activeDay}T12:00:00`))}
        </p>

        {list.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-mocha-200 px-6 py-14 text-center text-sm text-clay">
            {t.timetablePage.noClasses}
          </p>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-4">
                {list.map((s) => {
                  const on = picked?.id === s.id;
                  const full = s.spotsLeft <= 0;
                  const mine = Boolean(s.myBookingId);
                  return (
                    <button
                      key={s.id}
                      onClick={() => setPickedId(s.id)}
                      aria-pressed={on}
                      className={cn(
                        "relative rounded-xl border py-2.5 text-center transition-all duration-400 ease-silk",
                        on
                          ? "border-mocha-600 bg-mocha-600 text-cream"
                          : full || !s.bookable
                            ? "border-mocha-200/60 bg-white/40 text-mocha-400"
                            : "border-mocha-200/70 bg-white/60 text-mocha-600 hover:border-mocha-500",
                      )}
                    >
                      <span className="block font-display text-lg leading-none lining-nums tabular-nums">
                        {fmtTime(s.startsAt)}
                      </span>
                      <span
                        className={cn(
                          "mt-1 block text-[9px] uppercase tracking-widest",
                          on ? "text-cream/60" : "text-clay/80",
                        )}
                      >
                        {full ? t.common.full : `${s.spotsLeft}/${s.capacity}`}
                      </span>
                      {mine && (
                        <span
                          aria-hidden
                          className={cn(
                            "absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full",
                            on ? "bg-cream" : "bg-mocha-600",
                          )}
                        />
                      )}
                    </button>
                  );
                })}
              </div>

              {picked && (
                <div
                  key={picked.id}
                  className="animate-fade-up rounded-3xl border border-mocha-200/70 bg-white/60 p-6 backdrop-blur-sm sm:p-7"
                >
                  <div className="flex flex-col gap-6">
                    <div>
                      <p className="font-display text-4xl lining-nums tabular-nums text-mocha-600">
                        {fmtTime(picked.startsAt)}
                        <span className="ml-2 align-middle text-base text-clay">
                          {fmtTime(endOf(picked, types))}
                        </span>
                      </p>
                      <p className="mt-3 text-[17px] text-mocha-600">
                        {el
                          ? types[picked.type].nameEl
                          : types[picked.type].nameEn}
                      </p>
                      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-clay">
                        <span className="uppercase tracking-widest">
                          {el
                            ? (LEVEL[types[picked.type].level]?.el ??
                              types[picked.type].level)
                            : (LEVEL[types[picked.type].level]?.en ??
                              types[picked.type].level)}
                        </span>
                        {picked.instructor && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-clay/50" />
                            <span>{picked.instructor}</span>
                          </>
                        )}
                        <span className="h-1 w-1 rounded-full bg-clay/50" />
                        <span
                          className={cn(
                            "lining-nums tabular-nums",
                            picked.spotsLeft <= 0
                              ? "text-red-600/80"
                              : "text-mocha-500",
                          )}
                        >
                          {picked.spotsLeft <= 0
                            ? t.common.full
                            : `${picked.spotsLeft}/${picked.capacity} ${t.common.spotsLeft}`}
                        </span>
                      </p>
                    </div>

                    <div className="flex flex-col items-stretch gap-3 border-t border-mocha-200/70 pt-5">
                      <span
                        aria-hidden
                        className="h-1 w-full overflow-hidden rounded-full bg-mocha-200"
                      >
                        <span
                          className="block h-full rounded-full bg-mocha-500 transition-all duration-700 ease-silk"
                          style={{
                            width: `${(picked.booked / picked.capacity) * 100}%`,
                          }}
                        />
                      </span>

                      {picked.myBookingId ? (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy === picked.id || !canCancelPicked}
                            onClick={() => cancel(picked)}
                          >
                            {busy === picked.id
                              ? t.common.loading
                              : t.account.cancelBooking}
                          </Button>
                          {!canCancelPicked && (
                            <span className="text-[10px] leading-snug text-clay">
                              {t.booking.cancelTooLate}
                            </span>
                          )}
                        </>
                      ) : !picked.bookable ? (
                        <span className="text-[10px] uppercase tracking-widest text-clay/70">
                          {t.booking.tooLate}
                        </span>
                      ) : picked.spotsLeft <= 0 ? (
                        <span className="text-[10px] uppercase tracking-widest text-clay/70">
                          {t.common.full}
                        </span>
                      ) : (
                        <Button
                          disabled={busy === picked.id}
                          onClick={() => book(picked)}
                        >
                          {busy === picked.id
                            ? t.booking.booking
                            : t.booking.bookNow}
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * A thin ring with a hand-drawn chevron. Two strokes rather than a glyph, so
 * the weight matches the hairline rules used everywhere else on the page.
 */
function StripArrow({
  dir,
  label,
  disabled,
  onClick,
}: {
  dir: "prev" | "next";
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        "group grid h-11 w-11 shrink-0 place-items-center rounded-full border transition-all duration-500 ease-silk",
        disabled
          ? "cursor-not-allowed border-mocha-200/50 text-mocha-300"
          : "border-mocha-300 text-mocha-500 hover:border-mocha-600 hover:bg-mocha-600 hover:text-cream",
      )}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className={cn(
          "h-4 w-4 transition-transform duration-500 ease-silk",
          dir === "prev"
            ? "group-hover:-translate-x-0.5"
            : "rotate-180 group-hover:translate-x-0.5",
        )}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinecap="round"
      >
        <path d="M14.5 4.5 7 12l7.5 7.5" />
        <path d="M18.5 12H7.4" />
      </svg>
    </button>
  );
}
