"use client";

import Image from "next/image";
import Link from "next/link";
import { UserAvatar } from "@/components/account/UserAvatar";
import { ButtonLink } from "@/components/ui/Button";
import { Monogram } from "@/components/ui/Monogram";
import { useI18n } from "@/i18n/LanguageProvider";
import { STUDIO } from "@/lib/studio";
import { cn } from "@/lib/utils";

/**
 * Whoever is looking at the cover, if anybody is.
 *
 * The header hides its own account chip over this section — it becomes a
 * centred wordmark with a MENU control, see Header.tsx — so on the home page
 * this is the only place a member can see that they are signed in, or a visitor
 * can find the way in. Hence a third thing under the two buttons rather than
 * relying on the bar above.
 */
export type HeroUser = {
  name: string;
  hasPhoto: boolean;
  credits: number;
} | null;

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
export function Hero({ user }: { user: HeroUser }) {
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
        {/* Lifts the type off the brightest part of the room. Centred on where
            the type actually sits — a little below the middle, since the band
            reserved for the lockup pushes it down — and wide enough to cover
            the first line as well as the second. On a wide, short window the
            headline lands squarely on a lit thigh and a pale curtain, and
            without this the thin strokes of the first line disappear into
            them. */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_66%_54%_at_50%_56%,rgba(42,32,32,0.66),transparent_72%)]" />
        <div className="absolute inset-0 grain" />
      </div>

      {/* The band reserved for the bar above, which over the cover is a centred
          wordmark with its "by APEX Fitness Centre" sub-line (Header.tsx). The
          lockup ends 79px down, so this needs to clear that and no more —
          it used to reserve 13rem, and the 8rem of dead air underneath was
          what pushed the whole composition too low down the screen. Tied to
          the viewport height so a short laptop window keeps its clearance
          without giving up half the cover to emptiness. */}
      <div aria-hidden className="h-[clamp(6.5rem,20svh,9rem)] shrink-0" />

      {/* Centred type, in the lettering of the wordmark.
          translateZ(0) is not decoration: it puts the type on its own
          compositing layer, so it is rasterised once, by itself, instead of
          being re-rasterised along with the photograph drifting underneath it.
          Without it, Windows Chrome renders some letters with parts of their
          stems missing. */}
      <div className="container-x relative flex flex-1 transform-gpu flex-col items-center justify-center overflow-hidden pb-[clamp(4rem,14svh,10rem)] text-center [backface-visibility:hidden]">
        {/* Two shadows, not one: a tight one to give the hairlines an edge
            against anything pale, and a softer one behind it for depth.
            Marcellus is a high-contrast face and its thin strokes are what go
            missing first over a lit background. Both blurs are kept small —
            a wide blur on type this size is an expensive raster, and expensive
            rasters are what tear. */}
        <h1 className="flex flex-col items-center [text-shadow:0_1px_2px_rgba(26,20,20,0.5),0_2px_14px_rgba(26,20,20,0.42)]">
          <span
            className="block animate-fade-up font-wordmark text-[length:max(1.7rem,min(3.2rem,5.2vw,8svh))] uppercase leading-none tracking-[0.30em] text-cream"
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
          className="mt-5 animate-fade-up font-wordmark text-[11px] uppercase tracking-[0.62em] text-cream/85 [text-shadow:0_1px_10px_rgba(26,20,20,0.55)] sm:text-[14px]"
          style={{ animationDelay: "440ms" }}
        >
          {STUDIO.city}
        </p>

        <div
          className="mt-[clamp(1.75rem,4.5svh,3.5rem)] flex animate-fade-in flex-wrap items-center justify-center gap-3"
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

        {/* Under the two buttons, deliberately quieter than both: a way in for a
            visitor, and proof of being signed in for a member. Neither is the
            thing the cover is asking anybody to do, so neither is a third
            button competing with the two above. */}
        <div
          className="mt-[clamp(1.1rem,2.5svh,1.75rem)] animate-fade-in"
          style={{ animationDelay: "700ms" }}
        >
          {user ? (
            <Link
              href="/account"
              aria-label={t.home.hero.memberAccount}
              className={cn(
                "inline-flex items-center gap-2.5 rounded-full border border-cream/30 bg-cream/[0.08] py-1.5 pl-1.5 pr-4",
                "text-cream backdrop-blur-sm transition-colors duration-500 hover:border-cream/60 hover:bg-cream/15",
              )}
            >
              <UserAvatar
                hasPhoto={user.hasPhoto}
                name={user.name}
                className="h-8 w-8 border-cream/25 bg-cream/15 text-cream"
              />
              <span className="text-[13px]">{user.name.split(" ")[0]}</span>
              <span aria-hidden className="text-cream/30">
                ·
              </span>
              {/* The number a returning member actually came to check, and the
                  header is not showing it here. */}
              <span className="text-[13px] text-cream/70 lining-nums tabular-nums">
                {user.credits} {t.common.credits}
              </span>
            </Link>
          ) : (
            /* Two lines rather than one: signing in and signing up are different
               errands, and running them together reads as a single sentence
               nobody finishes. The visitor who has no account is the larger
               group on a home page, so they get their own line. */
            <div className="space-y-1.5 text-center">
              <p className="text-[13px] text-cream/65">
                {t.home.hero.memberAsk}{" "}
                <Link
                  href="/login"
                  className="link-underline text-cream hover:text-cream"
                >
                  {t.home.hero.memberSignIn}
                </Link>
              </p>
              <p className="text-[13px] text-cream/65">
                {t.home.hero.notMemberAsk}{" "}
                <Link
                  href="/register"
                  className="link-underline text-cream hover:text-cream"
                >
                  {t.home.hero.notMemberJoin}
                </Link>
              </p>
            </div>
          )}
        </div>

        {/* The mark closes the composition under the buttons. It is decorative,
            so it is a mask over currentColor rather than another image request
            — and on a short window it steps aside rather than being clipped in
            half by the bottom of the cover. */}
        <Monogram
          className="mt-[clamp(1.5rem,4svh,3.25rem)] h-9 w-9 animate-fade-in text-cream/45 [@media(max-height:700px)]:hidden sm:h-11 sm:w-11"
          style={{ animationDelay: "820ms" }}
        />
      </div>
    </section>
  );
}
