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
  /** The second person on a duet. Not a member, so this is the only record. */
  guestName: string | null;
};

type SessionRow = {
  id: string;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: string;
  className: { en: string; el: string };
  /** GROUP or PERSONAL. */
  kind: string;
  instructor: string | null;
  instructorId: string | null;
  attendees: Attendee[];
};

/** One name the desk may put on a class. */
type Teacher = { id: string; name: string };

/** One personal or duet hour somebody still has to be found to teach. */
type Appointment = {
  bookingId: string;
  startsAt: string;
  endsAt: string;
  guestName: string | null;
  name: string;
  email: string;
  phone: string | null;
  instructor: string | null;
  instructorId: string | null;
  sessionId: string;
  seats: number;
};

export function BookingsPanel({ onNotice }: { onNotice: (s: string) => void }) {
  const { t, locale, fmtTime, fmtLongDate } = useI18n();
  const d = t.desk;
  const el = locale === "el";

  /* "Tuesday 2 September, 12:00" in one string. The appointment list spans
     three weeks, so a bare time would be ambiguous on every row of it. */
  const fmtDayTime = (iso: string) =>
    `${fmtLongDate(new Date(iso))}, ${fmtTime(iso)}`;

  const today = dayKey(new Date());
  const [day, setDay] = useState(today);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async (date: string) => {
    setSessions(null);
    const res = await fetch(`/api/admin/day?date=${date}`);
    if (!res.ok) {
      setSessions([]);
      return;
    }
    const data = (await res.json()) as {
      sessions: SessionRow[];
      appointments?: Appointment[];
      instructors?: Teacher[];
    };
    setSessions(data.sessions ?? []);
    setAppointments(data.appointments ?? []);
    setTeachers(data.instructors ?? []);
  }, []);

  useEffect(() => {
    void load(day);
  }, [day, load]);

  function shift(days: number) {
    const next = new Date(`${day}T12:00:00`);
    next.setDate(next.getDate() + days);
    setDay(dayKey(next));
  }

  /**
   * Put somebody on a class, or take them off it.
   *
   * One class, never the weekly rota: the reason this control exists is that an
   * instructor is ill *today*, and a tool that edited the template would fix one
   * Tuesday by rewriting every Tuesday.
   *
   * The whole day is reloaded afterwards rather than the one row patched, because
   * the answer includes how many members were told, and that number depends on
   * what the server decided rather than on what was clicked.
   */
  async function assign(sessionId: string, instructorId: string | null) {
    setBusy(sessionId);
    try {
      const res = await fetch("/api/admin/instructor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, instructorId }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        instructor?: string | null;
        previous?: string | null;
        told?: number;
      };
      if (!res.ok) {
        onNotice(t.common.somethingWrong);
        return;
      }
      /* Said out loud, because a swap on a booked class writes to members and
         whoever pressed it should know that it did. */
      const told = data.told ?? 0;
      onNotice(
        told > 0
          ? d.instructorToldMembers
              .replace("{name}", data.instructor ?? "")
              .replace("{n}", String(told))
          : data.instructor
            ? d.instructorSet.replace("{name}", data.instructor)
            : d.instructorCleared,
      );
      await load(day);
    } finally {
      setBusy(null);
    }
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

  /**
   * The picker.
   *
   * A plain select and not a modal or a search box. There are four instructors,
   * the desk is often being used one-handed at a counter with somebody waiting,
   * and the fastest possible version of "who is taking this" is a list of four
   * names that opens where the finger already is.
   */
  /**
   * Book a member into this class, from the desk.
   *
   * Why it is on the class row rather than on the member's page: the question
   * that starts this is always about the *class*. Reception is looking at a
   * Tuesday with three people in one class and one in another, and is ringing
   * round to fill the quiet one. Starting from the member would mean finding the
   * class again afterwards.
   *
   * The search is by name, email or phone, which is how somebody rings up: they
   * give a name, or the desk has their number on the screen from the call.
   */
  function BookMember({
    sessionId,
    full,
    personal,
  }: {
    sessionId: string;
    /** No places left. The control is not offered rather than offered and refused. */
    full: boolean;
    /** A duet may carry a second name, exactly as on the member's own screen. */
    personal: boolean;
  }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState("");
    const [hits, setHits] = useState<
      { id: string; name: string; email: string; phone: string | null; credits: number }[]
    >([]);
    const [looking, setLooking] = useState(false);
    const [guest, setGuest] = useState("");
    const [sending, setSending] = useState<string | null>(null);

    /* Searched on demand rather than as they type. The membership is small and
       the desk is on the telephone: a button they press when they have finished
       typing a name beats a request per keystroke, and cannot half-load. */
    async function search() {
      if (q.trim().length < 2) return;
      setLooking(true);
      try {
        const res = await fetch(
          `/api/admin/members?q=${encodeURIComponent(q.trim())}&filter=real`,
        );
        const data = (await res.json()) as {
          members?: {
            id: string;
            name: string;
            email: string;
            phone: string | null;
            credits: number;
          }[];
        };
        setHits((data.members ?? []).slice(0, 6));
      } catch {
        setHits([]);
      }
      setLooking(false);
    }

    async function book(userId: string, name: string) {
      setSending(userId);
      try {
        const res = await fetch("/api/admin/bookings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            userId,
            guestName: personal && guest.trim() ? guest.trim() : null,
          }),
        });
        const data = (await res.json()) as { ok?: boolean; error?: string };
        if (data.ok) {
          onNotice(`${name}: ${d.deskBooked}`);
          setOpen(false);
          setQ("");
          setHits([]);
          setGuest("");
          await load(day);
        } else {
          /* The code, said as a sentence. "No sessions left" and "that class is
             full" send the person at the desk in completely different
             directions, so a single "could not book" would be useless. */
          onNotice(`${name}: ${d.deskBookErrors[data.error ?? ""] ?? data.error}`);
        }
      } catch {
        onNotice(d.deskBookErrors.FAILED);
      }
      setSending(null);
    }

    if (full) return null;

    if (!open) {
      return (
        <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
          {d.deskBookCta}
        </Button>
      );
    }

    return (
      <div className="mt-5 rounded-2xl border border-mocha-200 bg-white/70 p-4">
        <p className="text-[12px] text-mocha-700">{d.deskBookTitle}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-clay">
          {d.deskBookWhy}
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          <input
            autoFocus
            className="input flex-1 min-w-[12rem]"
            placeholder={d.deskBookSearch}
            value={q}
            onChange={(e) => setQ(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void search();
              }
            }}
          />
          <Button size="sm" variant="outline" onClick={() => void search()}>
            {looking ? t.common.loading : d.deskBookFind}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            {t.common.cancel}
          </Button>
        </div>

        {personal && (
          <input
            className="input mt-2"
            placeholder={d.deskBookGuest}
            value={guest}
            onChange={(e) => setGuest(e.currentTarget.value)}
          />
        )}

        {hits.length > 0 && (
          <ul className="mt-3 divide-y divide-mocha-200/70">
            {hits.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <span>
                  <span className="text-[13px] text-mocha-600">{m.name}</span>
                  <span className="ml-3 text-[11px] text-clay">
                    {m.phone ?? m.email}
                  </span>
                  {/* The balance, on the row, before the button is pressed. A
                      member with none will be refused, and knowing that while
                      they are still on the telephone is the difference between
                      selling them a pack and ringing them back. */}
                  <span
                    className={cn(
                      "ml-3 rounded-full px-2 py-0.5 text-[10px] lining-nums tabular-nums",
                      m.credits > 0
                        ? "bg-mocha-100 text-mocha-600"
                        : "bg-red-50 text-red-700",
                    )}
                  >
                    {m.credits} {t.common.credits}
                  </span>
                </span>
                <Button
                  size="sm"
                  disabled={sending === m.id}
                  onClick={() => void book(m.id, m.name)}
                >
                  {sending === m.id ? t.common.loading : d.deskBookAdd}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {!looking && hits.length === 0 && q.trim().length >= 2 && (
          <p className="mt-3 text-[12px] text-clay">{d.deskBookNobody}</p>
        )}
      </div>
    );
  }

  function TeacherPicker({
    sessionId,
    current,
  }: {
    sessionId: string;
    current: string | null;
  }) {
    return (
      <select
        aria-label={d.instructorLabel}
        value={current ?? ""}
        disabled={busy === sessionId || teachers.length === 0}
        onChange={(e) => void assign(sessionId, e.target.value || null)}
        className={cn(
          "rounded-full border bg-white/80 px-3 py-1.5 text-[11px] text-mocha-600 transition-colors",
          current
            ? "border-mocha-300"
            : /* Nobody on it yet, which on an appointment is the thing somebody
                 has to act on. Gold, like the block it sits in. */
              "border-gold/60 bg-[#FBF6E7] text-[#8a6f1a]",
          "disabled:opacity-50",
        )}
      >
        <option value="">{d.instructorNeeded}</option>
        {teachers.map((x) => (
          <option key={x.id} value={x.id}>
            {x.name}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="mt-10">
      {/**
        * Appointments first, and above the day control on purpose.
        *
        * This panel answers "who is in today". An appointment asks the opposite
        * question: an hour in the middle of a weekday that nobody is rostered
        * for, which somebody has to ring an instructor about before it arrives.
        * Answering that by opening tomorrow, then the day after, then Thursday,
        * is exactly how an hour gets missed.
        *
        * Not a tab of its own. Reception opens this screen first, so the thing
        * that needs a phone call is the first thing on it, and nothing new has
        * to be learned or remembered to find it. It disappears entirely when
        * there is nothing booked, which is most of the time.
        */}
      {appointments.length > 0 && (
        <section className="mb-6 rounded-3xl border border-gold/50 bg-[#FBF6E7]/70 p-6">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-[13px] uppercase tracking-widest text-mocha-600">
              {d.appointmentsTitle}
            </h3>
            <p className="text-[11px] text-clay">{d.appointmentsNote}</p>
          </div>

          <ul className="mt-5 divide-y divide-gold/30">
            {appointments.map((a) => (
              <li
                key={a.bookingId}
                className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-3"
              >
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-display text-lg text-mocha-600 lining-nums tabular-nums">
                    {fmtDayTime(a.startsAt)}
                  </span>
                  <span className="rounded-full bg-mocha-600/90 px-2 py-0.5 text-[9px] uppercase tracking-widest text-cream">
                    {a.seats > 1 ? d.duet : d.personal}
                  </span>
                </span>

                <span className="flex flex-1 flex-wrap items-baseline gap-x-3">
                  <span className="text-[14px] text-mocha-600">
                    {a.guestName ? `${a.name} + ${a.guestName}` : a.name}
                  </span>
                  <span className="text-[12px] text-clay">
                    {a.phone ?? a.email}
                  </span>
                </span>

                <TeacherPicker
                  sessionId={a.sessionId}
                  current={a.instructorId}
                />
              </li>
            ))}
          </ul>
        </section>
      )}

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
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-clay">
                      {s.kind === "PERSONAL" && (
                        <span className="rounded-full bg-gold/25 px-2 py-0.5 text-[9px] uppercase tracking-widest text-[#8a6f1a]">
                          {d.personal}
                        </span>
                      )}
                      <span>
                        {el ? s.className.el : s.className.en}
                        {s.status === "CANCELLED" ? ` · ${d.cancelled}` : ""}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    {/* Reassignable on a class as well as an appointment: an
                        instructor calling in ill is the ordinary case, and it
                        needs fixing on one day rather than on the rota. */}
                    {s.status !== "CANCELLED" && (
                      <TeacherPicker sessionId={s.id} current={s.instructorId} />
                    )}
                    <p className="text-[11px] uppercase tracking-widest text-clay lining-nums tabular-nums">
                      {live.length}/{s.capacity}
                    </p>
                  </div>
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
                          {/* The second person, who has no account and no other
                              record anywhere. Whoever opens the door needs to be
                              expecting two. */}
                          {a.guestName && (
                            <span className="ml-2 rounded-full bg-gold/25 px-2 py-0.5 text-[10px] text-[#8a6f1a]">
                              + {a.guestName}
                            </span>
                          )}
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

                {/* Only where a booking could actually be taken. A cancelled
                    class and a full one both mean the control has nothing to
                    offer, and offering it anyway would end in a refusal the
                    desk had no way to see coming. */}
                {s.status !== "CANCELLED" && live.length < s.capacity && (
                  <div className="mt-4">
                    <BookMember
                      sessionId={s.id}
                      full={live.length >= s.capacity}
                      personal={s.kind === "PERSONAL"}
                    />
                  </div>
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
