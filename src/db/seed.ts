/**
 * Seed script — `npm run db:seed`
 *
 * Creates the class catalogue, credit packs, instructors, the weekly timetable
 * templates (taken from the studio's published hours) and 6 weeks of bookable
 * sessions. Also creates one admin and one demo member so you can click through
 * the whole booking flow immediately.
 *
 * Safe to re-run: it upserts by slug/email and never duplicates sessions.
 *
 * NOTE: instructor names and bios are placeholders — replace them with the real
 * studio team before going live.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, sqlite } from "./index";
import {
  classTemplates,
  classTypes,
  creditPackages,
  instructors,
  users,
} from "./schema";

/* ------------------------------------------------------------------ helpers */

const hash = (p: string) => bcrypt.hashSync(p, 11);

function upsertUser(row: {
  email: string;
  name: string;
  password: string;
  role: string;
  phone?: string;
}) {
  const existing = db.select().from(users).where(eq(users.email, row.email)).get();
  if (existing) {
    db.update(users)
      .set({ name: row.name, role: row.role, phone: row.phone })
      .where(eq(users.id, existing.id))
      .run();
    return existing;
  }
  return db
    .insert(users)
    .values({
      email: row.email,
      name: row.name,
      phone: row.phone,
      role: row.role,
      passwordHash: hash(row.password),
    })
    .returning()
    .get();
}

/* ------------------------------------------------------------- class types */

const CLASS_TYPES = [
  {
    slug: "foundations",
    nameEn: "Reformer Foundations",
    nameEl: "Reformer Foundations",
    descEn:
      "Your entry point. A full 50-minute class at an introductory pace: spring settings, footbar, straps and the six core positions explained before you load them. Leave knowing exactly what your body is doing.",
    descEl:
      "Το σημείο εκκίνησης. Πλήρες μάθημα 50 λεπτών σε εισαγωγικό ρυθμό: ρυθμίσεις ελατηρίων, footbar, λουριά και οι έξι βασικές θέσεις, εξηγημένες πριν προστεθεί φορτίο. Φεύγεις γνωρίζοντας τι κάνει το σώμα σου.",
    level: "BEGINNER",
    intensity: 1,
    focusEn: "Technique · Alignment · Confidence",
    focusEl: "Τεχνική · Ευθυγράμμιση · Αυτοπεποίθηση",
    sortOrder: 1,
  },
  {
    slug: "flow",
    nameEn: "Reformer Flow",
    nameEl: "Reformer Flow",
    descEn:
      "The classic. Continuous, breath-led sequences that move through the whole body with controlled spring resistance. Suitable for anyone comfortable with the basics.",
    descEl:
      "Το κλασικό. Συνεχείς ακολουθίες με οδηγό την αναπνοή, που κινούν όλο το σώμα με ελεγχόμενη αντίσταση ελατηρίων. Κατάλληλο για όποιον έχει τα βασικά.",
    level: "ALL",
    intensity: 2,
    focusEn: "Core · Mobility · Control",
    focusEl: "Κορμός · Κινητικότητα · Έλεγχος",
    sortOrder: 2,
  },
  {
    slug: "sculpt",
    nameEn: "Reformer Sculpt",
    nameEl: "Reformer Sculpt",
    descEn:
      "Higher spring load, longer holds, more repetitions. Built around glutes, back and arms for muscular endurance and shape without impact.",
    descEl:
      "Μεγαλύτερο φορτίο, πιο μακριά holds, περισσότερες επαναλήψεις. Δουλεύει γλουτούς, πλάτη και χέρια για μυϊκή αντοχή χωρίς επιβάρυνση.",
    level: "INTERMEDIATE",
    intensity: 3,
    focusEn: "Strength · Endurance · Glutes",
    focusEl: "Δύναμη · Αντοχή · Γλουτοί",
    sortOrder: 3,
  },
  {
    slug: "jumpboard",
    nameEn: "Jumpboard Cardio",
    nameEl: "Jumpboard Cardio",
    descEn:
      "Cardio without the pounding. Horizontal jumping on the jumpboard raises your heart rate while your spine stays supported. Intervals, music, sweat.",
    descEl:
      "Cardio χωρίς κραδασμούς. Οριζόντια άλματα στο jumpboard ανεβάζουν τους σφυγμούς με τη σπονδυλική στήλη υποστηριγμένη. Intervals, μουσική, ιδρώτας.",
    level: "INTERMEDIATE",
    intensity: 3,
    focusEn: "Cardio · Power · Legs",
    focusEl: "Cardio · Ισχύς · Πόδια",
    sortOrder: 4,
  },
  {
    slug: "restore",
    nameEn: "Stretch & Restore",
    nameEl: "Stretch & Restore",
    descEn:
      "Low springs, long lines, deep breath. Assisted mobility for hips, thoracic spine and shoulders — the class your desk week is asking for.",
    descEl:
      "Χαμηλά ελατήρια, μακριές γραμμές, βαθιά αναπνοή. Υποβοηθούμενη κινητικότητα για ισχία, θωρακική μοίρα και ώμους — το μάθημα που ζητά η εβδομάδα στο γραφείο.",
    level: "ALL",
    intensity: 1,
    focusEn: "Mobility · Recovery · Breath",
    focusEl: "Κινητικότητα · Αποκατάσταση · Αναπνοή",
    sortOrder: 5,
  },
  {
    slug: "athletic",
    nameEn: "Athletic Reformer",
    nameEl: "Athletic Reformer",
    descEn:
      "For the gym floor crowd. Unilateral loading, rotation and deceleration work that makes your lifts and your sport safer. Advanced control required.",
    descEl:
      "Για όσους προπονούνται. Μονόπλευρη φόρτιση, στροφική κίνηση και έλεγχος επιβράδυνσης που κάνουν τις άρσεις και το άθλημά σου ασφαλέστερα. Απαιτεί προχωρημένο έλεγχο.",
    level: "ADVANCED",
    intensity: 3,
    focusEn: "Rotation · Unilateral · Performance",
    focusEl: "Στροφή · Μονόπλευρα · Απόδοση",
    sortOrder: 6,
  },
] as const;

/* ------------------------------------------------------------- credit packs */

const PACKAGES = [
  {
    slug: "single",
    nameEn: "Single class",
    nameEl: "Μονό μάθημα",
    credits: 1,
    priceCents: 2500,
    validityDays: 30,
    badge: null,
    sortOrder: 1,
  },
  {
    slug: "intro-3",
    nameEn: "Intro · 3 classes",
    nameEl: "Intro · 3 μαθήματα",
    credits: 3,
    priceCents: 5500,
    validityDays: 30,
    badge: null,
    sortOrder: 2,
  },
  {
    slug: "pack-5",
    nameEn: "5 classes",
    nameEl: "5 μαθήματα",
    credits: 5,
    priceCents: 11000,
    validityDays: 60,
    badge: null,
    sortOrder: 3,
  },
  {
    slug: "pack-10",
    nameEn: "10 classes",
    nameEl: "10 μαθήματα",
    credits: 10,
    priceCents: 20000,
    validityDays: 90,
    badge: "POPULAR",
    sortOrder: 4,
  },
  {
    slug: "pack-20",
    nameEn: "20 classes",
    nameEl: "20 μαθήματα",
    credits: 20,
    priceCents: 36000,
    validityDays: 180,
    badge: "BEST_VALUE",
    sortOrder: 5,
  },
] as const;

/* ------------------------------------------------------------- instructors */

const INSTRUCTORS = [
  {
    name: "Maria K.",
    bioEn:
      "Comprehensive Reformer certification, ten years teaching. Specialises in post-injury return to movement.",
    bioEl:
      "Ολοκληρωμένη πιστοποίηση Reformer, δέκα χρόνια διδασκαλίας. Ειδικεύεται στην επιστροφή στην κίνηση μετά από τραυματισμό.",
    sortOrder: 1,
  },
  {
    name: "Andreas P.",
    bioEn:
      "Strength coach turned Pilates instructor. Teaches the athletic classes and works with the gym's PT clients.",
    bioEl:
      "Από προπονητής δύναμης σε instructor Pilates. Διδάσκει τα athletic μαθήματα και συνεργάζεται με τους personal trainers του γυμναστηρίου.",
    sortOrder: 2,
  },
  {
    name: "Elena S.",
    bioEn:
      "Dance background, obsessive about alignment. Her Flow classes are the studio's most requested.",
    bioEl:
      "Με υπόβαθρο στον χορό και εμμονή στην ευθυγράμμιση. Τα μαθήματα Flow της είναι τα πιο ζητούμενα του στούντιο.",
    sortOrder: 3,
  },
  {
    name: "Chris M.",
    bioEn:
      "Early mornings and Jumpboard. Believes 06:00 is the best hour of the day.",
    bioEl:
      "Πρωινά και Jumpboard. Πιστεύει ότι οι 06:00 είναι η καλύτερη ώρα της ημέρας.",
    sortOrder: 4,
  },
] as const;

/* ---------------------------------------------------------------- timetable */

/**
 * Published studio hours:
 *   Mon–Fri  06:00–12:00 and 15:00–20:00
 *   Saturday 07:00–11:00
 * Classes are 50 minutes on the hour.
 */
const WEEKDAY_SLOTS = [6, 7, 8, 9, 10, 11, 15, 16, 17, 18, 19];
const SATURDAY_SLOTS = [7, 8, 9, 10];

/** Deterministic class-type rota so the week has a sensible mix. */
function typeForSlot(day: number, hour: number): (typeof CLASS_TYPES)[number]["slug"] {
  if (hour === 6) return day % 2 === 1 ? "flow" : "jumpboard";
  if (hour === 7) return "flow";
  if (hour === 8) return day === 6 ? "foundations" : "sculpt";
  if (hour === 9) return day === 6 ? "flow" : "foundations";
  if (hour === 10) return day === 6 ? "restore" : "flow";
  if (hour === 11) return "restore";
  if (hour === 15) return "foundations";
  if (hour === 16) return "flow";
  if (hour === 17) return "sculpt";
  if (hour === 18) return day % 2 === 1 ? "jumpboard" : "athletic";
  return "restore"; // 19:00
}

/* --------------------------------------------------------------------- run */

async function main() {
  console.log("→ seeding APEX pilates…");

  /* Class types */
  for (const ct of CLASS_TYPES) {
    const found = db
      .select()
      .from(classTypes)
      .where(eq(classTypes.slug, ct.slug))
      .get();
    if (found) {
      db.update(classTypes).set({ ...ct }).where(eq(classTypes.id, found.id)).run();
    } else {
      db.insert(classTypes).values({ ...ct }).run();
    }
  }
  console.log(`  ✓ ${CLASS_TYPES.length} class types`);

  /* Credit packages */
  for (const p of PACKAGES) {
    const found = db
      .select()
      .from(creditPackages)
      .where(eq(creditPackages.slug, p.slug))
      .get();
    if (found) {
      db.update(creditPackages)
        .set({ ...p })
        .where(eq(creditPackages.id, found.id))
        .run();
    } else {
      db.insert(creditPackages).values({ ...p }).run();
    }
  }
  console.log(`  ✓ ${PACKAGES.length} credit packs`);

  /* Instructors */
  const instructorRows = [];
  for (const i of INSTRUCTORS) {
    const found = db.select().from(instructors).all().find((x) => x.name === i.name);
    if (found) {
      db.update(instructors).set({ ...i }).where(eq(instructors.id, found.id)).run();
      instructorRows.push(found);
    } else {
      instructorRows.push(db.insert(instructors).values({ ...i }).returning().get());
    }
  }
  console.log(`  ✓ ${instructorRows.length} instructors`);

  /* Weekly templates — wiped and rebuilt so the rota always matches this file */
  const typeIds = new Map(
    db
      .select()
      .from(classTypes)
      .all()
      .map((c) => [c.slug, c.id] as const),
  );

  const hasSessions = sqlite
    .prepare("select count(*) as n from class_sessions")
    .get() as { n: number };

  if (hasSessions.n === 0) {
    sqlite.prepare("delete from class_templates").run();
    let n = 0;
    const plan: { day: number; hours: number[] }[] = [
      { day: 1, hours: WEEKDAY_SLOTS },
      { day: 2, hours: WEEKDAY_SLOTS },
      { day: 3, hours: WEEKDAY_SLOTS },
      { day: 4, hours: WEEKDAY_SLOTS },
      { day: 5, hours: WEEKDAY_SLOTS },
      { day: 6, hours: SATURDAY_SLOTS },
    ];
    for (const { day, hours } of plan) {
      for (const [idx, hour] of hours.entries()) {
        const slug = typeForSlot(day, hour);
        const classTypeId = typeIds.get(slug);
        if (!classTypeId) continue;
        db.insert(classTemplates)
          .values({
            classTypeId,
            instructorId:
              instructorRows[(day + idx) % instructorRows.length]?.id ?? null,
            dayOfWeek: day,
            startMinutes: hour * 60,
            durationMin: 50,
            capacity: 8,
            active: true,
          })
          .run();
        n++;
      }
    }
    console.log(`  ✓ ${n} weekly timetable slots`);
  } else {
    console.log("  · templates kept (sessions already exist)");
  }

  /* Users */
  const admin = upsertUser({
    email: "admin@apexpilates.cy",
    name: "Studio Admin",
    password: "apexadmin123",
    role: "ADMIN",
  });
  const member = upsertUser({
    email: "member@example.com",
    name: "Demo Member",
    password: "member123",
    role: "MEMBER",
    phone: "+357 99 000 000",
  });
  console.log("  ✓ users: admin@apexpilates.cy / apexadmin123");
  console.log("           member@example.com / member123");

  /* Give the demo member a pack so the booking flow is clickable with no Stripe */
  const { grantCredits, getAvailableCredits } = await import("@/lib/credits");
  const balance = await getAvailableCredits(member.id);
  if (balance === 0) {
    grantCredits({
      userId: member.id,
      credits: 10,
      validityDays: 90,
      source: "GRANT",
      reason: "ADMIN_GRANT",
      note: "Seed data — demo pack",
    });
    console.log("  ✓ demo member granted 10 credits");
  }

  /* Six weeks of bookable classes */
  const { generateSessions } = await import("@/lib/schedule");
  const gen = generateSessions(6);
  console.log(
    `  ✓ sessions generated: ${gen.created} new, ${gen.skipped} already existed/past`,
  );

  console.log(`\n✓ seed complete. Admin id ${admin.id}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
