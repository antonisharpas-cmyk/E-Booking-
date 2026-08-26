import { eq } from "drizzle-orm";
import { db } from "@/db";
import { pricingRules, type CreditPackage } from "@/db/schema";

/**
 * What a pack costs today.
 *
 * Two kinds of rule, and a pack takes the more specific one: a rule with no
 * package attached applies to the whole list, and a rule on one pack overrides
 * it for that pack alone. So "20% off everything, but the single class stays
 * full price" is two rows, and switching the offer off is one flag.
 *
 * This is the only place a price is decided. The pricing page, the home page,
 * the checkout summary and the amount actually charged all read it here, which
 * is what stops a discount being shown to a member and not honoured — or worse,
 * honoured and not shown.
 */

export type Money = {
  /** What they pay. */
  cents: number;
  /** What it costs normally, when a discount is running. */
  wasCents: number | null;
  /** "Summer offer", "-€10" — whatever the desk typed. */
  labelEn: string | null;
  labelEl: string | null;
};

export type PricedPackage = Omit<CreditPackage, "priceCents"> & {
  /** The price to charge and to show. */
  priceCents: number;
  /** The list price, when it is being discounted. */
  listPriceCents: number | null;
  discountLabelEn: string | null;
  discountLabelEl: string | null;
};

export type RuleView = {
  id: string;
  packageId: string | null;
  kind: "PERCENT" | "FLAT";
  value: number;
  labelEn: string;
  labelEl: string;
  createdAt: Date;
};

/** The smallest a discounted pack may get, so a bad rule cannot make it free. */
const FLOOR_CENTS = 100;

export function activeRules(): RuleView[] {
  return db
    .select()
    .from(pricingRules)
    .where(eq(pricingRules.active, true))
    .all()
    .map((r) => ({
      id: r.id,
      packageId: r.packageId,
      kind: r.kind === "FLAT" ? "FLAT" : "PERCENT",
      value: r.value,
      labelEn: r.labelEn,
      labelEl: r.labelEl,
      createdAt: r.createdAt,
    }));
}

function apply(listCents: number, rule: RuleView) {
  const off =
    rule.kind === "PERCENT"
      ? Math.round((listCents * rule.value) / 100)
      : rule.value;
  /* Down to a whole euro. A studio price list with stray cents on it looks
     like a mistake, and rounding *down* means the member never pays more than
     the percentage on the card promised them. */
  const raw = Math.max(FLOOR_CENTS, listCents - off);
  return Math.floor(raw / 100) * 100;
}

/** Prices one pack. Pass the rules in when pricing a whole list. */
export function priceOf(
  pack: Pick<CreditPackage, "id" | "priceCents">,
  rules = activeRules(),
): Money {
  /* Most specific wins: a rule for this pack, otherwise the list-wide rule. */
  const own = rules.find((r) => r.packageId === pack.id);
  const list = rules.find((r) => r.packageId === null);
  const rule = own ?? list;

  if (!rule) {
    return { cents: pack.priceCents, wasCents: null, labelEn: null, labelEl: null };
  }

  const cents = apply(pack.priceCents, rule);
  if (cents >= pack.priceCents) {
    /* A rule that saves nothing is not shown as an offer. */
    return { cents: pack.priceCents, wasCents: null, labelEn: null, labelEl: null };
  }

  return {
    cents,
    wasCents: pack.priceCents,
    labelEn: rule.labelEn || defaultLabel(rule, "en"),
    labelEl: rule.labelEl || defaultLabel(rule, "el"),
  };
}

/** Adds the live price to every pack in a list, in one pass. */
export function priceList<T extends Pick<CreditPackage, "id" | "priceCents">>(
  packs: T[],
): (T & {
  priceCents: number;
  listPriceCents: number | null;
  discountLabelEn: string | null;
  discountLabelEl: string | null;
})[] {
  const rules = activeRules();
  return packs.map((p) => {
    const money = priceOf(p, rules);
    return {
      ...p,
      priceCents: money.cents,
      listPriceCents: money.wasCents,
      discountLabelEn: money.labelEn,
      discountLabelEl: money.labelEl,
    };
  });
}

function defaultLabel(rule: RuleView, locale: "en" | "el") {
  if (rule.kind === "PERCENT") {
    return locale === "el" ? `-${rule.value}%` : `${rule.value}% off`;
  }
  const euros = (rule.value / 100).toFixed(0);
  return locale === "el" ? `-€${euros}` : `€${euros} off`;
}

/* --------------------------------------------------------------- the desk */

export function setRule(args: {
  packageId: string | null;
  kind: "PERCENT" | "FLAT";
  value: number;
  labelEn?: string;
  labelEl?: string;
  staffId: string;
}) {
  return db.transaction(() => {
    /* One live rule per scope. Replacing an offer rather than stacking offers
       is the difference between "25% off" and "25% off, twice". */
    const live = db
      .select()
      .from(pricingRules)
      .where(eq(pricingRules.active, true))
      .all()
      .filter((r) => r.packageId === args.packageId);

    for (const r of live) {
      db.update(pricingRules)
        .set({ active: false })
        .where(eq(pricingRules.id, r.id))
        .run();
    }

    return db
      .insert(pricingRules)
      .values({
        packageId: args.packageId,
        kind: args.kind,
        value: args.value,
        labelEn: args.labelEn ?? "",
        labelEl: args.labelEl ?? "",
        createdBy: args.staffId,
      })
      .returning()
      .get();
  });
}

/** Back to the normal price list. Scope null clears the list-wide rule only. */
export function clearRule(packageId: string | null) {
  const live = db
    .select()
    .from(pricingRules)
    .where(eq(pricingRules.active, true))
    .all()
    .filter((r) => r.packageId === packageId);

  for (const r of live) {
    db.update(pricingRules)
      .set({ active: false })
      .where(eq(pricingRules.id, r.id))
      .run();
  }
  return live.length;
}

/** Everything off, in one press. */
export function clearAllRules() {
  const res = db
    .update(pricingRules)
    .set({ active: false })
    .where(eq(pricingRules.active, true))
    .run();
  return res.changes;
}
