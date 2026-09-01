"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import {
  ProfilePanel,
  type ProfileValues,
} from "@/components/account/ProfilePanel";
import { Monogram } from "@/components/ui/Monogram";
import { Reveal } from "@/components/ui/Reveal";
import { Section } from "@/components/ui/Section";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";
import {
  AccountTabs,
  isAccountTab,
  type AccountTab,
} from "@/components/account/AccountTabs";
import { NoticeList, type NoticePageProps } from "@/components/account/NoticeList";
import { signOutAndGoHome } from "@/lib/sign-out";

type BookingRow = {
  id: string;
  status: string;
  creditRefunded: boolean;
  startsAt: string;
  endsAt: string;
  className: { en: string; el: string };
  instructor: string | null;
  freeCancellationUntil: string;
  /** GROUP or PERSONAL. */
  kind: string;
  /** The second person on a duet, when there is one. */
  guestName: string | null;
};

type Props = {
  user: {
    name: string;
    email: string;
    phone: string | null;
    role: string;
    createdAt: string;
  };
  wallet: {
    available: number;
    /** Only the sessions that buy a place in a group class. */
    classCredits: number;
    /** Appointment sessions for the hour alone. */
    soloCredits: number;
    /** Appointment sessions that admit a second person. */
    duetCredits: number;
    nextExpiry: string | null;
    nextExpiryCredits: number;
    batches: {
      id: string;
      creditsRemaining: number;
      creditsTotal: number;
      usableFrom: string | null;
      usableTo: string | null;
      expiresAt: string | null;
      source: string;
    }[];
  };
  classesTaken: number;
  profile: ProfileValues;
  upcoming: BookingRow[];
  past: BookingRow[];
  purchases: {
    id: string;
    credits: number;
    amountCents: number;
    status: string;
    provider: string;
    createdAt: string;
    paidAt: string | null;
    packageName: { en: string; el: string } | null;
  }[];
  ledger: {
    id: string;
    delta: number;
    reason: string;
    note: string | null;
    createdAt: string;
  }[];
  notices: NoticePageProps;
  /** VAPID public key, so the notifications tab can offer push. */
  pushPublicKey: string;
};

const REASON: Record<string, { en: string; el: string }> = {
  PURCHASE: { en: "Pack purchased", el: "Αγορά πακέτου" },
  BOOKING: { en: "Class booked", el: "Κράτηση μαθήματος" },
  CANCELLATION_REFUND: { en: "Cancellation refund", el: "Επιστροφή ακύρωσης" },
  ADMIN_GRANT: { en: "Studio adjustment", el: "Διόρθωση στούντιο" },
  EXPIRY: { en: "Credits expired", el: "Λήξη credits" },
};

export function AccountBody(props: Props) {
  const {
    t,
    locale,
    fmtShortDate,
    fmtDayMonth,
    fmtFullDate,
    fmtMonthYear,
    fmtTime,
    fmtMoney,
  } = useI18n();
  const router = useRouter();
  const el = locale === "el";

  const [busy, setBusy] = useState<string | null>(null);
  /* Which sub-section is open. Everything stays on one page and one route:
     the wallet at the top is what a member came for, and losing it behind a
     navigation on every tab would be worse than the scroll it saves.

     The section is addressable all the same — ?tab=payments — because the menu
     under the face in the header links straight into each one. */
  const params = useSearchParams();
  const requested = params.get("tab");
  const [tab, setTab] = useState<AccountTab>(
    isAccountTab(requested) ? requested : "profile",
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<BookingRow | null>(null);

  /* The address is the truth about which section is showing.
     This used to ignore anything that was not a valid tab name, which quietly
     included *no* tab name at all — so arriving at plain /account from
     /account?tab=notifications changed the address and left the old section on
     screen. Clicking Profile in the header landed on Notifications. No tab, and
     an unrecognised tab, both mean Profile. */
  useEffect(() => {
    setTab(isAccountTab(requested) ? requested : "profile");
  }, [requested]);

  /**
   * Where the page lands, and it is one rule with two halves.
   *
   * **Profile lands at the top.** Profile is not really a section somebody goes
   * looking for: it is the default, and it is what the member's own photograph
   * points at. Somebody opening their account came to see their balance, and the
   * balance is above everything. So Profile and plain `/account` behave
   * identically, which is what they mean identically.
   *
   * **Every other section puts the pill bar at the top of the screen**, directly
   * under the header, with the panel they asked for beneath it. Anything else
   * leaves the right pill highlighted below the fold, and the member concludes
   * the menu item did nothing.
   *
   * ---
   *
   * **Why it places itself twice.**
   *
   * One `requestAnimationFrame` and a smooth `scrollIntoView` was the old
   * version, and it was right in principle and unreliable in practice. The
   * target's position is measured one frame after mount, and things above it are
   * still settling: a web font swapping in, an avatar arriving, a reveal
   * animation finishing. The scroll then glides to a position that was true when
   * it started and is not true when it stops, landing tens or hundreds of pixels
   * off, and always by an amount that depends on how much history the member has,
   * which is why it can look fine on one account and wrong on another.
   *
   * So the placement is instant and then checked twice. Instant, because a
   * smooth scroll cannot be corrected while it is still gliding: measuring
   * mid-flight gives a number that is wrong in a different way. It is also the
   * better behaviour on a page the member is arriving at rather than already
   * reading, since animating down a page they never saw is theatre. Two later
   * passes measure where the bar actually ended up and nudge it if it has drifted
   * more than a few pixels, which is invisible when nothing moved.
   *
   * One known drift, and the reason the later passes exist at all: the header is
   * sticky and shrinks from 103 pixels to 71 once the page is scrolled, over a
   * CSS transition of about four tenths of a second. The document moves up by
   * those 32 pixels while the transition runs, so a measurement taken at the
   * start of it is wrong by up to 32 and a measurement taken during it is wrong
   * by some fraction of 32. The last pass is deliberately after the transition
   * has finished rather than inside it.
   *
   * The offset comes from the element's own `scroll-margin-top` rather than a
   * number repeated here, so the CSS that clears the sticky header stays the one
   * place that decides how much room the header needs.
   */
  const placedFor = useRef<string | null>(null);
  useEffect(() => {
    const key = requested ?? "";
    if (placedFor.current === key) return;
    placedFor.current = key;

    /* Profile, and anything unrecognised, means "my account": start at the top. */
    if (!isAccountTab(requested) || requested === "profile") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    const place = (smooth: boolean) => {
      const el = document.getElementById("account-sections");
      if (!el) return;
      const clearance = parseFloat(
        getComputedStyle(el).scrollMarginTop || "0",
      );
      const top = el.getBoundingClientRect().top + window.scrollY - clearance;
      window.scrollTo({
        top: Math.max(0, top),
        /* "instant" and not "auto". `auto` means "defer to CSS", and this site
           sets `scroll-behavior: smooth` on the root, so `auto` produced the
           very animation this code is trying not to have — and then measured
           its own position mid-glide. */
        behavior: smooth ? "smooth" : "instant",
      });
    };

    const correct = () => {
      const el = document.getElementById("account-sections");
      if (!el) return;
      const clearance = parseFloat(getComputedStyle(el).scrollMarginTop || "0");
      if (Math.abs(el.getBoundingClientRect().top - clearance) > 6) place(false);
    };

    /* Two frames: one for the section to exist, one for its height to be real. */
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => place(false));
    });

    /* Through the header's shrink transition and out the other side of it. Each
       pass is a no-op unless something actually moved, so three cost nothing. */
    const timers = [120, 550, 950].map((ms) => window.setTimeout(correct, ms));

    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      for (const t of timers) window.clearTimeout(t);
    };
  }, [requested]);

  function chooseTab(next: AccountTab) {
    setTab(next);
    /* Switching sections from the pills means the member is already looking at
       them, so nothing moves — but the *next* request from the header menu
       should place the page again, even if it names the section already open. */
    placedFor.current = null;
    /* Keeps the address bar honest — and the section shareable — without a
       server round trip for a click that only changes what is already here. */
    window.history.replaceState(
      null,
      "",
      next === "profile" ? "/account" : `/account?tab=${next}`,
    );
  }

  async function cancel(b: BookingRow) {
    setBusy(b.id);
    try {
      const res = await fetch("/api/bookings/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: b.id }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        refunded?: boolean;
        error?: string;
      };
      if (data.ok) {
        setNotice(`${t.booking.cancelled} ${t.booking.cancelRefund}`);
        setConfirming(null);
        router.refresh();
      } else if (data.error === "TOO_LATE_TO_CANCEL") {
        setNotice(t.booking.cancelTooLate);
        setConfirming(null);
        router.refresh();
      } else {
        setNotice(t.common.somethingWrong);
      }
    } catch {
      setNotice(t.common.somethingWrong);
    } finally {
      setBusy(null);
    }
  }

  /* A document load, not a client navigation — see lib/sign-out.ts. */
  const signOut = signOutAndGoHome;

  /* Sessions that may only be spent on classes in a date range — the opening
     week offer, today. Grouped rather than listed: a member with one free
     session does not want a table. */
  const windowed = props.wallet.batches.filter(
    (b) => b.usableFrom && b.usableTo && b.creditsRemaining > 0,
  );
  const windowedCredits = windowed.reduce((n, b) => n + b.creditsRemaining, 0);

  const isStaff = props.user.role === "STAFF" || props.user.role === "ADMIN";

  return (
    <Section className="pt-12 md:pt-16">
      <div className="container-x">
        {/* header */}
        <Reveal className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="eyebrow mb-4">{t.nav.account}</p>
            <h1 className="h-display text-[2.6rem] leading-[1.05] sm:text-5xl">
              {t.account.greeting}, {props.user.name.split(" ")[0]}.
            </h1>
            <p className="mt-3 text-sm text-clay">
              {props.user.email}
              {props.user.phone ? ` · ${props.user.phone}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isStaff && (
              <ButtonLink href="/admin" variant="outline" size="sm">
                {t.nav.admin}
              </ButtonLink>
            )}
            <Button variant="ghost" size="sm" onClick={signOut}>
              {t.account.signOut}
            </Button>
          </div>
        </Reveal>

        {notice && (
          <p className="mt-8 rounded-2xl border border-mocha-300 bg-white px-5 py-4 text-sm text-mocha-600">
            {notice}
          </p>
        )}

        {/* wallet */}
        <Reveal delay={0.08} className="mt-12">
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr_1fr]">
            <div
              /* The balance as a value, not only as type. Read by the payment
                 tests, and the honest place for anything that needs to know
                 what this card is showing. */
              data-balance={props.wallet.available}
              className="relative overflow-hidden rounded-4xl bg-mocha-600 p-8 text-cream grain"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-cream/[0.07] blur-2xl"
              />
              <div className="relative">
                <p className="text-[10px] uppercase tracking-brand text-cream/50">
                  {t.account.walletTitle}
                </p>
                {/**
                  * The class balance, and the appointment sessions named under
                  * it rather than folded into it.
                  *
                  * The figure used to be the sum of everything held, which read
                  * as a lie the moment a member bought one Personal session:
                  * "37 sessions" above a timetable where one of the 37 cannot
                  * book 36 of the classes on screen. Nobody could tell from that
                  * number whether it was 37 plus a Personal or 37 including one.
                  *
                  * So the big number is group classes and nothing else, and each
                  * appointment kind gets its own line beneath. The words carry
                  * the meaning, which is the only way to make it unambiguous.
                  */}
                <p className="mt-6 flex items-baseline gap-3">
                  <span className="font-display text-6xl leading-none text-cream">
                    {props.wallet.classCredits}
                  </span>
                  <span className="text-[11px] uppercase tracking-widest text-cream/60">
                    {t.common.credits}
                  </span>
                </p>

                {(props.wallet.soloCredits > 0 ||
                  props.wallet.duetCredits > 0) && (
                  <p className="mt-3 space-x-1 text-[13px] leading-relaxed text-cream/75">
                    {props.wallet.soloCredits > 0 && (
                      <span>
                        {(props.wallet.soloCredits === 1
                          ? t.booking.heldPersonal
                          : t.booking.heldPersonalPlural
                        ).replace("{n}", String(props.wallet.soloCredits))}
                      </span>
                    )}
                    {props.wallet.duetCredits > 0 && (
                      <span>
                        {(props.wallet.duetCredits === 1
                          ? t.booking.heldDuet
                          : t.booking.heldDuetPlural
                        ).replace("{n}", String(props.wallet.duetCredits))}
                      </span>
                    )}
                  </p>
                )}

                {/* A session that may only be spent on one week is worth less
                    than the number suggests, and a member who does not know that
                    will try to book October, fail, and decide the site is
                    broken. So it is named here, above the expiry, because it is
                    the more surprising of the two facts. */}
                {windowed.length > 0 && (
                  <p className="mt-6 rounded-2xl bg-cream/10 px-4 py-3 text-[12px] leading-relaxed text-cream/80">
                    {t.account.walletWindowed
                      .replace("{n}", String(windowedCredits))
                      .replace("{from}", fmtDayMonth(windowed[0].usableFrom!))
                      .replace("{to}", fmtDayMonth(windowed[0].usableTo!))}
                  </p>
                )}

                {props.wallet.nextExpiry ? (
                  <p className="mt-6 text-[12px] text-cream/60">
                    {/* "1 sessions expires" was the plural of a count that is
                        very often exactly one, because an appointment session is
                        bought singly. */}
                    {props.wallet.nextExpiryCredits}{" "}
                    {props.wallet.nextExpiryCredits === 1
                      ? t.common.credit
                      : t.common.credits}{" "}
                    {t.account.expiringOn}{" "}
                    {fmtFullDate(props.wallet.nextExpiry)}
                  </p>
                ) : (
                  <p className="mt-6 text-[12px] text-cream/60">
                    {props.wallet.available === 0 ? t.account.walletEmpty : ""}
                  </p>
                )}

                <div className="mt-8 flex flex-wrap gap-3">
                  <ButtonLink href="/pricing" variant="cream" size="sm">
                    {props.wallet.available === 0
                      ? t.account.walletBuy
                      : t.account.walletTopUp}
                  </ButtonLink>
                  <ButtonLink
                    href="/timetable"
                    size="sm"
                    className="border border-cream/25 bg-transparent text-cream hover:bg-cream hover:text-mocha-700"
                  >
                    {t.account.bookMore}
                  </ButtonLink>
                </div>
              </div>
            </div>

            <Stat
              label={t.account.creditsUsed}
              value={String(props.classesTaken)}
              sub={t.nav.classes}
            />
            <Stat
              label={t.account.memberSince}
              value={fmtMonthYear(props.user.createdAt)}
              sub="APEX pilates™"
            />
          </div>

          {props.wallet.batches.length > 1 && (
            <div className="mt-6 flex flex-wrap gap-3">
              {props.wallet.batches.map((b) => (
                <span
                  key={b.id}
                  className="rounded-full border border-mocha-200 bg-white/60 px-4 py-2 text-[11px] text-mocha-500"
                >
                  {b.creditsRemaining}/{b.creditsTotal} {t.common.credits}
                  {b.expiresAt
                    ? ` · ${t.account.expiringOn} ${fmtDayMonth(b.expiresAt)}`
                    : ""}
                </span>
              ))}
            </div>
          )}
        </Reveal>

        {/* upcoming */}
        <Reveal delay={0.1} className="mt-16">
          <h2 className="text-[13px] uppercase tracking-widest">
            {t.account.upcomingTitle}
          </h2>
          {props.upcoming.length === 0 ? (
            <div className="mt-6 rounded-3xl border border-dashed border-mocha-200 px-6 py-12 text-center">
              <p className="text-sm text-clay">{t.account.upcomingEmpty}</p>
              <ButtonLink href="/timetable" size="sm" className="mt-6">
                {t.nav.book}
              </ButtonLink>
            </div>
          ) : (
            <ul className="mt-6 divide-y divide-mocha-200/70 border-y border-mocha-200/70">
              {props.upcoming.map((b) => {
                const free = new Date(b.freeCancellationUntil) > new Date();
                return (
                  <li
                    key={b.id}
                    className="grid gap-4 py-6 sm:grid-cols-[1fr_auto] sm:items-center"
                  >
                    <div>
                      <p className="flex flex-wrap items-center gap-2 text-[15px] text-mocha-600">
                        {b.kind === "PERSONAL" && (
                          <span className="rounded-full border border-gold/50 bg-[#FBF6E7] px-2 py-0.5 text-[9px] uppercase tracking-widest text-[#8a6f1a]">
                            {b.guestName ? t.desk.duet : t.desk.personal}
                          </span>
                        )}
                        <span>{el ? b.className.el : b.className.en}</span>
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-clay">
                        <span className="lining-nums tabular-nums text-mocha-500">
                          {fmtShortDate(b.startsAt)} · {fmtTime(b.startsAt)}
                        </span>
                        {/* Whoever is coming with them, because a name typed
                            days ago is worth a chance to notice a typo in. */}
                        {b.guestName && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-clay/50" />
                            <span>{`+ ${b.guestName}`}</span>
                          </>
                        )}
                        {b.instructor && (
                          <>
                            <span className="h-1 w-1 rounded-full bg-clay/50" />
                            <span>{b.instructor}</span>
                          </>
                        )}
                      </p>
                      <p
                        className={cn(
                          "mt-2 text-[11px]",
                          free ? "text-clay" : "text-gold",
                        )}
                      >
                        {free
                          ? `${t.account.cancelFree} ${fmtDayMonth(
                              b.freeCancellationUntil,
                            )} ${fmtTime(b.freeCancellationUntil)}`
                          : b.kind === "PERSONAL"
                            ? t.booking.personalCancelTooLate
                            : t.account.cancelLate}
                      </p>
                    </div>
                    <div className="sm:justify-self-end">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === b.id}
                        onClick={() => setConfirming(b)}
                      >
                        {t.account.cancelBooking}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Reveal>

        {/* Sub-sections. Everything above this belongs to the member as a
            whole — their balance, and the classes they are booked into. The
            pills below it only ever change the panel underneath, so anything
            that is not a panel has to sit above them or it reads as one. */}
        <Reveal
          delay={0.12}
          id="account-sections"
          className="mt-16 scroll-mt-28"
        >
          <AccountTabs
            active={tab}
            onChange={chooseTab}
            counts={{
              classes: props.past.length,
              payments: props.purchases.length,
              activity: props.ledger.length,
            }}
            /* The unread count sits on the Notifications pill as well as on
               their face in the header, so it is findable from either. */
            unread={props.notices.counts.unread}
            /* A dot on Profile when there is something to ask: offers not
               accepted, or no birthday on file. Both are the studio's only
               chance to reach someone who has not opted in. */
            needsAttention={
              !props.profile.marketingOptIn || !props.profile.birthDate
            }
          />
        </Reveal>

        {/* Messages beside the switches rather than stacked on top of them.
            Stacked, a long history pushed the member's own settings off the
            bottom of the screen; side by side, both are reachable however many
            messages the studio has sent. */}
        {tab === "notifications" && (
          <Reveal delay={0.05} className="mt-12">
            <div className="grid items-start gap-6 lg:grid-cols-[1.15fr_1fr]">
              <NoticeList notices={props.notices} />
              <ProfilePanel
                initial={props.profile}
                section="notifications"
                pushPublicKey={props.pushPublicKey}
              />
            </div>
          </Reveal>
        )}

        {/* profile / password */}
        {(tab === "profile" || tab === "password") && (
          <Reveal key={tab} delay={0.05} className="mt-12">
            <ProfilePanel
              initial={props.profile}
              section={tab}
              pushPublicKey={props.pushPublicKey}
            />
          </Reveal>
        )}

        {/* past classes */}
        {tab === "classes" && (
          <Reveal delay={0.05} className="mt-12">
            {props.past.length === 0 ? (
              <p className="text-sm text-clay">{t.account.historyEmpty}</p>
            ) : (
              <ul className="space-y-4">
                {props.past.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center justify-between gap-4 border-b border-mocha-200/60 pb-4 text-sm"
                  >
                    <span className="text-mocha-600">
                      {el ? b.className.el : b.className.en}
                      <span className="ml-3 text-[11px] lining-nums tabular-nums text-clay">
                        {fmtDayMonth(b.startsAt)} {fmtTime(b.startsAt)}
                      </span>
                    </span>
                    <StatusPill status={b.status} refunded={b.creditRefunded} />
                  </li>
                ))}
              </ul>
            )}
          </Reveal>
        )}

        {/* session activity: every session added, spent or returned */}
        {tab === "activity" && (
          <Reveal delay={0.05} className="mt-12">
            {props.ledger.length === 0 ? (
              <p className="text-sm text-clay">{t.account.purchasesEmpty}</p>
            ) : (
              <ul className="space-y-3">
                {props.ledger.map((l) => (
                  <li
                    key={l.id}
                    className="flex items-center justify-between gap-4 text-sm"
                  >
                    <span className="text-mocha-500">
                      {el
                        ? (REASON[l.reason]?.el ?? l.reason)
                        : (REASON[l.reason]?.en ?? l.reason)}
                      <span className="ml-3 text-[11px] text-clay">
                        {fmtDayMonth(l.createdAt)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "font-display text-lg lining-nums tabular-nums",
                        l.delta > 0 ? "text-mocha-600" : "text-clay",
                      )}
                    >
                      {l.delta > 0 ? "+" : ""}
                      {l.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Reveal>
        )}

        {/* payment history */}
        {tab === "payments" && (
          <Reveal delay={0.05} className="mt-12">
            {props.purchases.length === 0 ? (
              <p className="text-sm text-clay">{t.account.purchasesEmpty}</p>
            ) : (
              <>
                <ul className="space-y-3">
                  {props.purchases.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between gap-4 text-sm"
                    >
                      <span className="text-mocha-500">
                        {p.packageName
                          ? el
                            ? p.packageName.el
                            : p.packageName.en
                          : `${p.credits} ${t.common.credits}`}
                        <span className="ml-3 text-[11px] text-clay">
                          {fmtDayMonth(p.createdAt)}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="lining-nums tabular-nums text-mocha-600">
                          {fmtMoney(p.amountCents)}
                        </span>
                        <StatusPill status={p.status} />
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Reveal>
        )}

        <div className="mt-20 flex items-center gap-3 border-t border-mocha-200/70 pt-10 text-[10px] uppercase tracking-widest text-clay">
          <Monogram className="h-7 w-7" />
          <Link href="/terms" className="link-underline">
            {t.footer.terms}
          </Link>
        </div>
      </div>

      {/* cancel confirmation */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-mocha-900/40 p-6 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-cream p-8 shadow-lift">
            <h3 className="h-display text-2xl">
              {t.booking.cancelConfirmTitle}
            </h3>
            <p className="mt-3 text-sm text-mocha-500">
              {el ? confirming.className.el : confirming.className.en} ·{" "}
              {fmtDayMonth(confirming.startsAt)} {fmtTime(confirming.startsAt)}
            </p>
            <p className="mt-4 text-sm text-mocha-600">
              {new Date(confirming.freeCancellationUntil) > new Date()
                ? t.booking.cancelRefund
                : t.booking.cancelTooLate}
            </p>
            <div className="mt-8 flex gap-3">
              <Button
                className="flex-1"
                /* Past the window the booking is locked, so the action that
                   would fail on the server is not offered. */
                disabled={
                  busy === confirming.id ||
                  new Date(confirming.freeCancellationUntil) <= new Date()
                }
                onClick={() => cancel(confirming)}
              >
                {busy === confirming.id ? t.common.loading : t.common.confirm}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setConfirming(null)}
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

function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-4xl border border-mocha-200/70 bg-white/60 p-8 backdrop-blur-sm">
      <p className="text-[10px] uppercase tracking-brand text-clay">{label}</p>
      <p className="mt-6 font-display text-4xl text-mocha-600">{value}</p>
      {sub && (
        <p className="mt-2 text-[11px] uppercase tracking-widest text-clay/70">
          {sub}
        </p>
      )}
    </div>
  );
}

function StatusPill({
  status,
  refunded,
}: {
  status: string;
  refunded?: boolean;
}) {
  const { t } = useI18n();
  const map: Record<string, { text: string; className: string }> = {
    CONFIRMED: {
      text: t.common.booked,
      className: "border-mocha-300 text-mocha-600",
    },
    ATTENDED: {
      text: t.account.attended,
      className: "border-mocha-400 text-mocha-600",
    },
    NO_SHOW: {
      text: t.account.noShow,
      className: "border-red-200 text-red-600",
    },
    CANCELLED: {
      text: refunded ? `${t.account.cancelled} ↩` : t.account.cancelled,
      className: "border-mocha-200 text-clay",
    },
    PAID: { text: "Paid", className: "border-mocha-300 text-mocha-600" },
    PENDING: { text: "Pending", className: "border-gold/50 text-gold" },
    FAILED: { text: "Failed", className: "border-red-200 text-red-600" },
    REFUNDED: { text: "Refunded", className: "border-mocha-200 text-clay" },
  };
  const s = map[status] ?? {
    text: status,
    className: "border-mocha-200 text-clay",
  };
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-3 py-1 text-[10px] uppercase tracking-widest",
        s.className,
      )}
    >
      {s.text}
    </span>
  );
}
