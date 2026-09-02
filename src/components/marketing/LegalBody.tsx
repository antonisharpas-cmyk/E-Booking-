"use client";

import { Section } from "@/components/ui/Section";
import { useI18n } from "@/i18n/LanguageProvider";
import { legalSections } from "@/lib/legal";

/**
 * One of the two readers of lib/legal.ts, the other being the modal on the
 * sign-up form. The words live there so that accepting them at sign-up and
 * reading them on this page cannot be two different documents.
 */
export function LegalBody({ kind }: { kind: "privacy" | "terms" }) {
  const { t, locale } = useI18n();

  /* One copy of the text, shared with the sign-up modal. See lib/legal.ts. */
  const items = legalSections(kind, locale);

  return (
    <Section className="pt-12 md:pt-16">
      <div className="container-x max-w-3xl">
        <p className="eyebrow mb-5">{t.footer.legal}</p>
        <h1 className="h-display text-[2.4rem] leading-tight sm:text-5xl">
          {kind === "privacy" ? t.legal.privacyTitle : t.legal.termsTitle}
        </h1>
        <p className="mt-6 rounded-2xl border border-gold/40 bg-[#FBF6E7] px-5 py-4 text-[13px] text-mocha-700">
          {t.legal.placeholder}
        </p>

        <div className="mt-12 space-y-10">
          {items.map(({ title, body }) => (
            <div key={title} className="border-t border-mocha-200/70 pt-8">
              <h2 className="text-[13px] uppercase tracking-widest">{title}</h2>
              {/* `whitespace-pre-line` because some sections are two paragraphs and HTML
                  collapses the blank line between them. Written as text with a
                  blank line rather than as an array, so the words stay readable
                  in lib/legal.ts where a lawyer will edit them. */}
              <p className="mt-3 whitespace-pre-line text-[15px] leading-[1.9] text-mocha-500">
                {body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
