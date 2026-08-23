"use client";

import Link from "next/link";
import { LanguageToggle } from "@/components/site/LanguageToggle";
import { Monogram } from "@/components/ui/Monogram";
import { Wordmark } from "@/components/ui/Wordmark";
import { useI18n } from "@/i18n/LanguageProvider";
import { STUDIO } from "@/lib/studio";

export function Footer() {
  const { t } = useI18n();
  const year = new Date().getFullYear();

  const groups = [
    {
      title: t.footer.explore,
      links: [
        { href: "/studio", label: t.nav.studio },
        { href: "/classes", label: t.nav.classes },
        { href: "/timetable", label: t.nav.timetable },
        { href: "/pricing", label: t.nav.pricing },
      ],
    },
    {
      title: t.footer.account,
      links: [
        { href: "/account", label: t.nav.account },
        { href: "/login", label: t.nav.login },
        { href: "/register", label: t.nav.register },
        { href: "/contact", label: t.nav.contact },
      ],
    },
    {
      title: t.footer.legal,
      links: [
        { href: "/privacy", label: t.footer.privacy },
        { href: "/terms", label: t.footer.terms },
      ],
    },
  ];

  return (
    <footer className="relative overflow-hidden bg-mocha-600 text-cream/80 grain">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-40 top-1/3 h-[520px] w-[520px] rounded-full bg-cream/[0.05] blur-3xl"
      />
      <div className="container-x relative py-20">
        <div className="grid gap-14 md:grid-cols-2 lg:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Wordmark tone="cream" className="w-[196px]" />
            <p className="mt-6 max-w-xs text-sm leading-relaxed text-cream/65">
              {t.footer.tagline}
            </p>
            <div className="mt-8 flex items-center gap-3 text-[10px] uppercase tracking-widest text-cream/50">
              <Monogram className="h-7 w-7 text-cream/70" strokeWidth={2.6} />
              {t.footer.partner}
            </div>
          </div>

          {groups.map((g) => (
            <div key={g.title}>
              <p className="mb-5 text-[10px] uppercase tracking-brand text-cream/45">
                {g.title}
              </p>
              <ul className="space-y-3">
                {g.links.map((l) => (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      className="link-underline text-sm text-cream/80 hover:text-cream"
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-16 grid gap-10 border-t border-cream/12 pt-10 md:grid-cols-3">
          <div>
            <p className="mb-3 text-[10px] uppercase tracking-brand text-cream/45">
              {t.footer.visit}
            </p>
            <p className="text-sm leading-relaxed text-cream/75">
              {STUDIO.addressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </p>
          </div>
          <div>
            <p className="mb-3 text-[10px] uppercase tracking-brand text-cream/45">
              {t.contactPage.hoursTitle}
            </p>
            <p className="text-sm leading-relaxed text-cream/75">
              <span className="block">
                {t.home.timetable.weekday}: 06:00 – 12:00 · 15:00 – 20:00
              </span>
              <span className="block">{t.home.timetable.saturday}: 07:00 – 11:00</span>
              <span className="block text-cream/45">
                {t.home.timetable.sunday}: {t.home.timetable.closed}
              </span>
            </p>
          </div>
          <div>
            <p className="mb-3 text-[10px] uppercase tracking-brand text-cream/45">
              {t.contactPage.followTitle}
            </p>
            <a
              href={STUDIO.instagram}
              target="_blank"
              rel="noreferrer noopener"
              className="link-underline text-sm text-cream/80 hover:text-cream"
            >
              @pilatesbyapex
            </a>
            <a
              href={`mailto:${STUDIO.email}`}
              className="mt-2 block link-underline text-sm text-cream/80 hover:text-cream"
            >
              {STUDIO.email}
            </a>
            <a
              href={`tel:${STUDIO.phone.replace(/\s/g, "")}`}
              className="mt-2 block link-underline text-sm text-cream/80 hover:text-cream"
            >
              {STUDIO.phone}
            </a>
          </div>
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-6 border-t border-cream/12 pt-8 sm:flex-row sm:items-center">
          <p className="text-[11px] text-cream/45">
            © {year} APEX pilates™. {t.footer.rights}
          </p>
          <LanguageToggle tone="dark" />
        </div>
      </div>
    </footer>
  );
}
