"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export type AccountTab =
  | "profile"
  | "notifications"
  | "password"
  | "classes"
  | "payments"
  | "activity";

/**
 * The order they appear in, here and in the header menu. One list so the two
 * can never drift apart.
 */
export const ACCOUNT_TABS: AccountTab[] = [
  "profile",
  "notifications",
  "password",
  "classes",
  "payments",
  "activity",
];

/** Guards `?tab=` from the address bar, which anyone can type. */
export function isAccountTab(value: unknown): value is AccountTab {
  return (
    typeof value === "string" && ACCOUNT_TABS.includes(value as AccountTab)
  );
}

/**
 * The sub-sections of a member's account.
 *
 * A scrolling row of pills rather than a sidebar: there are six of them, the
 * page is already narrow on a phone, and a member arrives wanting one thing —
 * usually their balance, which stays above this. The count badge on Classes
 * and Payments is there so nobody has to open an empty tab to find out it is
 * empty.
 */
export function AccountTabs({
  active,
  onChange,
  counts,
  needsAttention,
}: {
  active: AccountTab;
  onChange: (t: AccountTab) => void;
  counts: { classes: number; payments: number; activity: number };
  /** Marks Profile when there is something worth the member's attention. */
  needsAttention?: boolean;
}) {
  const { t } = useI18n();
  const a = t.accountTabs;
  const row = useRef<HTMLDivElement>(null);
  /* Whether there is anything further along to scroll to — the fade at the
     edge is drawn only then, so it never sits as a smudge over the last pill. */
  const [more, setMore] = useState(false);

  /* Six pills do not fit across a phone, so the row scrolls. That is fine for
     a thumb, but not for a section chosen somewhere else — the header menu
     links straight to Payments, and the pill for it starts off-screen. Bring
     whichever one is live into view. */
  useEffect(() => {
    row.current
      ?.querySelector<HTMLElement>('[aria-selected="true"]')
      ?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [active]);

  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const measure = () =>
      setMore(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [active]);

  const tabs: {
    id: AccountTab;
    label: string;
    count?: number;
    dot?: boolean;
  }[] = [
    { id: "profile", label: a.profile, dot: needsAttention },
    { id: "notifications", label: a.notifications },
    { id: "password", label: a.password },
    { id: "classes", label: a.classes, count: counts.classes },
    { id: "payments", label: a.payments, count: counts.payments },
    { id: "activity", label: a.activity, count: counts.activity },
  ];

  return (
    <div className="relative -mx-6 md:mx-0">
      <div
        ref={row}
        role="tablist"
        aria-label={a.label}
        className="no-scrollbar flex gap-2 overflow-x-auto px-6 md:px-0"
      >
        {tabs.map((tab) => {
          const on = tab.id === active;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={on}
              onClick={() => onChange(tab.id)}
              className={cn(
                "relative shrink-0 rounded-full border px-4 py-2 text-[11px] uppercase tracking-widest transition-all duration-400 ease-silk",
                on
                  ? "border-mocha-600 bg-mocha-600 text-cream"
                  : "border-mocha-200/70 bg-white/50 text-mocha-500 hover:border-mocha-400",
              )}
            >
              {tab.label}
              {tab.count !== undefined && tab.count > 0 && (
                <span
                  className={cn(
                    "ml-2 lining-nums tabular-nums",
                    on ? "text-cream/60" : "text-clay",
                  )}
                >
                  {tab.count}
                </span>
              )}
              {tab.dot && !on && (
                <span
                  aria-hidden
                  className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-gold"
                />
              )}
            </button>
          );
        })}
      </div>

      {/* A phone shows three and a half pills. The row scrolls, and this fade
          at the edge is what says so — without it a cut-off pill reads as a
          layout fault rather than an invitation to swipe. It disappears at the
          end of the row, so the last pill is never dimmed by it. */}
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-cream via-cream/80 to-transparent transition-opacity duration-300 md:hidden",
          more ? "opacity-100" : "opacity-0",
        )}
      />
    </div>
  );
}
