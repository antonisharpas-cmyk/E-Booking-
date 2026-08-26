"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Monogram } from "@/components/ui/Monogram";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Section } from "@/components/ui/Section";
import { TestCardForm } from "@/components/checkout/TestCardForm";
import { useI18n } from "@/i18n/LanguageProvider";
import { STUDIO } from "@/lib/studio";

/* Stripe's SDK is a couple of hundred kilobytes. It is fetched when a member
   reaches a card form and never as part of any other page. */
const StripeFields = dynamic(
  () => import("@/components/checkout/StripeFields"),
  { ssr: false },
);

type Pack = {
  id: string;
  slug: string;
  nameEn: string;
  nameEl: string;
  credits: number;
  priceCents: number;
  validityDays: number;
};

type Started =
  | { mode: "fields"; clientSecret: string; publicKey: string; purchaseId: string }
  | {
      mode: "redirect";
      url: string;
      purchaseId: string;
      post?: { action: string; fields: Record<string, string> };
    }
  | { mode: "test"; purchaseId: string };

/**
 * The page where money changes hands.
 *
 * It is deliberately two things side by side and nothing else: what you are
 * buying, and how you are paying. No navigation temptations, no upsells, no
 * second decision to make. The summary stays visible while the card is filled
 * in, because the one question anybody asks at this moment is "how much is this
 * again".
 *
 * The payment half is a slot. Which provider fills it is decided on the server
 * (see src/lib/payments), so this component asks "what should I show" once and
 * renders one of three things: the provider's own card fields, a handover to
 * the provider's page, or the test form used until credentials arrive.
 */
export function CheckoutBody({
  pack,
  member,
  balance,
  payment,
}: {
  pack: Pack;
  member: { name: string; email: string };
  balance: number;
  payment: { id: string | null; label: string | null; configured: boolean };
}) {
  const { t, locale, fmtMoney } = useI18n();
  const c = t.checkoutPage;
  const el = locale === "el";
  const router = useRouter();

  const [started, setStarted] = useState<Started | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);

  const name = el ? pack.nameEl : pack.nameEn;
  const amountLabel = fmtMoney(pack.priceCents);

  /* One payment per visit to this page. The guard matters in development, where
     effects run twice and would otherwise open two payments for one member. */
  const opened = useRef(false);

  useEffect(() => {
    if (opened.current) return;
    opened.current = true;

    (async () => {
      try {
        const res = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ packSlug: pack.slug }),
        });
        const data = (await res.json()) as Record<string, unknown> & {
          error?: string;
        };

        if (data.error) {
          setError(
            data.error === "PAYMENTS_NOT_CONFIGURED"
              ? c.errNotConfigured
              : c.errProvider,
          );
          return;
        }
        setStarted(data as unknown as Started);
      } catch {
        setError(c.errProvider);
      }
    })();
  }, [pack.slug, c.errNotConfigured, c.errProvider]);

  /* Ask our own server to confirm with the provider, then move on. The page we
     land on refreshes the layout, which is what updates the count in the
     header. */
  const finish = useCallback(
    async (purchaseId: string) => {
      setSettling(true);
      try {
        await fetch("/api/payments/settle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ purchaseId }),
        });
      } catch {
        /* Not fatal: the webhook and the success page both pick this up. */
      }
      router.push(`/checkout/success?p=${purchaseId}`);
    },
    [router],
  );

  /* A gateway that only accepts a form POST gets a hidden form, submitted as
     soon as the member presses the button. */
  const postForm = useRef<HTMLFormElement>(null);

  return (
    <Section className="pt-12 md:pt-16">
      <div className="container-x">
        <Reveal>
          <p className="eyebrow mb-4">{c.eyebrow}</p>
          <h1 className="h-display text-[2.4rem] leading-[1.05] sm:text-5xl">
            {c.title}
          </h1>
        </Reveal>

        <div className="mt-12 grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-20">
          {/* ------------------------------------------------ what you are buying */}
          <Reveal>
            <div className="rounded-4xl border border-mocha-200/70 bg-white/70 p-8 backdrop-blur-sm md:p-10 lg:sticky lg:top-28">
              <p className="text-[10px] uppercase tracking-brand text-clay">
                {c.orderTitle}
              </p>

              <div className="mt-7 flex items-baseline justify-between gap-6">
                <div>
                  <p className="font-display text-3xl text-mocha-600">{name}</p>
                  <p className="mt-2 text-[13px] text-clay">
                    {pack.credits} {t.common.credits} ·{" "}
                    {fmtMoney(Math.round(pack.priceCents / pack.credits))}{" "}
                    {c.perClassNote}
                  </p>
                </div>
                <p className="shrink-0 font-display text-3xl lining-nums tabular-nums text-mocha-600">
                  {amountLabel}
                </p>
              </div>

              <dl className="mt-8 space-y-3 border-t border-mocha-200/70 pt-6 text-[13px]">
                <Row
                  k={t.home.hero.stat2}
                  v={`${STUDIO.classLengthMinutes} min`}
                />
                <Row
                  k={c.validityLabel}
                  v={c.validityValue.replace("{n}", String(pack.validityDays))}
                />
                <Row k={c.balanceNow} v={`${balance} ${t.common.credits}`} />
                <Row
                  k={c.afterPurchase}
                  v={`${balance + pack.credits} ${t.common.credits}`}
                  strong
                />
              </dl>

              <div className="mt-8 flex items-baseline justify-between gap-4 border-t border-mocha-200/70 pt-6">
                <span className="text-[11px] uppercase tracking-widest text-mocha-600">
                  {c.total}
                </span>
                <span className="text-right">
                  <span className="block font-display text-4xl lining-nums tabular-nums text-mocha-600">
                    {amountLabel}
                  </span>
                  <span className="mt-1 block text-[11px] text-clay">
                    {c.vat}
                  </span>
                </span>
              </div>

              <div className="mt-8 flex items-center justify-between gap-4">
                <Link
                  href="/pricing"
                  className="link-underline text-[11px] uppercase tracking-widest text-clay"
                >
                  {c.changePack}
                </Link>
                <Monogram className="h-7 w-7 text-clay/40" />
              </div>
            </div>
          </Reveal>

          {/* ------------------------------------------------------- how you pay */}
          {/* No reveal animation on this half. Everything else on the site fades
              in as you scroll to it, but a card form that is invisible until an
              observer fires is not a risk worth taking for a flourish. */}
          <div>
            <div className="rounded-4xl border border-mocha-200/70 bg-cream p-8 md:p-10">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-[10px] uppercase tracking-brand text-clay">
                  {c.payTitle}
                </p>
                {/* Whose account is being topped up. Truncated rather than
                    wrapped: a long address should not push the panel about. */}
                <p
                  title={member.email}
                  className="max-w-[55%] truncate text-[11px] text-clay"
                >
                  {member.email}
                </p>
              </div>

              <div className="mt-8">
                {error && (
                  <p
                    role="alert"
                    className="rounded-2xl border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-700"
                  >
                    {error}
                  </p>
                )}

                {!error && !started && (
                  <p className="py-10 text-center text-sm text-clay">
                    {t.common.loading}
                  </p>
                )}

                {started?.mode === "fields" && (
                  <StripeFields
                    publicKey={started.publicKey}
                    clientSecret={started.clientSecret}
                    returnUrl={`${window.location.origin}/checkout/success?p=${started.purchaseId}`}
                    amountLabel={amountLabel}
                    onPaid={() => void finish(started.purchaseId)}
                  />
                )}

                {started?.mode === "test" && (
                  <TestCardForm
                    amountLabel={amountLabel}
                    onPaid={() => finish(started.purchaseId)}
                  />
                )}

                {started?.mode === "redirect" && (
                  <div>
                    <p className="text-[15px] leading-relaxed text-mocha-600">
                      {c.redirectTitle.replace(
                        "{provider}",
                        payment.label ?? "",
                      )}
                    </p>
                    <p className="mt-3 text-sm text-clay">{c.redirectBody}</p>

                    {started.post ? (
                      <>
                        <form
                          ref={postForm}
                          action={started.post.action}
                          method="POST"
                          className="hidden"
                        >
                          {Object.entries(started.post.fields).map(([k, v]) => (
                            <input key={k} type="hidden" name={k} value={v} />
                          ))}
                        </form>
                        <Button
                          size="lg"
                          className="mt-8 w-full"
                          onClick={() => postForm.current?.submit()}
                        >
                          {c.redirectButton.replace(
                            "{provider}",
                            payment.label ?? "",
                          )}
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="lg"
                        className="mt-8 w-full"
                        onClick={() => {
                          window.location.href = started.url;
                        }}
                      >
                        {c.redirectButton.replace(
                          "{provider}",
                          payment.label ?? "",
                        )}
                      </Button>
                    )}
                  </div>
                )}

                {settling && (
                  <p className="mt-6 text-center text-sm text-clay">
                    {c.paying}
                  </p>
                )}
              </div>

              <p className="mt-8 flex items-start gap-3 border-t border-mocha-200/70 pt-6 text-[12px] leading-relaxed text-clay">
                <Lock />
                {payment.label && payment.id !== "test"
                  ? c.secure.replace("{provider}", payment.label)
                  : c.secureGeneric}
              </p>
            </div>
          </div>
        </div>
      </div>
    </Section>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-6">
      <dt className="text-clay">{k}</dt>
      <dd
        className={
          strong
            ? "lining-nums tabular-nums text-mocha-600"
            : "lining-nums tabular-nums text-mocha-500"
        }
      >
        {v}
      </dd>
    </div>
  );
}

function Lock() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="mt-px h-4 w-4 shrink-0 text-clay/70"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </svg>
  );
}
