"use client";

import { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export type ClassTypeCard = {
  slug: string;
  nameEn: string;
  nameEl: string;
  descEn: string;
  descEl: string;
  level: string;
  intensity: number;
  focusEn: string;
  focusEl: string;
};

const LEVEL_LABEL: Record<string, { en: string; el: string }> = {
  ALL: { en: "All levels", el: "Όλα τα επίπεδα" },
  BEGINNER: { en: "Beginner", el: "Αρχάριοι" },
  INTERMEDIATE: { en: "Intermediate", el: "Μεσαίο" },
  ADVANCED: { en: "Advanced", el: "Προχωρημένοι" },
};

export function ClassTypeGrid({
  types,
  compact = false,
}: {
  types: ClassTypeCard[];
  compact?: boolean;
}) {
  const { locale, t } = useI18n();
  const el = locale === "el";

  return (
    <RevealGroup
      className={cn(
        "grid gap-6",
        compact ? "md:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-3",
      )}
    >
      {types.map((c) => (
        <RevealItem key={c.slug}>
          <article className="group flex h-full flex-col rounded-3xl border border-mocha-200/70 bg-white/60 p-8 transition-all duration-700 ease-silk hover:-translate-y-1 hover:border-mocha-300 hover:bg-white hover:shadow-soft">
            <div className="flex items-start justify-between gap-4">
              <h3 className="h-display text-2xl">{el ? c.nameEl : c.nameEn}</h3>
              <Intensity level={c.intensity} />
            </div>

            <p className="mt-2 text-[10px] uppercase tracking-widest text-clay">
              {el
                ? (LEVEL_LABEL[c.level]?.el ?? c.level)
                : (LEVEL_LABEL[c.level]?.en ?? c.level)}
            </p>

            {!compact && (
              <p className="mt-6 text-sm leading-relaxed text-mocha-500">
                {el ? c.descEl : c.descEn}
              </p>
            )}

            <div className="mt-auto pt-8">
              <p className="text-[10px] uppercase tracking-widest text-clay/80">
                {t.classesPage.focusLabel}
              </p>
              <p className="mt-2 text-[12px] text-mocha-600">
                {el ? c.focusEl : c.focusEn}
              </p>
            </div>
          </article>
        </RevealItem>
      ))}
    </RevealGroup>
  );
}

function Intensity({ level }: { level: number }) {
  return (
    <span className="flex shrink-0 items-center gap-1 pt-2" aria-label={`Intensity ${level} of 3`}>
      {[1, 2, 3].map((n) => (
        <span
          key={n}
          className={cn(
            "h-1.5 w-1.5 rounded-full transition-colors",
            n <= level ? "bg-mocha-500" : "bg-mocha-200",
          )}
        />
      ))}
    </span>
  );
}
