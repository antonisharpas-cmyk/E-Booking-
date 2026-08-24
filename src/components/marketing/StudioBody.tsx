"use client";

import Image from "next/image";
import { Technogym } from "@/components/home/HomeSections";
import { ButtonLink } from "@/components/ui/Button";
import { Monogram } from "@/components/ui/Monogram";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Section, SectionHead } from "@/components/ui/Section";
import { useI18n } from "@/i18n/LanguageProvider";
import { STUDIO } from "@/lib/studio";

export function StudioBody() {
  const { t } = useI18n();

  return (
    <>
      <Section className="pt-12 md:pt-16">
        <div className="container-x">
          <SectionHead
            eyebrow={t.studio.hero.eyebrow}
            title={t.studio.hero.title}
            body={t.studio.hero.body}
          />

          <Reveal delay={0.15} className="mt-16">
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="relative aspect-[4/5] overflow-hidden rounded-3xl sm:col-span-2">
                <Image
                  src="/media/reformer.jpg"
                  alt="Technogym Reform reformer at APEX pilates"
                  fill
                  sizes="(max-width: 640px) 100vw, 60vw"
                  className="object-cover"
                />
              </div>
              <div className="grid gap-4">
                <div className="relative aspect-[4/5] overflow-hidden rounded-3xl sm:aspect-auto sm:h-full">
                  <Image
                    src="/media/detail-footbar.jpg"
                    alt="Footbar and spring detail"
                    fill
                    sizes="(max-width: 640px) 100vw, 32vw"
                    className="object-cover"
                  />
                </div>
                <div className="relative hidden aspect-square overflow-hidden rounded-3xl sm:block">
                  <Image
                    src="/media/detail-wood.jpg"
                    alt="Pale ash frame with the Technogym maker's mark"
                    fill
                    sizes="32vw"
                    className="object-cover"
                  />
                </div>
              </div>
            </div>
            <p className="mt-6 text-center text-[10px] uppercase tracking-brand text-clay">
              Technogym Reform · {STUDIO.capacity} per class ·{" "}
              {STUDIO.classLengthMinutes} minutes
            </p>
          </Reveal>

          <RevealGroup className="mt-16 grid gap-10 md:grid-cols-2">
            {t.studio.sections.map((s) => (
              <RevealItem key={s.t}>
                <div className="flex gap-6 border-t border-mocha-200/70 pt-8">
                  <Monogram className="mt-1 h-7 w-7 shrink-0 text-clay/60" />
                  <div>
                    <h3 className="text-[13px] uppercase tracking-widest">{s.t}</h3>
                    <p className="mt-3 text-sm leading-[1.9] text-mocha-500">{s.d}</p>
                  </div>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>
        </div>
      </Section>

      <Technogym />

      <Section tone="sand">
        <div className="container-x">
          <SectionHead
            eyebrow={t.studio.values.eyebrow}
            title={t.studio.values.title}
            align="center"
          />
          <RevealGroup className="mt-14 grid gap-6 md:grid-cols-3">
            {t.studio.values.items.map((v) => (
              <RevealItem key={v.t}>
                <div className="h-full rounded-3xl border border-mocha-200/70 bg-cream p-10 text-center">
                  <h3 className="h-display text-3xl">{v.t}</h3>
                  <p className="mt-4 text-sm text-mocha-500">{v.d}</p>
                </div>
              </RevealItem>
            ))}
          </RevealGroup>

          <Reveal delay={0.1}>
            <div className="mt-14 flex flex-wrap items-center justify-center gap-4">
              <ButtonLink href="/timetable">{t.nav.book}</ButtonLink>
              <ButtonLink href="/contact" variant="outline">
                {t.nav.contact}
              </ButtonLink>
            </div>
          </Reveal>
        </div>
      </Section>
    </>
  );
}
