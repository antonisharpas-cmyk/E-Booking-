"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { RevealGroup, RevealItem } from "@/components/ui/Reveal";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

export type PackageCard = {
  id: string;
  slug: string;
  nameEn: string;
  nameEl: string;
  credits: number;
  priceCents: number;
  validityDays: number;
  badge: string | null;
};

export function PricingGrid({
  packages,
  signedIn,
  showIncludes = true,
}: {
  packages: PackageCard[];
  signedIn: boolean;
  showIncludes?: boolean;
}) {
  const { t, locale, fmtMoney } = useI18n();
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const el = locale === "el";

  async function buy(pkg: PackageCard) {
    if (!signedIn) {
      router.push(`/login?next=/pricing&pkg=${pkg.slug}`);
      return;
    }
    setBusy(pkg.id);
    setError(null);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: pkg.id }),
      });
      const data = (await res.json()) as {
        url?: string;
        error?: string;
        devGranted?: boolean;
      };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      if (data.devGranted) {
        router.push("/checkout/success?dev=1");
        return;
      }
      const friendly: Record<string, string> = {
        PAYMENTS_NOT_CONFIGURED:
          "Card payments are not switched on yet — please contact the studio to buy a pack.",
        PAYMENT_PROVIDER_ERROR:
          "The payment provider could not be reached. Please try again in a moment.",
        UNAUTHENTICATED: t.pricingPage.buySignedOut,
      };
      setError(friendly[data.error ?? ""] ?? t.common.somethingWrong);
    } catch {
      setError(t.common.somethingWrong);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <RevealGroup className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {packages.map((p) => {
          const perClass = Math.round(p.priceCents / p.credits);
          const highlight = p.badge === "POPULAR";
          return (
            <RevealItem key={p.id}>
              <article
                className={cn(
                  "relative flex h-full flex-col rounded-3xl border p-8 transition-all duration-700 ease-silk hover:-translate-y-1",
                  highlight
                    ? "border-mocha-600 bg-mocha-600 text-cream shadow-lift"
                    : "border-mocha-200/70 bg-white/60 hover:border-mocha-300 hover:bg-white hover:shadow-soft",
                )}
              >
                {p.badge && (
                  <span
                    className={cn(
                      "absolute -top-3 left-8 rounded-full px-3 py-1 text-[9px] uppercase tracking-widest",
                      highlight
                        ? "bg-cream text-mocha-700"
                        : "bg-mocha-600 text-cream",
                    )}
                  >
                    {p.badge === "POPULAR"
                      ? t.pricingPage.popular
                      : t.pricingPage.bestValue}
                  </span>
                )}

                <p
                  className={cn(
                    "text-[11px] uppercase tracking-widest",
                    highlight ? "text-cream/60" : "text-clay",
                  )}
                >
                  {el ? p.nameEl : p.nameEn}
                </p>

                <p
                  className={cn(
                    "h-display mt-5 text-5xl",
                    highlight ? "text-cream" : "text-mocha-600",
                  )}
                >
                  {fmtMoney(p.priceCents)}
                </p>

                <p
                  className={cn(
                    "mt-2 text-[12px]",
                    highlight ? "text-cream/60" : "text-mocha-500",
                  )}
                >
                  {fmtMoney(perClass)} {t.pricingPage.perClassLabel}
                </p>

                <div
                  className={cn(
                    "mt-8 space-y-3 border-t pt-6 text-[13px]",
                    highlight
                      ? "border-cream/15 text-cream/75"
                      : "border-mocha-200/70 text-mocha-500",
                  )}
                >
                  <p className="flex items-center justify-between">
                    <span>{t.common.credits}</span>
                    <span
                      className={cn(
                        "font-display text-xl",
                        highlight ? "text-cream" : "text-mocha-600",
                      )}
                    >
                      {p.credits}
                    </span>
                  </p>
                  <p className="flex items-center justify-between">
                    <span>{t.pricingPage.validity}</span>
                    <span>
                      {p.validityDays} {t.pricingPage.days}
                    </span>
                  </p>
                </div>

                <div className="mt-auto pt-8">
                  <Button
                    onClick={() => buy(p)}
                    disabled={busy === p.id}
                    variant={highlight ? "cream" : "solid"}
                    className="w-full"
                  >
                    {busy === p.id
                      ? t.common.loading
                      : signedIn
                        ? t.pricingPage.buy
                        : t.pricingPage.buySignedOut}
                  </Button>
                </div>
              </article>
            </RevealItem>
          );
        })}
      </RevealGroup>

      {error && (
        <p className="mt-6 rounded-xl border border-red-300/60 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      {showIncludes && (
        <div className="mt-16 grid gap-10 rounded-3xl border border-mocha-200/70 bg-cream-200/60 p-8 md:grid-cols-[1fr_1.2fr] md:p-10">
          <div>
            <p className="eyebrow mb-4">{t.pricingPage.included}</p>
            <ul className="space-y-3">
              {t.pricingPage.includes.map((i) => (
                <li key={i} className="flex gap-3 text-sm text-mocha-500">
                  <span className="mt-2 h-1 w-4 shrink-0 bg-clay/60" />
                  {i}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid gap-8 sm:grid-cols-2">
            <div>
              <h3 className="text-[13px] uppercase tracking-widest">
                {t.pricingPage.privateTitle}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-mocha-500">
                {t.pricingPage.privateBody}
              </p>
              <ButtonLink
                href="/contact"
                variant="outline"
                size="sm"
                className="mt-5"
              >
                {t.pricingPage.privateCta}
              </ButtonLink>
            </div>
            <div>
              <h3 className="text-[13px] uppercase tracking-widest">
                {t.pricingPage.corporateTitle}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-mocha-500">
                {t.pricingPage.corporateBody}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
