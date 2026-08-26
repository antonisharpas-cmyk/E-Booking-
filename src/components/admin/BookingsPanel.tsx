"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { DateField, dayKey } from "@/components/ui/DateField";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

/**
 * Who is booked, on any day.
 *
 * The desk spends as much of its time answering "who is in on Saturday" as it
 * does checking people in this morning, so the day is a control rather than a
 * given: arrows for the day either side, a calendar for anywhere else, and Today
 * to come back. The day is always shown in words — nobody should have to work
 * out whether 08/09 is August or September. Attendance can be marked from here
 * for classes that have already run.
 */

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

export function BookingsPanel({ onNotice }: { onNotice: (s: string) => void }) {
  const { t, locale, fmtTime } = useI18n();
  const d = t.desk;
  const el = locale === "el";

  const today = dayKey(new Date());
  const [day, setDay] = useState(today);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (date: string) => {
    setSessions(null);
    const res = await fetch(`/api/admin/day?date=${date}`);
    if (!res.ok) {
      setSessions([]);
      return;
    }
    const data = (await res.json()) as { sessions: SessionRow[] };
    setSessions(data.sessions ?? []);
  }, []);

  useEffect(() => {
    void load(day);
  }, [day, load]);

  function shift(days: number) {
    const next = new Date(`${day}T12:00:00`);
    next.setDate(next.getDate() + days);
    setDay(dayKey(next));
  }

  async function mark(
    bookingId: string,
    status: "ATTENDED" | "NO_SHOW" | "CONFIRMED",
  ) {
    setBusy(bookingId);
    try {
      const res = await fetch("/api/admin/attendance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, status }),
      });
      if (!res.ok) {
        onNotice(t.common.somethingWrong);
        return;
      }
      await load(day);
    } finally {
      setBusy(null);
    }
  }

  const booked = (sessions ?? []).reduce(
    (n, s) => n + s.attendees.filter((a) => a.status !== "CANCELLED").length,
    0,
  );

  return (
    <div className="mt-10">
      {/* the day */}
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-mocha-200/70 bg-white/60 p-4">
        <button
          onClick={() => shift(-1)}
          aria-label={d.dayBefore}
          className="grid h-10 w-10 place-items-center rounded-full border border-mocha-200 text-mocha-500 transition-colors hover:border-mocha-500"
        >
          <Chevron className="rotate-90" />
        </button>
        <button
          onClick={() => shift(1)}
          aria-label={d.dayAfter}
          className="grid h-10 w-10 place-items-center rounded-full border border-mocha-200 text-mocha-500 transition-colors hover:border-mocha-500"
        >
          <Chevron className="-rotate-90" />
        </button>

        {/* The day in words, and the way to change it. A calendar rather than
            a typed date: the browser's own field reads dd/mm/yyyy on this
            machine and mm/dd/yyyy on another, and "which day am I looking at"
            is the one question this screen must never leave open. */}
        <DateField
          className="w-[16.5rem]"
          value={day}
          onChange={setDay}
          placeholder={d.pickDay}
        />

        {day !== today && (
          <Button size="sm" variant="ghost" onClick={() => setDay(today)}>
            {t.common.today}
          </Button>
        )}

        <p className="ml-auto text-[11px] uppercase tracking-widest text-clay">
          {booked} {d.bookedThatDay}
        </p>
      </div>

      {/* the classes */}
      {sessions === null ? (
        <p className="mt-8 text-center text-sm text-clay">{t.common.loading}</p>
      ) : sessions.length === 0 ? (
        <p className="mt-8 rounded-2xl border border-dashed border-mocha-200 px-6 py-14 text-center text-sm text-clay">
          {d.noClassesThatDay}
        </p>
      ) : (
        <ul className="mt-6 space-y-4">
          {sessions.map((s) => {
            const live = s.attendees.filter((a) => a.status !== "CANCELLED");
            return (
              <li
                key={s.id}
                className={cn(
                  "rounded-3xl border bg-white/60 p-6",
                  s.status === "CANCELLED"
                    ? "border-dashed border-mocha-200 opacity-70"
                    : "border-mocha-200/70",
                )}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-4">
                  <div>
                    <p className="font-display text-2xl text-mocha-600 lining-nums tabular-nums">
                      {fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}
                    </p>
                    <p className="mt-1 text-[12px] text-clay">
                      {el ? s.className.el : s.className.en}
                      {s.instructor ? ` · ${s.instructor}` : ""}
                      {s.status === "CANCELLED" ? ` · ${d.cancelled}` : ""}
                    </p>
                  </div>
                  <p className="text-[11px] uppercase tracking-widest text-clay lining-nums tabular-nums">
                    {live.length}/{s.capacity}
                  </p>
                </div>

                {live.length === 0 ? (
                  <p className="mt-5 text-sm text-clay">{d.nobodyBooked}</p>
                ) : (
                  <ul className="mt-5 divide-y divide-mocha-200/70">
                    {live.map((a) => (
                      <li
                        key={a.bookingId}
                        className="flex flex-wrap items-center justify-between gap-3 py-3"
                      >
                        <span>
                          <span className="text-[14px] text-mocha-600">
                            {a.name}
                          </span>
                          <span className="ml-3 text-[12px] text-clay">
                            {a.phone ?? a.email}
                          </span>
                          {a.status !== "CONFIRMED" && (
                            <span className="ml-3 rounded-full bg-mocha-100 px-2 py-0.5 text-[10px] uppercase tracking-widest text-mocha-500">
                              {a.status === "ATTENDED"
                                ? d.attended
                                : a.status === "NO_SHOW"
                                  ? d.noShow
                                  : a.status}
                            </span>
                          )}
                        </span>

                        <span className="flex gap-2">
                          <Button
                            size="sm"
                            variant={
                              a.status === "ATTENDED" ? "solid" : "outline"
                            }
                            disabled={busy === a.bookingId}
                            onClick={() => void mark(a.bookingId, "ATTENDED")}
                          >
                            {d.attended}
                          </Button>
                          <Button
                            size="sm"
                            variant={a.status === "NO_SHOW" ? "solid" : "ghost"}
                            disabled={busy === a.bookingId}
                            onClick={() => void mark(a.bookingId, "NO_SHOW")}
                          >
                            {d.noShow}
                          </Button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 12 8"
      aria-hidden
      className={cn("h-2.5 w-2.5", className)}
    >
      <path
        d="M1 1l5 5 5-5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
