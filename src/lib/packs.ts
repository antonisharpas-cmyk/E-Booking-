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

export const PACKS = [
  {
    slug: "single",
    nameEn: "Single class",
    nameEl: "Μονό μάθημα",
    credits: 1,
    priceCents: 2500,
    validityDays: 30,
    badge: null as string | null,
    sortOrder: 1,
  },
  {
    slug: "pack-5",
    nameEn: "5 classes",
    nameEl: "5 μαθήματα",
    credits: 5,
    priceCents: 11000,
    validityDays: 60,
    badge: null as string | null,
    sortOrder: 2,
  },
  {
    slug: "pack-10",
    nameEn: "10 classes",
    nameEl: "10 μαθήματα",
    credits: 10,
    priceCents: 20000,
    validityDays: 90,
    badge: "POPULAR" as string | null,
    sortOrder: 3,
  },
  {
    slug: "pack-20",
    nameEn: "20 classes",
    nameEl: "20 μαθήματα",
    credits: 20,
    priceCents: 36000,
    validityDays: 180,
    badge: "BEST_VALUE" as string | null,
    sortOrder: 4,
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
