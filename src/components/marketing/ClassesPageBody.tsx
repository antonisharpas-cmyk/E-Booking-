"use client";

import { ClassTypeGrid, type ClassTypeCard } from "@/components/marketing/ClassTypeGrid";
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
              title={el ? "Ποιος σε καθοδηγεί." : "Who is guiding you."}
            />
            <RevealGroup className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              {team.map((m) => (
                <RevealItem key={m.id}>
                  <article className="flex h-full flex-col rounded-3xl border border-mocha-200/70 bg-cream p-8">
                    <Monogram className="h-8 w-8 text-clay/50" strokeWidth={2.8} />
                    <h3 className="h-display mt-8 text-2xl">{m.name}</h3>
                    <p className="mt-3 text-sm leading-relaxed text-mocha-500">
                      {el ? m.bioEl : m.bioEn}
                    </p>
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
