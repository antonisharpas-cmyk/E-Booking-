"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ButtonLink } from "@/components/ui/Button";
import { Monogram } from "@/components/ui/Monogram";
import { ReformerArt } from "@/components/ui/ReformerArt";
import { useI18n } from "@/i18n/LanguageProvider";

export function Hero() {
  const { t } = useI18n();
  const reduce = useReducedMotion();

  const words = t.home.hero.title.split(" ");

  const stats = [
    { label: t.home.hero.stat1, value: t.home.hero.stat1v },
    { label: t.home.hero.stat2, value: t.home.hero.stat2v },
    { label: t.home.hero.stat3, value: t.home.hero.stat3v },
  ];

  return (
    <section className="relative overflow-hidden pb-16 pt-10 md:pb-24 md:pt-16">
      {/* soft light behind the type */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-12%] h-[640px] w-[900px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,rgba(160,141,133,0.20),transparent_65%)] animate-breathe"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-cream-200/70"
      />

      <div className="container-x relative">
        <motion.p
          initial={reduce ? undefined : { opacity: 0, y: 12 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="eyebrow mb-8 flex items-center gap-3"
        >
          <span className="h-px w-8 bg-clay/50" />
          {t.home.hero.eyebrow}
        </motion.p>

        <h1 className="h-display max-w-4xl text-[3rem] leading-[1.02] sm:text-[4.2rem] md:text-[5.6rem]">
          {words.map((w, i) => (
            <motion.span
              key={`${w}-${i}`}
              className="mr-[0.28em] inline-block"
              initial={reduce ? undefined : { opacity: 0, y: 28 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              transition={{
                duration: 1,
                delay: 0.1 + i * 0.09,
                ease: [0.16, 1, 0.3, 1],
              }}
            >
              {w}
            </motion.span>
          ))}
        </h1>

        <motion.div
          initial={reduce ? undefined : { opacity: 0 }}
          animate={reduce ? undefined : { opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="mt-10 flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between"
        >
          <p className="max-w-lg text-[15px] leading-relaxed text-mocha-500">
            {t.home.hero.subtitle}
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <ButtonLink href="/timetable" size="lg">
              {t.home.hero.primary}
            </ButtonLink>
            <ButtonLink href="/pricing" variant="outline" size="lg">
              {t.home.hero.secondary}
            </ButtonLink>
          </div>
        </motion.div>

        {/* the machine */}
        <motion.div
          initial={reduce ? undefined : { opacity: 0, y: 40 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={{ duration: 1.4, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
          className="relative mt-16 md:mt-20"
        >
          <ReformerArt className="text-mocha-600" />
          <div className="pointer-events-none absolute inset-x-0 -bottom-2 h-8 bg-[radial-gradient(ellipse_at_center,rgba(91,70,69,0.14),transparent_70%)]" />
        </motion.div>

        <motion.div
          initial={reduce ? undefined : { opacity: 0 }}
          animate={reduce ? undefined : { opacity: 1 }}
          transition={{ duration: 1, delay: 0.9 }}
          className="mt-14 grid grid-cols-2 gap-8 border-t border-mocha-200/70 pt-10 sm:grid-cols-4"
        >
          {stats.map((s) => (
            <div key={s.label}>
              <p className="font-display text-3xl font-light text-mocha-600">
                {s.value}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-widest text-clay">
                {s.label}
              </p>
            </div>
          ))}
          <div className="flex items-center gap-3 text-clay">
            <Monogram className="h-9 w-9" strokeWidth={2.4} />
            <span className="text-[10px] uppercase tracking-widest">
              APEX pilates™
            </span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
