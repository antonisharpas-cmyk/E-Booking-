"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { STUDIO } from "@/lib/studio";
import {
  DEFAULT_LOCALE,
  dictionaries,
  LOCALE_COOKIE,
  type Dictionary,
  type Locale,
} from "./dictionaries";

type Ctx = {
  locale: Locale;
  t: Dictionary;
  setLocale: (l: Locale) => void;
  /** 18:30 */
  fmtTime: (d: DateLike) => string;
  /** Mon 24 Aug */
  fmtShortDate: (d: DateLike) => string;
  /** Monday 24 August */
  fmtLongDate: (d: DateLike) => string;
  /** 24 Aug */
  fmtDayMonth: (d: DateLike) => string;
  /** 24 August 2026 */
  fmtFullDate: (d: DateLike) => string;
  /** Aug 2026 */
  fmtMonthYear: (d: DateLike) => string;
  /** 24 */
  fmtDayNumber: (d: DateLike) => string;
  /** Mon */
  fmtWeekdayShort: (d: DateLike) => string;
  /** €200 / €22.50 */
  fmtMoney: (cents: number) => string;
};

type DateLike = Date | string | number;

const LanguageContext = createContext<Ctx | null>(null);

export function LanguageProvider({
  initialLocale = DEFAULT_LOCALE,
  children,
}: {
  initialLocale?: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    document.cookie = `${LOCALE_COOKIE}=${l}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    document.documentElement.lang = l;
  }, []);

  const value = useMemo<Ctx>(() => {
    const intlLocale = locale === "el" ? "el-GR" : "en-GB";
    const tz = STUDIO.timezone;

    /**
     * Dates are composed from single Intl fields rather than asked of Intl as a
     * whole. Node and the browser ship different ICU versions, and they disagree
     * about the separators in multi-field patterns ("Mon 24 Aug" vs
     * "Mon, 24 Aug") — which shows up as a React hydration mismatch. Single
     * fields are stable everywhere, so we join them ourselves.
     *
     * Everything is rendered in the studio's timezone: a class at 18:00 in
     * Nicosia reads 18:00 to someone browsing from London.
     */
    const part = (opts: Intl.DateTimeFormatOptions) => {
      const f = new Intl.DateTimeFormat(intlLocale, { timeZone: tz, ...opts });
      return (d: DateLike) => f.format(toDate(d));
    };

    const weekdayShort = part({ weekday: "short" });
    const weekdayLong = part({ weekday: "long" });
    const monthShort = part({ month: "short" });
    const monthLong = part({ month: "long" });
    const dayNumber = part({ day: "numeric" });
    const year = part({ year: "numeric" });
    const time = part({ hour: "2-digit", minute: "2-digit", hour12: false });

    const clean = (s: string) => s.replace(/[.,]$/, "");

    /* Two decimals, then the whole ones are trimmed back off below.
       Asking Intl for a minimum of zero instead gave "€12.5" for a
       per-class price of twelve fifty — one decimal, which reads as an
       unfinished number on a price list. */
    const money = new Intl.NumberFormat(intlLocale, {
      style: "currency",
      currency: "EUR",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    return {
      locale,
      t: dictionaries[locale],
      setLocale,
      fmtTime: (d) => time(d),
      fmtShortDate: (d) =>
        `${clean(weekdayShort(d))} ${dayNumber(d)} ${clean(monthShort(d))}`,
      fmtLongDate: (d) =>
        `${weekdayLong(d)} ${dayNumber(d)} ${monthLong(d)}`,
      fmtDayMonth: (d) => `${dayNumber(d)} ${clean(monthShort(d))}`,
      fmtFullDate: (d) => `${dayNumber(d)} ${monthLong(d)} ${year(d)}`,
      fmtMonthYear: (d) => `${clean(monthShort(d))} ${year(d)}`,
      fmtDayNumber: (d) => dayNumber(d),
      fmtWeekdayShort: (d) => clean(weekdayShort(d)),
      /* "€15.00" becomes "€15", "€12.50" stays. Not anchored to the end of the
         string, because Greek puts the symbol last — "15,00 €" — and an
         anchored strip left the zeros on in Greek only. The lookahead keeps it
         off the thousands separator in "€1,000.00". */
      fmtMoney: (cents) =>
        money.format(cents / 100).replace(/([.,])00(?!\d)/, ""),
    };
  }, [locale, setLocale]);

  return (
    <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
  );
}

function toDate(d: DateLike) {
  return d instanceof Date ? d : new Date(d);
}

export function useI18n() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useI18n must be used inside <LanguageProvider>");
  return ctx;
}
