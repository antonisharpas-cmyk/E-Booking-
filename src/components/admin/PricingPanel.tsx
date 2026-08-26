"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { useI18n } from "@/i18n/LanguageProvider";
import { cn } from "@/lib/utils";

/**
 * The offer running on the price list.
 *
 * Two things make this safe to hand to the desk. The prices are worked out in
 * one place on the server, so what a member is shown is what they are charged;
 * and every pack is listed here with its old and new price side by side, so
 * nobody has to trust arithmetic done in their head at the counter.
 *
 * "Back to normal prices" clears everything in one press. That matters more
 * than it sounds: an offer that is hard to switch off is an offer that runs all
 * summer by accident.
 */

type Pack = {
  id: string;
  slug: string;
  nameEn: string;
  credits: number;
  priceCents: number;
  listPriceCents: number | null;
  discountLabelEn: string | null;
};

type Rule = {
  id: string;
  packageId: string | null;
  kind: "PERCENT" | "FLAT";
  value: number;
  labelEn: string;
};

export function PricingPanel({
  packs,
  onNotice,
}: {
  packs: Pack[];
  onNotice: (s: string) => void;
}) {
  const { t, fmtMoney } = useI18n();
  const d = t.desk;
  const router = useRouter();

  const [rules, setRules] = useState<Rule[]>([]);
  const [scope, setScope] = useState<string>("");
  const [kind, setKind] = useState<"PERCENT" | "FLAT">("PERCENT");
  const [value, setValue] = useState("20");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/pricing");
    if (!res.ok) return;
    const data = (await res.json()) as { rules: Rule[] };
    setRules(data.rules ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function apply() {
    setBusy("apply");
    try {
      const raw = Number(value.replace(",", "."));
      const res = await fetch("/api/admin/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: scope || null,
          kind,
          /* Percent goes as typed; euros go as cents. */
          value: kind === "PERCENT" ? Math.round(raw) : Math.round(raw * 100),
          labelEn: label || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (data.error) {
        onNotice(data.error);
        return;
      }
      onNotice(d.priceApplied);
      await load();
      /* The pack prices on this page come from the server, so a refresh is what
         shows the new numbers — and proves they are the real ones rather than
         arithmetic done in the browser. router.refresh() rather than a reload,
         so the desk stays on this tab instead of being thrown back to Today. */
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  async function clear(all: boolean, packageId?: string | null) {
    setBusy(all ? "clear" : (packageId ?? "list"));
    try {
      const q = all
        ? "all=1"
        : packageId
          ? `packageId=${packageId}`
          : "";
      await fetch(`/api/admin/pricing?${q}`, { method: "DELETE" });
      onNotice(d.priceCleared);
      await load();
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  const listRule = rules.find((r) => r.packageId === null);

  return (
    <div className="mt-10 space-y-6">
      <div className="rounded-3xl border border-mocha-200/70 bg-white/60 p-6">
        <p className="text-[10px] uppercase tracking-brand text-clay">
          {d.priceTitle}
        </p>
        <p className="mt-3 max-w-2xl text-[12px] leading-relaxed text-clay">
          {d.priceHelp}
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block">
            <span className="label">{d.priceScope}</span>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="input"
            >
              <option value="">{d.priceAll}</option>
              {packs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nameEn}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">{d.priceKind}</span>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "PERCENT" | "FLAT")}
              className="input"
            >
              <option value="PERCENT">{d.pricePercent}</option>
              <option value="FLAT">{d.priceFlat}</option>
            </select>
          </label>

          <label className="block">
            <span className="label">{d.priceValue}</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              className="input lining-nums tabular-nums"
            />
          </label>

          <label className="block">
            <span className="label">{d.priceLabel}</span>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Summer offer"
              className="input"
            />
          </label>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button size="sm" disabled={busy === "apply"} onClick={apply}>
            {busy === "apply" ? t.common.loading : d.priceApply}
          </Button>
          {rules.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              disabled={busy === "clear"}
              onClick={() => void clear(true)}
            >
              {d.priceClear}
            </Button>
          )}
        </div>
      </div>

      {/* what it does to the list */}
      <div className="rounded-3xl border border-mocha-200/70 bg-white/60 p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <p className="text-[10px] uppercase tracking-brand text-clay">
            {d.priceLive}
          </p>
          {listRule && (
            <p className="text-[11px] text-clay">
              {d.priceAll}:{" "}
              {listRule.kind === "PERCENT"
                ? `${listRule.value}%`
                : fmtMoney(listRule.value)}
            </p>
          )}
        </div>

        {rules.length === 0 && (
          <p className="mt-5 text-sm text-clay">{d.priceNone}</p>
        )}

        <ul className="mt-5 divide-y divide-mocha-200/70">
          {packs.map((p) => {
            const own = rules.find((r) => r.packageId === p.id);
            return (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <span className="text-[14px] text-mocha-600">
                  {p.nameEn}
                  <span className="ml-3 text-[12px] text-clay">
                    {p.credits} {t.common.credits}
                  </span>
                  {own && (
                    <span className="ml-3 rounded-full bg-mocha-100 px-2 py-0.5 text-[10px] uppercase tracking-widest text-mocha-500">
                      {own.kind === "PERCENT"
                        ? `${own.value}%`
                        : fmtMoney(own.value)}
                    </span>
                  )}
                </span>

                <span className="flex items-center gap-4">
                  <span className="lining-nums tabular-nums">
                    {p.listPriceCents ? (
                      <>
                        <span className="text-clay line-through">
                          {fmtMoney(p.listPriceCents)}
                        </span>
                        <span className="ml-2 text-mocha-600">
                          {fmtMoney(p.priceCents)}
                        </span>
                      </>
                    ) : (
                      <span className="text-mocha-600">
                        {fmtMoney(p.priceCents)}
                      </span>
                    )}
                  </span>
                  {p.listPriceCents && (
                    <span
                      className={cn(
                        "rounded-full bg-gold/15 px-2.5 py-1 text-[10px] uppercase tracking-widest text-[#8a6f1a]",
                      )}
                    >
                      {p.discountLabelEn}
                    </span>
                  )}
                  {own && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy === p.id}
                      onClick={() => void clear(false, p.id)}
                    >
                      {t.common.cancel}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
