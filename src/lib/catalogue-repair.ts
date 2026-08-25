import { sqlite } from "@/db";
import { OFFERED_PACK_SLUGS } from "./packs";

/**
 * Bring the catalogue in the database in line with what the studio actually
 * sells, on the first read after boot.
 *
 * The same problem the schedule had: withdrawing the 3-class pack changed the
 * seed script, and the seed script only runs when somebody runs it. Until then
 * a database seeded earlier keeps offering the pack, and it is genuinely
 * confusing to be told a change has landed while the page still shows the old
 * one.
 *
 * A withdrawn pack is deactivated, never deleted: purchases and credit batches
 * reference those rows, and a member's own history should not change because
 * the studio stopped selling something.
 *
 * Idempotent, one indexed UPDATE per process.
 */

let done = false;

export function repairCatalogueOnce() {
  if (done) return;
  done = true;
  repairCatalogue();
}

/** Exposed for tests; returns how many packs it withdrew. */
export function repairCatalogue() {
  const slugs = [...OFFERED_PACK_SLUGS];
  const info = sqlite
    .prepare(
      `update credit_packages
          set active = 0
        where active = 1
          and slug not in (${slugs.map(() => "?").join(", ")})`,
    )
    .run(...slugs);
  return info.changes;
}
