"use client";

import Link from "next/link";
import { ButtonLink } from "@/components/ui/Button";
import { Monogram } from "@/components/ui/Monogram";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Section, SectionHead } from "@/components/ui/Section";
import { useI18n } from "@/i18n/LanguageProvider";

/* ------------------------------------------------------------------ marquee */

export function Marquee() {
  const { t } = useI18n();
  const words = [...t.home.marquee, ...t.home.marquee];

  return (
    <div className="relative overflow-hidden border-y border-mocha-200/60 bg-cream-200 py-5">
      <div className="flex w-max animate-marquee items-center gap-10 whitespace-nowrap">
        {words.map((w, i) => (
          <span key={`${w}-${i}`} className="flex items-center gap-10">
            <span className="text-[11px] uppercase tracking-brand text-clay">
              {w}
            </span>
            <Monogram className="h-4 w-4 shrink-0 text-clay/50" strokeWidth={3.4} />
          </span>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------- intro */

export function Intro() {
  const { t } = useI18n();

  return (
    <Section>
      <div className="container-x grid gap-16 lg:grid-cols-[1fr_1.05fr] lg:gap-24">
        <Reveal>
          <p className="eyebrow mb-5">{t.home.intro.eyebrow}</p>
          <h2 className="h-display text-balance text-[2.4rem] leading-[1.08] sm:text-5xl">
            {t.home.intro.title}
          </h2>
          <ButtonLink href="/studio" variant="outline" className="mt-10">
            {t.home.intro.cta}
          </ButtonLink>
        </Reveal>

        <Reveal delay={0.12} className="lg:pt-4">
          <p className="text-[15px] leading-[1.9] text-mocha-500">
            {t.home.intro.body}
          </p>

          <div className="mt-12 grid grid-cols-3 gap-6 border-t border-mocha-200/70 pt-8">
            {t.home.method.items.slice(0, 3).map((m) => (
              <div key={m.k}>
                <p className="font-display text-2xl font-light text-clay">{m.k}</p>
                <p className="mt-2 text-[11px] uppercase tracking-widest text-mocha-600">
                  {m.t}
                </p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------- method */

export function Method() {
  const { t } = useI18n();

  return (
    <Section tone="sand">
      <div className="container-x">
        <SectionHead
          eyebrow={t.home.method.eyebrow}
          title={t.home.method.title}
        />

        <RevealGroup className="mt-16 grid gap-px overflow-hidden rounded-3xl border border-mocha-200/70 bg-mocha-200/70 sm:grid-cols-2 lg:grid-cols-4">
          {t.home.method.items.map((m) => (
            <RevealItem
              key={m.k}
              className="group bg-cream p-8 transition-colors duration-700 hover:bg-white"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-display text-4xl font-light text-clay/60 transition-colors duration-700 group-hover:text-mocha-600">
                  {m.k}
                </span>
                <Monogram
                  className="h-6 w-6 text-clay/30 transition-all duration-700 group-hover:rotate-45 group-hover:text-clay/70"
                  strokeWidth={3}
                />
              </div>
              <h3 className="mt-8 text-[13px] uppercase tracking-widest">{m.t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-mocha-500">{m.d}</p>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </Section>
  );
}

/* ---------------------------------------------------------------- technogym */

export function Technogym() {
  const { t } = useI18n();

  return (
    <Section tone="dark">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 top-0 h-[520px] w-[520px] rounded-full bg-cream/[0.06] blur-3xl"
      />
      <div className="container-x relative grid gap-16 lg:grid-cols-2 lg:items-center">
        <Reveal>
          <p className="eyebrow mb-5 text-cream/50">{t.home.technogym.eyebrow}</p>
          <h2 className="h-display text-balance text-[2.4rem] leading-[1.08] text-cream sm:text-5xl">
            {t.home.technogym.title}
          </h2>
          <p className="mt-6 max-w-xl text-[15px] leading-[1.9] text-cream/65">
            {t.home.technogym.body}
          </p>

          <ul className="mt-10 space-y-4">
            {t.home.technogym.points.map((p) => (
              <li key={p} className="flex gap-4 text-sm text-cream/75">
                <span className="mt-2 h-1 w-6 shrink-0 bg-gold/80" />
                {p}
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="relative rounded-3xl border border-cream/12 bg-cream/[0.04] p-10 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-brand text-cream/40">
              Powered by
            </p>
            <p className="mt-4 font-display text-4xl font-light tracking-tight text-cream">
              Technogym
            </p>
            <div className="mt-8 h-px w-full bg-cream/12" />
            <dl className="mt-8 grid grid-cols-2 gap-8">
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-cream/40">
                  Reformers
                </dt>
                <dd className="mt-2 font-display text-2xl font-light text-cream">
                  Technogym Reform
                </dd>
              </div>
              <div>
                <dt className="text-[10px] uppercase tracking-widest text-cream/40">
                  Gym floor
                </dt>
                <dd className="mt-2 font-display text-2xl font-light text-cream">
                  Fully equipped
                </dd>
              </div>
            </dl>
            <Monogram
              className="mt-10 h-10 w-10 text-cream/25"
              strokeWidth={2.4}
            />
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------- timetable preview */

export function TimetablePreview() {
  const { t } = useI18n();

  const rows = [
    { label: t.home.timetable.weekday, blocks: ["06:00 – 12:00", "15:00 – 20:00"] },
    { label: t.home.timetable.saturday, blocks: ["07:00 – 11:00"] },
    { label: t.home.timetable.sunday, blocks: [] },
  ];

  return (
    <Section>
      <div className="container-x grid gap-16 lg:grid-cols-[1fr_1fr] lg:gap-24">
        <div>
          <SectionHead
            eyebrow={t.home.timetable.eyebrow}
            title={t.home.timetable.title}
            body={t.home.timetable.body}
          />
          <Reveal delay={0.1}>
            <ButtonLink href="/timetable" className="mt-10">
              {t.home.timetable.cta}
            </ButtonLink>
          </Reveal>
        </div>

        <Reveal delay={0.15}>
          <div className="rounded-3xl border border-mocha-200/70 bg-white/60 p-8 backdrop-blur-sm md:p-10">
            {rows.map((r, i) => (
              <div
                key={r.label}
                className={
                  i === 0
                    ? "pb-6"
                    : "border-t border-mocha-200/70 py-6 last:pb-0"
                }
              >
                <p className="text-[11px] uppercase tracking-widest text-clay">
                  {r.label}
                </p>
                {r.blocks.length ? (
                  <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
                    {r.blocks.map((b) => (
                      <p
                        key={b}
                        className="font-display text-3xl font-light tabular-nums text-mocha-600"
                      >
                        {b}
                      </p>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 font-display text-2xl font-light text-clay/70">
                    {t.home.timetable.closed}
                  </p>
                )}
              </div>
            ))}
            <div className="mt-8 flex items-center gap-3 border-t border-mocha-200/70 pt-6 text-[10px] uppercase tracking-widest text-clay">
              <Monogram className="h-6 w-6" strokeWidth={3} />
              50 min · max 8
            </div>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------ how it works */

export function HowItWorks() {
  const { t } = useI18n();

  return (
    <Section tone="sand">
      <div className="container-x">
        <SectionHead
          eyebrow={t.home.how.eyebrow}
          title={t.home.how.title}
          align="center"
        />
        <RevealGroup className="mt-16 grid gap-8 md:grid-cols-3">
          {t.home.how.items.map((s, i) => (
            <RevealItem key={s.t} className="relative">
              <div className="h-full rounded-3xl border border-mocha-200/70 bg-cream p-8">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-mocha-300 text-[11px] tabular-nums text-mocha-600">
                  {i + 1}
                </span>
                <h3 className="mt-7 text-[13px] uppercase tracking-widest">
                  {s.t}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-mocha-500">{s.d}</p>
              </div>
            </RevealItem>
          ))}
        </RevealGroup>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------- final call */

export function FinalCta() {
  const { t } = useI18n();

  return (
    <Section tone="dark" className="py-28 md:py-36">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[560px] w-[860px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(250,245,242,0.10),transparent_65%)] animate-breathe"
      />
      <div className="container-x relative text-center">
        <Reveal>
          <Monogram className="mx-auto h-12 w-12 text-cream/60" strokeWidth={2.2} />
          <h2 className="h-display mx-auto mt-10 max-w-3xl text-balance text-[2.6rem] leading-[1.08] text-cream sm:text-5xl md:text-[3.6rem]">
            {t.home.cta.title}
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-[15px] leading-relaxed text-cream/65">
            {t.home.cta.body}
          </p>
          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <ButtonLink href="/register" variant="cream" size="lg">
              {t.home.cta.primary}
            </ButtonLink>
            <Link
              href="/contact"
              className="link-underline px-4 text-[12px] uppercase tracking-widest text-cream/70 hover:text-cream"
            >
              {t.home.cta.secondary}
            </Link>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
