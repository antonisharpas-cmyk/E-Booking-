"use client";

import { ClassTypeGrid, type ClassTypeCard } from "@/components/marketing/ClassTypeGrid";
import { Faq } from "@/components/marketing/Faq";
import { PricingGrid, type PackageCard } from "@/components/marketing/PricingGrid";
import { ButtonLink } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Section, SectionHead } from "@/components/ui/Section";
import { useI18n } from "@/i18n/LanguageProvider";

export function ClassesPreview({ types }: { types: ClassTypeCard[] }) {
  const { t } = useI18n();
  return (
    <Section>
      <div className="container-x">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHead
            eyebrow={t.home.classes.eyebrow}
            title={t.home.classes.title}
            body={t.home.classes.body}
          />
          <Reveal delay={0.1}>
            <ButtonLink href="/classes" variant="outline">
              {t.home.classes.cta}
            </ButtonLink>
          </Reveal>
        </div>
        <div className="mt-16">
          <ClassTypeGrid types={types} />
        </div>
      </div>
    </Section>
  );
}

export function PricingPreview({
  packages,
  signedIn,
}: {
  packages: PackageCard[];
  signedIn: boolean;
}) {
  const { t } = useI18n();
  return (
    <Section tone="sand">
      <div className="container-x">
        <div className="flex flex-wrap items-end justify-between gap-8">
          <SectionHead
            eyebrow={t.home.pricing.eyebrow}
            title={t.home.pricing.title}
            body={t.home.pricing.body}
          />
          <Reveal delay={0.1}>
            <ButtonLink href="/pricing" variant="outline">
              {t.home.pricing.cta}
            </ButtonLink>
          </Reveal>
        </div>
        <div className="mt-16">
          <PricingGrid
            packages={packages}
            signedIn={signedIn}
            showIncludes={false}
          />
        </div>
      </div>
    </Section>
  );
}

export function FaqSection() {
  const { t } = useI18n();
  return (
    <Section>
      <div className="container-x grid gap-16 lg:grid-cols-[0.8fr_1.2fr] lg:gap-24">
        <SectionHead eyebrow={t.home.faq.eyebrow} title={t.home.faq.title} />
        <Faq />
      </div>
    </Section>
  );
}
