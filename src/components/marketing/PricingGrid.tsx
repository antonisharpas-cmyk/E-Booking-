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
  /** What it costs today, offer included. */
  priceCents: number;
  /** The normal price, when an offer is running. */
  listPriceCents?: number | null;
  discountLabelEn?: string | null;
  discountLabelEl?: string | null;
  validityDays: number;
  badge: string | null;
  /** Which commitment it belongs to, so the page can group the cards. */
  group?: "single" | "month" | "quarter" | null;
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
  const el = locale === "el";

  /* The pack card no longer takes the payment. It sends the member to the
     checkout page, which is where the order and the card sit side by side —
     the same shape as any shop, and it means the buy button never has to
     explain a provider error to somebody who has not decided to pay yet. */
  function buy(pkg: PackageCard) {
    const next = `/checkout?pack=${pkg.slug}`;
    setBusy(pkg.id);
    router.push(
      signedIn ? next : `/login?next=${encodeURIComponent(next)}&pkg=${pkg.slug}`,
    );
  }

  /* Grouped by commitment rather than shown as one wall of nine cards.
     "Monthly · 3 a week" and "3 months · 1 a week" are both twelve classes; side
     by side in a plain grid nobody can tell what separates them. Under a heading
     that says how long you are committing and how long you have to use them, the
     choice reads as two questions — how often, and for how long. */
  const GROUPS = ["single", "month", "quarter"] as const;
  const grouped = GROUPS.map((g) => ({
    key: g,
    heading: t.pricingPage.groups[g],
    packs: packages.filter((p) => (p.group ?? "month") === g),
  })).filter((g) => g.packs.length > 0);

  return (
    <div className="space-y-14">
      {grouped.map((section) => (
      <section key={section.key}>
        <div className="mb-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-mocha-200/70 pb-4">
          <h3 className="h-display text-[1.6rem] text-mocha-600">
            {section.heading.title}
          </h3>
          <p className="text-[13px] text-clay">{section.heading.note}</p>
        </div>
      <RevealGroup
        className={cn(
          "grid gap-6 sm:grid-cols-2",
          section.packs.length % 4 === 0 ? "xl:grid-cols-4" : "xl:grid-cols-3",
        )}
      >
        {section.packs.map((p) => {
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

                {/* When an offer is running the old price stays on the card,
                    struck through. A discount nobody can see the size of is
                    not much of a discount. */}
                <p
                  className={cn(
                    "h-display mt-5 flex items-baseline gap-3 text-5xl",
                    highlight ? "text-cream" : "text-mocha-600",
                  )}
                >
                  {fmtMoney(p.priceCents)}
                  {p.listPriceCents ? (
                    <span
                      className={cn(
                        "text-2xl line-through",
                        highlight ? "text-cream/45" : "text-clay/70",
                      )}
                    >
                      {fmtMoney(p.listPriceCents)}
                    </span>
                  ) : null}
                </p>

                {p.listPriceCents ? (
                  <p
                    className={cn(
                      "mt-3 inline-flex rounded-full px-3 py-1 text-[10px] uppercase tracking-widest",
                      highlight
                        ? "bg-cream/15 text-cream"
                        : "bg-gold/15 text-[#8a6f1a]",
                    )}
                  >
                    {(el ? p.discountLabelEl : p.discountLabelEn) ||
                      t.pricingPage.offer}
                  </p>
                ) : null}

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
                    {/* The same words whether or not they are signed in. A
                        card that says "sign in to buy" asks for a decision
                        about accounts before the decision about buying; if
                        they are not signed in, the login page comes and goes
                        and drops them on the checkout anyway. */}
                    {busy === p.id ? t.common.loading : t.pricingPage.buy}
                  </Button>
                </div>
              </article>
            </RevealItem>
          );
        })}
      </RevealGroup>
      </section>
      ))}

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
