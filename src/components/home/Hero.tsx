"use client";

import Image from "next/image";
import { ButtonLink } from "@/components/ui/Button";
import { Monogram } from "@/components/ui/Monogram";
import { useI18n } from "@/i18n/LanguageProvider";
import { STUDIO } from "@/lib/studio";

/**
 * The cover: a full-viewport photograph of a class with the type centred over
 * it. The header switches to its own centred-wordmark mode over this section
 * (see Header.tsx), so the composition reads as one piece.
 *
 * The photograph is cropped below the faces — nobody in it is identifiable.
 *
 * TYPE: both lines of the headline share one face — `font-wordmark`, set to
 * Marcellus, whose flared stems echo the wordmark's lettering. To try another,
 * change `--font-wordmark` and the <link> in layout.tsx; nothing else needs
 * touching. docs/type-preview.html renders the candidates at this size.
 *
 * Both lines are sized off the *viewport*, width and height together, rather
 * than off breakpoints: the type used to be centred in the whole viewport at a
 * fixed size, so on a laptop window the first line ran straight through the
 * lockup in the bar above it. Now the headline can never grow past a share of
 * the height available to it, and the spacer below the photograph keeps it
 * clear of the bar whatever the window does.
 *
 * The entrance is CSS keyframes with staggered delays. The hero is on the
 * critical path of every first visit, so it carries no animation library.
 */
export function Hero() {
  const { t } = useI18n();

  return (
    <section className="relative -mt-24 flex h-[100svh] min-h-[560px] flex-col overflow-hidden bg-mocha-800">
      <div className="absolute inset-0">
        <Image
          src="/media/class.jpg"
          alt="A Reformer Pilates class in progress at APEX pilates"
          fill
          priority
          sizes="100vw"
          quality={80}
          className="kenburns object-cover object-[54%_38%]"
        />
        {/* Warm scrim: enough to carry cream type at any screen size, without
            flattening the room's light. */}
        <div className="absolute inset-0 bg-mocha-900/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-mocha-900/85 via-mocha-900/20 to-mocha-900/60" />
        {/* lifts the centred type off the brightest part of the room */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_58%_46%_at_50%_46%,rgba(42,32,32,0.62),transparent_70%)]" />
        <div className="absolute inset-0 grain" />
      </div>

      {/* The bar over the cover is a centred wordmark with a "by APEX Fitness
          Centre" sub-line under it (Header.tsx, cover mode). This spacer is
          what the headline is measured from: the section is pulled up 6rem
          under the fixed bar, so the reserved band has to cover that pull plus
          the lockup itself. It never shrinks, so the two can never meet. */}
      <div aria-hidden className="h-[13rem] shrink-0" />

      {/* centred type, in the lettering of the wordmark */}
      <div className="container-x relative flex flex-1 flex-col items-center justify-center overflow-hidden pb-14 text-center sm:pb-16">
        <h1 className="flex flex-col items-center">
          <span
            className="block animate-fade-up font-wordmark text-[length:max(1.7rem,min(3.2rem,5.2vw,8svh))] uppercase leading-none tracking-[0.30em] text-cream/85"
            style={{ animationDelay: "160ms" }}
          >
            {t.home.hero.kicker}
          </span>
          <span
            className="mt-2 block animate-fade-up font-wordmark text-[length:max(4.2rem,min(10.5rem,17vw,26svh))] uppercase leading-[0.9] tracking-[0.01em] text-cream"
            style={{ animationDelay: "300ms" }}
          >
            {t.home.hero.word}
          </span>
        </h1>

        <p
          className="mt-5 animate-fade-up font-wordmark text-[11px] uppercase tracking-[0.62em] text-cream/70 sm:text-[14px]"
          style={{ animationDelay: "440ms" }}
        >
          {STUDIO.city}
        </p>

        <div
          className="mt-[clamp(2rem,5svh,3.5rem)] flex animate-fade-in flex-wrap items-center justify-center gap-3"
          style={{ animationDelay: "620ms" }}
        >
          <ButtonLink href="/timetable" variant="cream" size="lg">
            {t.home.hero.primary}
          </ButtonLink>
          <ButtonLink
            href="/pricing"
            size="lg"
            className="border border-cream/35 bg-transparent text-cream hover:bg-cream hover:text-mocha-700"
          >
            {t.home.hero.secondary}
          </ButtonLink>
        </div>

        {/* The mark closes the composition under the buttons. It is decorative,
            so it is a mask over currentColor rather than another image
            request. */}
        <Monogram
          className="mt-[clamp(1.75rem,4.5svh,3.5rem)] h-9 w-9 animate-fade-in text-cream/45 sm:h-11 sm:w-11"
          style={{ animationDelay: "820ms" }}
        />
      </div>
    </section>
  );
}
