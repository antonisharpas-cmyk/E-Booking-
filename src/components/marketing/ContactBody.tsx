"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Monogram } from "@/components/ui/Monogram";
import { Reveal } from "@/components/ui/Reveal";
import { Section, SectionHead } from "@/components/ui/Section";
import { useI18n } from "@/i18n/LanguageProvider";
import { STUDIO } from "@/lib/studio";

export function ContactBody() {
  const { t } = useI18n();
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          phone: form.get("phone"),
          message: form.get("message"),
        }),
      });
      if (res.ok) {
        setState("sent");
        formEl.reset();
      } else {
        const data = (await res.json()) as { error?: string };
        setError(data.error ?? t.common.somethingWrong);
        setState("error");
      }
    } catch {
      setError(t.common.somethingWrong);
      setState("error");
    }
  }

  return (
    <Section className="pt-12 md:pt-16">
      <div className="container-x grid gap-16 lg:grid-cols-[1.1fr_1fr] lg:gap-24">
        <div>
          <SectionHead
            eyebrow={t.contactPage.eyebrow}
            title={t.contactPage.title}
            body={t.contactPage.body}
          />

          <Reveal delay={0.1} className="mt-14 space-y-10">
            <div>
              <p className="eyebrow mb-3">{t.contactPage.findTitle}</p>
              <p className="text-[15px] leading-relaxed text-mocha-500">
                {STUDIO.addressLines.map((l) => (
                  <span key={l} className="block">
                    {l}
                  </span>
                ))}
              </p>
              <a
                href={STUDIO.mapsLink}
                target="_blank"
                rel="noreferrer noopener"
                className="link-underline mt-3 inline-block text-[11px] uppercase tracking-widest text-mocha-600"
              >
                Google Maps
              </a>
            </div>

            <div>
              <p className="eyebrow mb-3">{t.contactPage.hoursTitle}</p>
              <p className="text-[15px] leading-relaxed text-mocha-500">
                <span className="block">
                  {t.home.timetable.weekday}: 06:00 – 12:00 · 15:00 – 20:00
                </span>
                <span className="block">
                  {t.home.timetable.saturday}: 07:00 – 11:00
                </span>
                <span className="block text-clay">
                  {t.home.timetable.sunday}: {t.home.timetable.closed}
                </span>
              </p>
            </div>

            <div>
              <p className="eyebrow mb-3">{t.contactPage.followTitle}</p>
              <div className="space-y-2 text-[15px]">
                <a
                  href={STUDIO.instagram}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="link-underline block text-mocha-600"
                >
                  @pilatesbyapex
                </a>
                <a
                  href={`mailto:${STUDIO.email}`}
                  className="link-underline block text-mocha-600"
                >
                  {STUDIO.email}
                </a>
                <a
                  href={`tel:${STUDIO.phone.replace(/\s/g, "")}`}
                  className="link-underline block text-mocha-600"
                >
                  {STUDIO.phone}
                </a>
              </div>
            </div>

            <Monogram className="h-10 w-10 text-clay/40" strokeWidth={2.4} />
          </Reveal>
        </div>

        <Reveal delay={0.18}>
          <form
            onSubmit={submit}
            className="rounded-4xl border border-mocha-200/70 bg-white/70 p-8 backdrop-blur-sm md:p-10"
          >
            {state === "sent" ? (
              <div className="py-16 text-center">
                <Monogram className="mx-auto h-12 w-12 text-mocha-500" strokeWidth={2.2} />
                <p className="mt-8 text-[15px] text-mocha-600">
                  {t.contactPage.formSent}
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="name">
                      {t.contactPage.formName}
                    </label>
                    <input id="name" name="name" required className="input" />
                  </div>
                  <div>
                    <label className="label" htmlFor="email">
                      {t.contactPage.formEmail}
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      className="input"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="phone">
                      {t.contactPage.formPhone}{" "}
                      <span className="text-clay/60">({t.common.optional})</span>
                    </label>
                    <input id="phone" name="phone" className="input" />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label" htmlFor="message">
                      {t.contactPage.formMessage}
                    </label>
                    <textarea
                      id="message"
                      name="message"
                      required
                      rows={6}
                      className="input resize-none"
                    />
                  </div>
                </div>

                {error && (
                  <p className="mt-5 text-sm text-red-600">{error}</p>
                )}

                <Button
                  type="submit"
                  className="mt-8 w-full"
                  disabled={state === "sending"}
                >
                  {state === "sending" ? t.common.loading : t.contactPage.formSubmit}
                </Button>
              </>
            )}
          </form>
        </Reveal>
      </div>
    </Section>
  );
}
