"use client";

import Image from "next/image";
import {
  ClassTypeGrid,
  type ClassTypeCard,
} from "@/components/marketing/ClassTypeGrid";
import { ButtonLink } from "@/components/ui/Button";
import { Monogram } from "@/components/ui/Monogram";
import { Reveal, RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { Section, SectionHead } from "@/components/ui/Section";
import { useI18n } from "@/i18n/LanguageProvider";

type TeamMember = {
  id: string;
  name: string;
  bioEn: string;
  bioEl: string;
  photoUrl: string | null;
};

export function ClassesPageBody({
  types,
  team,
}: {
  types: ClassTypeCard[];
  team: TeamMember[];
}) {
  const { t, locale } = useI18n();
  const el = locale === "el";

  return (
    <>
      <Section className="pt-12 md:pt-16">
        <div className="container-x">
          <SectionHead
            eyebrow={t.classesPage.hero.eyebrow}
            title={t.classesPage.hero.title}
            body={t.classesPage.hero.body}
          />
          <div className="mt-14">
            <ClassTypeGrid types={types} />
          </div>
          <Reveal delay={0.1}>
            <div className="mt-14 flex flex-wrap items-center gap-4">
              <ButtonLink href="/timetable">{t.classesPage.bookCta}</ButtonLink>
              <ButtonLink href="/pricing" variant="outline">
                {t.nav.pricing}
              </ButtonLink>
            </div>
          </Reveal>
        </div>
      </Section>

      {team.length > 0 && (
        <Section tone="sand">
          <div className="container-x">
            <SectionHead
              eyebrow={el ? "Η ομάδα" : "The team"}
              title={
                el
                  ? "Γνώρισε τους εκπαιδευτές μας."
                  : "Meet our Pilates Instructors."
              }
            />
            <RevealGroup className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {team.map((m) => (
                <RevealItem key={m.id}>
                  <article className="flex h-full flex-col overflow-hidden rounded-3xl border border-mocha-200/70 bg-cream">
                    {/* Portrait fills the top of the card; the monogram stands
                        in for anyone whose photograph is not in yet. */}
                    {m.photoUrl ? (
                      <div className="relative aspect-square w-full overflow-hidden bg-cream-200">
                        <Image
                          src={m.photoUrl}
                          alt={m.name}
                          fill
                          sizes="(min-width: 1024px) 24vw, (min-width: 640px) 45vw, 90vw"
                          quality={84}
                          className="object-cover object-[50%_28%] transition-transform duration-[1400ms] ease-out hover:scale-[1.04]"
                        />
                      </div>
                    ) : (
                      <div className="grid aspect-square w-full place-items-center bg-cream-200">
                        <Monogram className="h-10 w-10 text-clay/40" />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-7">
                      <h3 className="h-display text-2xl">{m.name}</h3>
                      <p className="mt-3 text-sm leading-relaxed text-mocha-500">
                        {el ? m.bioEl : m.bioEn}
                      </p>
                      {/* Sits in the bottom corner, pushed down by mt-auto so
                          it lands on the same line across the row however long
                          each bio runs. */}
                      <div className="mt-auto flex justify-end pt-6">
                        <Monogram className="h-7 w-7 text-clay/40" />
                      </div>
                    </div>
                  </article>
                </RevealItem>
              ))}
            </RevealGroup>
          </div>
        </Section>
      )}
    </>
  );
}
