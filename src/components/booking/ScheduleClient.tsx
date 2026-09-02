"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";
import { isPersonalCancellable } from "@/lib/personal";
import { studioAddDays, studioDateKey, studioStartOfDay } from "@/lib/time";
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
  /** GROUP or PERSONAL. Changes the chip, the panel and both cutoffs. */
  kind: string;
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
  duetCredits = 0,
  soloCredits = 0,
  personalCredits = 0,
  days,
  closedDays,
}: {
  sessions: ScheduleSession[];
  types: Record<string, ScheduleClassType>;
  signedIn: boolean;
  credits: number;
  /** Sessions in hand that admit a second person. */
  duetCredits?: number;
  /** Sessions in hand for the hour alone. */
  soloCredits?: number;
  /** Both kinds together, for the balance line. */
  personalCredits?: number;
  days: string[]; // ISO date strings, one per day shown
  closedDays: Set<string>;
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
  /**
   * The appointment panel's two questions: how many of you, and who is the
   * second one.
   *
   * Kept here rather than inside the panel because the panel is re-keyed on
   * every change of class, which would wipe a half-typed name the moment the
   * member glanced at another hour. Reset when the day changes, which is the one
   * moment the answer is certainly stale.
   */
  const [twoOfUs, setTwoOfUs] = useState(false);
  const [guestName, setGuestName] = useState("");
  /**
   * A Duet is for two, so holding only a Duet decides the question.
   *
   * The two kinds do not substitute for each other in either direction, which
   * means the honest version of this control is not always a choice. Somebody
   * holding a Duet and nothing else is booking for two people whatever they
   * click, so the choice disappears and the name field is simply the next thing
   * to fill in. Somebody holding both gets the toggle. Somebody holding only a
   * Personal session is never asked.
   */
  const mustBringSomebody = duetCredits > 0 && soloCredits === 0;
  const canChoose = duetCredits > 0 && soloCredits > 0;
  const bringing = mustBringSomebody || (canChoose && twoOfUs);
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
  useEffect(() => {
    setTwoOfUs(false);
    setGuestName("");
  }, [activeDay]);

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
  const isPersonal = (s: ScheduleSession) =>
    types[s.type]?.kind === "PERSONAL";
  const pickedPersonal = picked ? isPersonal(picked) : false;

  /* The same split as the server: an appointment closes to cancellation at the
     end of the previous day, a class twelve hours before it starts. Getting
     this wrong would offer a Cancel button the API then refuses. */
  const canCancelPicked = picked
    ? pickedPersonal
      ? isPersonalCancellable(new Date(picked.startsAt))
      : new Date(picked.startsAt).getTime() - Date.now() >
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
        body: JSON.stringify({
          sessionId: s.id,
          /* Only when it is an appointment and they said two. Sending it for a
             group class would be meaningless, and sending an empty string would
             fail validation. */
          ...(isPersonal(s) && bringing && guestName.trim().length >= 2
            ? { guestName: guestName.trim() }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        bookingId?: string;
        credits?: number;
        error?: string;
        /** The last class date their sessions reach, on SESSIONS_EXPIRE_FIRST. */
        until?: string;
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
          text: isPersonal(s)
            ? `${t.booking.personalBooked} ${t.booking.personalBookedBody}`
            : `${t.booking.successTitle} ${t.booking.successBody}`,
        });
        setTwoOfUs(false);
        setGuestName("");
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

      /* Their sessions die before this class runs. Names the last date that
         would have worked, because a refusal that does not is a puzzle: the
         member can see a balance and cannot see why it will not reach. */
      if (data.error === "SESSIONS_EXPIRE_FIRST") {
        flash({
          kind: "warn",
          text: t.booking.sessionsExpireFirst.replace(
            "{date}",
            data.until ? fmtLongDate(new Date(data.until)) : "",
          ),
          cta: { href: "/pricing", label: t.booking.noCreditsCta },
        });
        return;
      }

      /* They have sessions — just not any that can pay for a class on this date.
         Telling them "no sessions" while their balance plainly reads 1 is how a
         site loses somebody's trust in a single sentence. */
      if (data.error === "CREDITS_NOT_VALID_HERE") {
        flash({
          kind: "warn",
          text: t.booking.creditsNotValidHere,
          cta: { href: "/pricing", label: t.booking.noCreditsCta },
        });
        return;
      }
      /* Holding class sessions and asking for a midday hour, or asking for two
         people on a session that admits one. Both send them to the price list,
         because in both cases the fix is a purchase and not an explanation. */
      if (
        data.error === "NEEDS_PERSONAL_CREDIT" ||
        data.error === "NEEDS_DUET_CREDIT" ||
        data.error === "DUET_IS_FOR_TWO"
      ) {
        flash({
          kind: "warn",
          text:
            data.error === "NEEDS_DUET_CREDIT"
              ? t.booking.needsDuet
              : data.error === "DUET_IS_FOR_TWO"
                ? t.booking.duetIsForTwo
                : t.booking.needsPersonal,
          cta: { href: "/pricing", label: t.booking.noCreditsCta },
        });
        return;
      }

      /* An account that never confirmed its email. Given a way forward rather
         than a refusal: the code box is one press away, and the alternative is
         somebody staring at "you cannot book" with no idea why. */
      if (data.error === "EMAIL_UNVERIFIED") {
        flash({
          kind: "warn",
          text: t.booking.unverified,
          cta: { href: "/verify?next=/timetable", label: t.booking.unverifiedCta },
        });
        return;
      }

      /* Signed up after the studio started asking, and has not answered yet.
         Same shape as the unverified case above and for the same reason: this
         is a step to finish, not a refusal, so it comes with the way to finish
         it rather than an explanation of why the button did nothing. */
      if (data.error === "INTAKE_REQUIRED") {
        flash({
          kind: "warn",
          text: t.booking.intakeNeeded,
          cta: {
            href: "/welcome?next=/timetable",
            label: t.booking.intakeNeededCta,
          },
        });
        return;
      }

      const messages: Record<string, string> = {
        CLASS_FULL: t.booking.classFull,
        ALREADY_BOOKED: t.booking.alreadyBooked,
        TOO_LATE: t.booking.tooLate,
        PERSONAL_TOO_LATE: t.booking.personalTooLate,
        ONE_PER_DAY: t.booking.onePerDay,
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
          <p className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
            <span className="font-display text-3xl leading-none text-mocha-600">
              {balance}
            </span>
            <span className="text-[10px] uppercase tracking-widest text-clay">
              {t.common.creditsLeft}
            </span>
            {/* Broken out because the total is not one balance. A member
                holding five class sessions and one personal who reads "6" and
                then cannot book two of the classes in front of them has been
                misled by the headline figure on this very page. */}
            {personalCredits > 0 && (
              <span className="rounded-full border border-gold/50 bg-[#FBF6E7]/70 px-2.5 py-1 text-[10px] uppercase tracking-widest text-[#8a6f1a]">
                {t.booking.personalHeld.replace("{n}", String(personalCredits))}
              </span>
            )}
          </p>
        ) : (
          <p className="text-[13px] text-mocha-500">
            {t.timetablePage.signedOut}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {signedIn ? (
            /* Filled rather than outlined. It is the one thing on this row a
               member ever needs to act on, and beside a hairline filter pill it
               was the same weight as a control that does nothing but hide
               classes. */
            <ButtonLink href="/pricing" size="sm">
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
            const isSunday = date.getDay() === 0;
            const isClosedDay = closedDays.has(d);
            const closed = isSunday || isClosedDay;
            const todayKey = studioDateKey(studioStartOfDay(new Date()));
            const tomorrowKey = studioDateKey(studioAddDays(studioStartOfDay(new Date()), 1));
            const isToday = d === todayKey;
            const isTomorrow = d === tomorrowKey;

            return (
              <button
                key={d}
                data-day={d}
                onClick={() => setActiveDay(d)}
                className={cn(
                  "flex min-w-[84px] shrink-0 flex-col items-center rounded-2xl border px-4 py-3 transition-all duration-500 ease-silk",
                  active
                    ? "border-mocha-600 bg-mocha-600 text-cream"
                    : closed
                      ? "border-dashed border-mocha-200/80 bg-white/40 text-mocha-400"
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
                  {isToday
                    ? t.common.today
                    : isTomorrow
                      ? t.common.tomorrow
                      : isSunday
                        ? t.home.timetable.sunday
                        : isClosedDay
                          ? t.home.timetable.closed
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
                  {closed ? t.home.timetable.closed : count}
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
            {new Date(`${activeDay}T12:00:00`).getDay() === 0 || closedDays.has(activeDay)
              ? t.home.timetable.closed
              : t.timetablePage.noClasses}
          </p>
        ) : (
          <>
            <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start lg:gap-8">
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-4">
                {list.map((s) => {
                  const on = picked?.id === s.id;
                  const full = s.spotsLeft <= 0;
                  const mine = Boolean(s.myBookingId);
                  const solo = isPersonal(s);
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
                            : /* Appointments carry the studio's gold rather than
                                 the ordinary hairline. They are a different
                                 thing at a different price, and three chips in
                                 the middle of a column of fourteen identical
                                 ones would otherwise be found by accident. */
                              solo
                              ? "border-gold/60 bg-[#FBF6E7]/70 text-mocha-600 hover:border-gold"
                              : "border-mocha-200/70 bg-white/60 text-mocha-600 hover:border-mocha-500",
                      )}
                    >
                      <span className="block font-display text-lg leading-none lining-nums tabular-nums">
                        {fmtTime(s.startsAt)}
                      </span>
                      <span
                        className={cn(
                          "mt-1 block text-[9px] uppercase tracking-widest",
                          on ? "text-cream/60" : solo ? "text-[#8a6f1a]" : "text-clay/80",
                        )}
                      >
                        {/* "1/1" is not a number anybody needs. One reformer is
                            either free or it is not. */}
                        {solo
                          ? full
                            ? t.common.full
                            : t.booking.personalChip
                          : full
                            ? t.common.full
                            : `${s.spotsLeft}/${s.capacity}`}
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
                        {pickedPersonal ? (
                          <span className="uppercase tracking-widest text-[#8a6f1a]">
                            {t.booking.personalTag}
                          </span>
                        ) : (
                          <span className="uppercase tracking-widest">
                            {el
                              ? (LEVEL[types[picked.type].level]?.el ??
                                types[picked.type].level)
                              : (LEVEL[types[picked.type].level]?.en ??
                                types[picked.type].level)}
                          </span>
                        )}
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
                            ? pickedPersonal
                              ? t.booking.personalTaken
                              : t.common.full
                            : pickedPersonal
                              ? t.booking.personalFree
                              : `${picked.spotsLeft}/${picked.capacity} ${t.common.spotsLeft}`}
                        </span>
                      </p>

                      {/* What the hour is, and what it costs, said once. A
                          member who has never bought one of these has no idea
                          from the chip alone that it is not an ordinary class
                          at an odd time. */}
                      {pickedPersonal && (
                        <p className="mt-4 rounded-2xl border border-gold/40 bg-[#FBF6E7]/60 px-4 py-3 text-[12px] leading-relaxed text-mocha-600">
                          {t.booking.personalExplainer}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-stretch gap-3 border-t border-mocha-200/70 pt-5">
                      {/* A fill bar over one reformer is either empty or full,
                          which is a graph of a boolean. Only drawn for classes,
                          where it says something. */}
                      {!pickedPersonal && (
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
                      )}

                      {/**
                        * How many of you, asked before the button and not after.
                        *
                        * Only shown to somebody holding a duet session. Offering
                        * "two of us" to a member who cannot pay for two is an
                        * invitation to type a friend's name and be told no, and
                        * the refusal would arrive after the decision rather than
                        * before it. Somebody who has not bought one yet reads the
                        * explainer above instead, which says what a duet is.
                        */}
                      {pickedPersonal &&
                        !picked.myBookingId &&
                        picked.bookable &&
                        picked.spotsLeft > 0 &&
                        duetCredits > 0 && (
                          <div className="rounded-2xl border border-mocha-200/70 bg-white/70 p-4">
                            <p className="text-[10px] uppercase tracking-widest text-clay">
                              {t.booking.whoIsComing}
                            </p>

                            {canChoose ? (
                              <div className="mt-3 flex gap-2">
                                {[false, true].map((two) => (
                                  <button
                                    key={String(two)}
                                    type="button"
                                    onClick={() => setTwoOfUs(two)}
                                    aria-pressed={twoOfUs === two}
                                    className={cn(
                                      "flex-1 rounded-xl border px-3 py-2 text-[12px] transition-all duration-400",
                                      twoOfUs === two
                                        ? "border-mocha-600 bg-mocha-600 text-cream"
                                        : "border-mocha-200/70 bg-white/60 text-mocha-600 hover:border-mocha-400",
                                    )}
                                  >
                                    {two ? t.booking.twoOfUs : t.booking.justMe}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              /* No choice to offer: a Duet is what they hold, a
                                 Duet is for two. Say so instead of showing a
                                 toggle where one option would be refused. */
                              <p className="mt-2 text-[12px] leading-relaxed text-mocha-600">
                                {t.booking.duetForcedNote}
                              </p>
                            )}

                            {bringing && (
                              <div className="mt-3">
                                <label className="label" htmlFor="guest">
                                  {t.booking.guestLabel}
                                </label>
                                <input
                                  id="guest"
                                  className="input"
                                  value={guestName}
                                  maxLength={80}
                                  autoComplete="off"
                                  onChange={(e) => setGuestName(e.target.value)}
                                  placeholder={t.booking.guestPlaceholder}
                                />
                                <p className="mt-2 text-[10px] leading-snug text-clay">
                                  {t.booking.guestHint}
                                </p>
                              </div>
                            )}
                          </div>
                        )}

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
                              {pickedPersonal
                                ? t.booking.personalCancelTooLate
                                : t.booking.cancelTooLate}
                            </span>
                          )}
                        </>
                      ) : !picked.bookable ? (
                        <span className="text-[10px] uppercase tracking-widest text-clay/70">
                          {pickedPersonal
                            ? t.booking.personalTooLate
                            : t.booking.tooLate}
                        </span>
                      ) : picked.spotsLeft <= 0 ? (
                        <span className="text-[10px] uppercase tracking-widest text-clay/70">
                          {pickedPersonal
                            ? t.booking.personalTaken
                            : t.common.full}
                        </span>
                      ) : (
                        <>
                          <Button
                            disabled={
                              busy === picked.id ||
                              /* A duet with nobody named is a booking the
                                 instructor cannot prepare for. */
                              (pickedPersonal &&
                                bringing &&
                                guestName.trim().length < 2)
                            }
                            onClick={() => book(picked)}
                          >
                            {busy === picked.id
                              ? t.booking.booking
                              : pickedPersonal
                                ? t.booking.bookPersonal
                                : t.booking.bookNow}
                          </Button>
                          {pickedPersonal && (
                            <span className="text-[10px] leading-snug text-clay">
                              {t.booking.personalCutoff}
                            </span>
                          )}
                        </>
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
