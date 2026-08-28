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
  /* "I asked for this section" as opposed to "I asked for my account".
     See the jump effect below for why the tab name alone cannot say it. */
  const jump = params.get("jump") === "1";
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
   * Asked for a section by name: take them to it, rather than leaving the right
   * pill selected somewhere below the fold.
   *
   * Plain `/account` — clicking the photograph — deliberately does not jump. That
   * is somebody coming to look at their balance, and the balance is at the top.
   * A named section is somebody who asked for that section.
   *
   * Profile is the one section that cannot be told apart by its name, because it
   * is also the default: `?tab=profile` is both "take me to Profile" and "take me
   * to my account, where Profile happens to be showing". So the header's Profile
   * menu item carries `&jump=1` and the member's face does not, and the two land
   * where each is asking to land. Every other section is unambiguous and needs no
   * marker, which keeps a link somebody pastes to a friend — `?tab=payments` —
   * arriving on the payments it names.
   *
   * Keyed on which section was asked for rather than a once-ever flag. It used
   * to be a boolean, which meant the *first* menu item a member clicked took
   * them to its section and every one after it silently did not — the right pill
   * highlighted, hundreds of pixels below what they were looking at. Working
   * once and then not is worse than never working, because it reads as the page
   * being unreliable rather than as a missing feature.
   *
   * The header links now pass `scroll={false}`, so Next no longer resets the
   * scroll position to the top underneath this. That removes the race the old
   * 180ms timeout existed to lose.
   */
  const jumpedTo = useRef<string | null>(null);
  useEffect(() => {
    if (!isAccountTab(requested)) return;
    if (requested === "profile" && !jump) return;
    const key = `${requested}:${jump}`;
    if (jumpedTo.current === key) return;
    jumpedTo.current = key;

    /* One frame, so the section exists and has its height before we measure. */
    const raf = requestAnimationFrame(() => {
      document
        .getElementById("account-sections")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(raf);
  }, [requested, jump]);

  function chooseTab(next: AccountTab) {
    setTab(next);
    /* Switching sections from the pills means the member is already looking at
       them, so no jump — but the *next* request from the header menu should jump
       again, even if it names the section that is already open. */
    jumpedTo.current = null;
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
                <p className="mt-6 flex items-baseline gap-3">
                  <span className="font-display text-6xl leading-none text-cream">
                    {props.wallet.available}
                  </span>
                  <span className="text-[11px] uppercase tracking-widest text-cream/60">
                    {t.common.credits}
                  </span>
                </p>

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
                    {props.wallet.nextExpiryCredits} {t.common.credits}{" "}
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
                      <p className="text-[15px] text-mocha-600">
                        {el ? b.className.el : b.className.en}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-clay">
                        <span className="lining-nums tabular-nums text-mocha-500">
                          {fmtShortDate(b.startsAt)} · {fmtTime(b.startsAt)}
                        </span>
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
