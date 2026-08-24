"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { Monogram } from "@/components/ui/Monogram";
import { Section } from "@/components/ui/Section";
import { useI18n } from "@/i18n/LanguageProvider";

/**
 * Stripe redirects here immediately after payment, which can be a moment
 * before the webhook has granted the credits. If the balance still looks
 * unchanged we re-check a few times rather than showing a wrong number.
 */
export function CheckoutResult({
  kind,
  credits,
}: {
  kind: "success" | "cancelled";
  credits: number;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const [waiting, setWaiting] = useState(kind === "success" && credits === 0);

  useEffect(() => {
    if (!waiting) return;
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      router.refresh();
      if (tries >= 5 || credits > 0) {
        setWaiting(false);
        window.clearInterval(id);
      }
    }, 1800);
    return () => window.clearInterval(id);
  }, [waiting, credits, router]);

  const success = kind === "success";

  return (
    <Section className="py-28 md:py-36">
      <div className="container-x max-w-2xl text-center">
        <Monogram className="mx-auto h-14 w-14 text-clay/60" />

        <h1 className="h-display mt-10 text-[2.6rem] leading-tight sm:text-5xl">
          {success ? t.checkout.successTitle : t.checkout.cancelTitle}
        </h1>
        <p className="mx-auto mt-5 max-w-md text-[15px] leading-relaxed text-mocha-500">
          {success ? t.checkout.successBody : t.checkout.cancelBody}
        </p>

        {success && (
          <p className="mt-10 inline-flex items-baseline gap-3 rounded-full border border-mocha-200 bg-white/70 px-6 py-3">
            <span className="font-display text-3xl text-mocha-600">
              {waiting ? "…" : credits}
            </span>
            <span className="text-[11px] uppercase tracking-widest text-clay">
              {waiting ? t.checkout.processing : t.common.creditsLeft}
            </span>
          </p>
        )}

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href={success ? "/timetable" : "/pricing"} size="lg">
            {success ? t.checkout.successCta : t.checkout.cancelCta}
          </ButtonLink>
          <ButtonLink href="/account" variant="outline" size="lg">
            {t.nav.account}
          </ButtonLink>
        </div>
      </div>
    </Section>
  );
}
