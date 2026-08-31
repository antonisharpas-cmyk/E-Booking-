/**
 * The session packs the studio sells, and the portraits of the people teaching.
 *
 * Both used to live only in the seed script, which meant withdrawing a pack or
 * adding a photograph did nothing until somebody remembered to run
 * `npm run db:seed`. Anyone pulling the repo and starting the dev server saw
 * the old catalogue and wondered why the change had not landed.
 *
 * So this file is the source of truth, the seed reads from it, and the
 * catalogue repairs itself against it on first read (see catalogue-repair.ts).
 * The database still holds the rows — purchases and credit batches point at
 * them — but the list of what is on sale is decided here.
 */

/**
 * Which commitment a pack belongs to.
 *
 * The price list needs it because "Monthly · 3 a week" and "3 months · 1 a week"
 * are both twelve classes and a visitor reading nine cards in a grid cannot see
 * which is which. Grouped under headings, the choice is obvious: how often do I
 * train, and for how long am I committing.
 */
export type PackGroup = "single" | "month" | "quarter";

export const PACKS = [
  {
    slug: "single",
    nameEn: "Single class",
    nameEl: "Μονό μάθημα",
    credits: 1,
    priceCents: 2000,
    validityDays: 30,
    badge: null as string | null,
    sortOrder: 1,
    group: "single" as PackGroup,
  },

  /* ---------------------------------------------------------------- monthly
     Priced by how many times a week somebody trains, because that is how
     people actually decide. The session count is the arithmetic of that
     choice — one a week is four — and it is what the balance is spent from. */
  {
    slug: "month-1",
    nameEn: "Monthly · 1 a week",
    nameEl: "Μηνιαίο · 1 την εβδομάδα",
    credits: 4,
    priceCents: 6000,
    validityDays: 30,
    badge: null as string | null,
    sortOrder: 2,
    group: "month" as PackGroup,
  },
  {
    slug: "month-2",
    nameEn: "Monthly · 2 a week",
    nameEl: "Μηνιαίο · 2 την εβδομάδα",
    credits: 8,
    priceCents: 11000,
    validityDays: 30,
    /* The mainstream choice: twice a week at a round hundred euro. */
    badge: "POPULAR" as string | null,
    sortOrder: 3,
    group: "month" as PackGroup,
  },
  {
    slug: "month-3",
    nameEn: "Monthly · 3 a week",
    nameEl: "Μηνιαίο · 3 την εβδομάδα",
    credits: 12,
    priceCents: 15000,
    validityDays: 30,
    badge: null as string | null,
    sortOrder: 4,
    group: "month" as PackGroup,
  },
  {
    slug: "month-4",
    nameEn: "Monthly · 4 a week",
    nameEl: "Μηνιαίο · 4 την εβδομάδα",
    credits: 16,
    priceCents: 18000,
    validityDays: 30,
    badge: null as string | null,
    sortOrder: 5,
    group: "month" as PackGroup,
  },

  /* -------------------------------------------------------------- 3 months
     The same four cadences over twelve weeks, at a lower rate per class for
     the longer commitment. Ninety days to use them, so a holiday or a bad
     week does not cost the member their money — which is the actual reason
     somebody buys three months rather than three ones. */
  {
    slug: "quarter-1",
    nameEn: "3 months · 1 a week",
    nameEl: "3 μήνες · 1 την εβδομάδα",
    credits: 12,
    priceCents: 16000,
    validityDays: 90,
    badge: null as string | null,
    sortOrder: 6,
    group: "quarter" as PackGroup,
  },
  {
    slug: "quarter-2",
    nameEn: "3 months · 2 a week",
    nameEl: "3 μήνες · 2 την εβδομάδα",
    credits: 24,
    priceCents: 27000,
    validityDays: 90,
    badge: null as string | null,
    sortOrder: 7,
    group: "quarter" as PackGroup,
  },
  {
    slug: "quarter-3",
    nameEn: "3 months · 3 a week",
    nameEl: "3 μήνες · 3 την εβδομάδα",
    credits: 36,
    priceCents: 37500,
    validityDays: 90,
    badge: null as string | null,
    sortOrder: 8,
    group: "quarter" as PackGroup,
  },
  {
    slug: "quarter-4",
    nameEn: "3 months · 4 a week",
    nameEl: "3 μήνες · 4 την εβδομάδα",
    credits: 48,
    priceCents: 47000,
    validityDays: 90,
    /* Under ten euro a class — the only plan that gets there. */
    badge: "BEST_VALUE" as string | null,
    sortOrder: 9,
    group: "quarter" as PackGroup,
  },
];

export const OFFERED_PACK_SLUGS: ReadonlySet<string> = new Set(
  PACKS.map((p) => p.slug),
);

/**
 * Portrait for each instructor, keyed by the name the studio uses.
 *
 * A fallback, not an override: if a row in the database carries its own
 * photo_url that wins, so real photographs can be uploaded later without
 * touching this file. Until then the studio does not need to re-seed to see
 * faces on the team cards.
 */
export const INSTRUCTOR_PHOTOS: Record<string, string> = {
  "Maria K.": "/team/maria-k.jpg",
  "Andreas P.": "/team/andreas-p.jpg",
  "Elena S.": "/team/elena-s.jpg",
  "Chris M.": "/team/chris-m.jpg",
};

/** Which commitment a pack belongs to, by slug. */
const GROUP_BY_SLUG = new Map<string, PackGroup>(
  PACKS.map((p) => [p.slug, p.group]),
);

/**
 * The group for a slug.
 *
 * Read from this list rather than from a database column, because the grouping
 * is a fact about the price list and changes with it. A pack no longer on the
 * list has no group and is not shown anywhere that needs one.
 */
export function groupOf(slug: string): PackGroup {
  return GROUP_BY_SLUG.get(slug) ?? "month";
}
