/**
 * Seed script — `npm run db:seed`
 *
 * Creates the class catalogue, credit packs, instructors, the weekly timetable
 * templates (taken from the studio's published hours) and 6 weeks of bookable
 * sessions. Also creates the two desk accounts and a demo member so you can click through
 * the whole booking flow immediately.
 *
 * Safe to re-run: it upserts by slug/email and never duplicates sessions.
 *
 * NOTE: instructor names and bios are placeholders — replace them with the real
 * studio team before going live.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { repairCatalogue } from "@/lib/catalogue-repair";
import { PACKS } from "@/lib/packs";
import { SATURDAY_CLASS_HOURS, WEEKDAY_CLASS_HOURS } from "@/lib/rota";
import { REMINDER_DEFAULT_MINUTES } from "@/lib/profile";
import { STUDIO } from "@/lib/studio";
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
  const existing = db
    .select()
    .from(users)
    .where(eq(users.email, row.email))
    .get();
  if (existing) {
    db.update(users)
      .set({
        name: row.name,
        role: row.role,
        phone: row.phone,
        /* Seeded accounts predate the consent and reminder columns, so give
           them the same starting point a new member gets. Only fills what is
           missing: a real member's own choices are never overwritten. */
        serviceOptInAt: existing.serviceOptInAt ?? new Date(),
        reminderMinutes: existing.reminderMinutes ?? REMINDER_DEFAULT_MINUTES,
        /* Seeded accounts are verified by definition: the person who created
           them was sitting at this machine typing the command, and there is no
           mailbox in that story to send a code to. Only filled if missing, so a
           member who verified for themselves keeps their own date. */
        emailVerifiedAt: existing.emailVerifiedAt ?? new Date(),
      })
      .where(eq(users.id, existing.id))
      .run();
    return db.select().from(users).where(eq(users.id, existing.id)).get()!;
  }
  return db
    .insert(users)
    .values({
      email: row.email,
      name: row.name,
      phone: row.phone,
      role: row.role,
      passwordHash: hash(row.password),
      serviceOptInAt: new Date(),
      notifyEmail: true,
      reminderMinutes: REMINDER_DEFAULT_MINUTES,
      emailVerifiedAt: new Date(),
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
      "Your entry point. A full 60-minute class at an introductory pace: spring settings, footbar, straps and the six core positions explained before you load them. Leave knowing exactly what your body is doing.",
    descEl:
      "Το σημείο εκκίνησης. Πλήρες μάθημα 60 λεπτών σε εισαγωγικό ρυθμό: ρυθμίσεις ελατηρίων, μπάρα ποδιών, λουριά και οι έξι βασικές θέσεις, εξηγημένες πριν προστεθεί φορτίο. Φεύγεις γνωρίζοντας τι κάνει το σώμα σου.",
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
      "Μεγαλύτερο φορτίο, πιο μεγάλες παύσεις, περισσότερες επαναλήψεις. Δουλεύει γλουτούς, πλάτη και χέρια για μυϊκή αντοχή χωρίς επιβάρυνση.",
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
      "Cardio χωρίς κραδασμούς. Οριζόντια άλματα στο jumpboard ανεβάζουν τους σφυγμούς με τη σπονδυλική στήλη υποστηριγμένη. Ιντερβάλ, μουσική, ιδρώτας.",
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
      "Low springs, long lines, deep breath. Assisted mobility for hips, thoracic spine and shoulders, the class your desk week is asking for.",
    descEl:
      "Χαμηλά ελατήρια, μακριές γραμμές, βαθιά αναπνοή. Υποβοηθούμενη κινητικότητα για ισχία, θωρακική μοίρα και ώμους, το μάθημα που ζητά η εβδομάδα στο γραφείο.",
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

const PACKAGES = PACKS;

const INSTRUCTORS = [
  {
    name: "Maria K.",
    bioEn:
      "Comprehensive Reformer certification, ten years teaching. Specialises in post-injury return to movement.",
    bioEl:
      "Ολοκληρωμένη πιστοποίηση Reformer, δέκα χρόνια διδασκαλίας. Ειδικεύεται στην επιστροφή στην κίνηση μετά από τραυματισμό.",
    photoUrl: "/team/maria-k.jpg",
    sortOrder: 1,
  },
  {
    name: "Andreas P.",
    bioEn:
      "Strength coach turned Pilates instructor. Teaches the athletic classes and works with the gym's PT clients.",
    bioEl:
      "Από προπονητής δύναμης σε εκπαιδευτή Pilates. Διδάσκει τα μαθήματα Athletic Reformer και συνεργάζεται με τους γυμναστές του γυμναστηρίου.",
    photoUrl: "/team/andreas-p.jpg",
    sortOrder: 2,
  },
  {
    name: "Elena S.",
    bioEn:
      "Dance background, obsessive about alignment. Her Flow classes are the studio's most requested.",
    bioEl:
      "Με υπόβαθρο στον χορό και εμμονή στην ευθυγράμμιση. Τα μαθήματα Flow της είναι τα πιο ζητούμενα του στούντιο.",
    photoUrl: "/team/elena-s.jpg",
    sortOrder: 3,
  },
  {
    name: "Chris M.",
    bioEn:
      "Early mornings and Jumpboard. Believes 06:00 is the best hour of the day.",
    bioEl:
      "Πρωινά και Jumpboard. Πιστεύει ότι οι 06:00 είναι η καλύτερη ώρα της ημέρας.",
    photoUrl: "/team/chris-m.jpg",
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
/* One source of truth for the two numbers the studio actually publishes. */
const CLASS_LENGTH_MIN = STUDIO.classLengthMinutes;
const CLASS_CAPACITY = STUDIO.capacity;

/* The rota itself lives in lib/rota.ts, so a live database can be repaired to
   match it without being re-seeded. See the note at the top of that file. */
const WEEKDAY_SLOTS = [...WEEKDAY_CLASS_HOURS];
const SATURDAY_SLOTS = [...SATURDAY_CLASS_HOURS];

/** Deterministic class-type rota so the week has a sensible mix. */
function typeForSlot(
  day: number,
  hour: number,
): (typeof CLASS_TYPES)[number]["slug"] {
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
      db.update(classTypes)
        .set({ ...ct })
        .where(eq(classTypes.id, found.id))
        .run();
    } else {
      db.insert(classTypes)
        .values({ ...ct })
        .run();
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
      db.insert(creditPackages)
        .values({ ...p })
        .run();
    }
  }
  /* Packs the studio no longer sells are deactivated rather than deleted:
     past purchases and credit batches still point at those rows. Shared with
     the read path so both agree on what is on sale. */
  const sync = repairCatalogue();
  console.log(
    `  ✓ ${PACKAGES.length} credit packs` +
      (sync.withdrawn ? `, ${sync.withdrawn} withdrawn from sale` : ""),
  );

  /* Instructors */
  const instructorRows = [];
  for (const i of INSTRUCTORS) {
    const found = db
      .select()
      .from(instructors)
      .all()
      .find((x) => x.name === i.name);
    if (found) {
      db.update(instructors)
        .set({ ...i })
        .where(eq(instructors.id, found.id))
        .run();
      instructorRows.push(found);
    } else {
      instructorRows.push(
        db
          .insert(instructors)
          .values({ ...i })
          .returning()
          .get(),
      );
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

  /* The rota in this file is the studio's published timetable, so it is always
     reconciled. Previously it was only written into an empty database, which
     meant a change here (60 minutes instead of 50, five reformers instead of
     eight) never reached an installation that had already been seeded.
     Rows are matched on day + start time and updated in place rather than
     deleted and recreated: generated classes carry a template_id, so wiping the
     table trips the foreign key. Slots no longer in the rota are deactivated,
     which also keeps their history intact. */
  const existingTemplates = db.select().from(classTemplates).all();
  const keptTemplateIds = new Set<string>();
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
      const values = {
        classTypeId,
        instructorId:
          instructorRows[(day + idx) % instructorRows.length]?.id ?? null,
        dayOfWeek: day,
        startMinutes: hour * 60,
        durationMin: CLASS_LENGTH_MIN,
        capacity: CLASS_CAPACITY,
        active: true,
      };
      const match = existingTemplates.find(
        (x) => x.dayOfWeek === day && x.startMinutes === hour * 60,
      );
      if (match) {
        db.update(classTemplates)
          .set(values)
          .where(eq(classTemplates.id, match.id))
          .run();
        keptTemplateIds.add(match.id);
      } else {
        keptTemplateIds.add(
          db.insert(classTemplates).values(values).returning().get().id,
        );
      }
      n++;
    }
  }
  for (const tpl of existingTemplates) {
    if (keptTemplateIds.has(tpl.id)) continue;
    db.update(classTemplates)
      .set({ active: false })
      .where(eq(classTemplates.id, tpl.id))
      .run();
  }
  console.log(`  ✓ ${n} weekly timetable slots`);

  /* Bring already-generated future classes back in line with the rota above.
     generateSessions() only ever adds missing slots, so without this a class
     created under the old 50-minute, 8-place rota would keep those numbers for
     as long as it sat in the database. Classes nobody has booked are dropped
     and regenerated; classes with bookings are corrected in place, and their
     capacity is never lowered below the number of people already in them. */
  const now = Math.floor(Date.now() / 1000);
  const stale = sqlite
    .prepare(
      `select s.id,
              (select count(*) from bookings b
                where b.session_id = s.id and b.status = 'CONFIRMED') as booked
         from class_sessions s
        where s.starts_at > ?
          and (s.capacity != ? or (s.ends_at - s.starts_at) != ?)`,
    )
    .all(now, CLASS_CAPACITY, CLASS_LENGTH_MIN * 60) as {
    id: string;
    booked: number;
  }[];

  let dropped = 0;
  let repaired = 0;
  for (const row of stale) {
    if (row.booked === 0) {
      sqlite.prepare("delete from class_sessions where id = ?").run(row.id);
      dropped++;
    } else {
      sqlite
        .prepare(
          `update class_sessions
              set ends_at = starts_at + ?,
                  capacity = max(?, ?)
            where id = ?`,
        )
        .run(CLASS_LENGTH_MIN * 60, CLASS_CAPACITY, row.booked, row.id);
      repaired++;
    }
  }
  if (dropped || repaired) {
    console.log(
      `  ✓ realigned future classes to ${CLASS_LENGTH_MIN} min / ${CLASS_CAPACITY} places` +
        ` (${dropped} regenerated, ${repaired} corrected in place)`,
    );
  }

  /* Users
     ----
     Two accounts open the console, and they are not the same account. Reception
     runs the desk: sessions in and out, bookings, closures, notices, prices.
     The owner has all of that plus the numbers — what the studio has taken and
     how many members it has — because the reception computer sits in a public
     room and those figures should not be on it.

     The passwords here are development defaults, and the seed says so out loud.
     Real ones are set on the studio's own machine with `npm run staff`, so they
     never travel through a chat window or a git history. */
  const owner = upsertUser({
    email: process.env.SEED_OWNER_EMAIL ?? "owner@apexpilates.cy",
    name: "Studio Owner",
    password: process.env.SEED_OWNER_PASSWORD ?? "ownerdev123",
    role: "ADMIN",
  });
  upsertUser({
    email: process.env.SEED_RECEPTION_EMAIL ?? "reception@apexpilates.cy",
    name: "Reception",
    password: process.env.SEED_RECEPTION_PASSWORD ?? "receptiondev123",
    role: "STAFF",
  });
  /**
   * The demo member exists so the booking flow is clickable with no Stripe and
   * no real person to sign up. It has a password written in this file and ten
   * free sessions, which is precisely what must not exist on a live website: it
   * is an account anybody who has read this repository can sign into.
   *
   * So it is created for a development database and skipped for a production
   * one. `SEED_DEMO_MEMBER=true` forces it back for a staging site that wants a
   * clickable demo, and `=false` refuses it anywhere.
   */
  const wantDemo =
    process.env.SEED_DEMO_MEMBER === "true" ||
    (process.env.SEED_DEMO_MEMBER !== "false" &&
      process.env.NODE_ENV !== "production");

  const member = wantDemo
    ? upsertUser({
        email: "member@example.com",
        name: "Demo Member",
        password: "member123",
        role: "MEMBER",
        phone: "+357 99 000 000",
      })
    : null;

  /* The old single admin account, with its password written in this file and in
     the README, is retired. Anything it did stays in the ledger under its name;
     it simply can no longer open the console. */
  const legacy = db
    .select()
    .from(users)
    .where(eq(users.email, "admin@apexpilates.cy"))
    .get();
  if (legacy && legacy.role !== "MEMBER") {
    db.update(users)
      .set({ role: "MEMBER" })
      .where(eq(users.id, legacy.id))
      .run();
    console.log("  ✓ retired admin@apexpilates.cy — it can no longer open /admin");
  }

  /* Never print a password that came from the environment: on a hosted service
     this output is a build log somebody else can read. Only the development
     defaults, which are written in this file anyway, are named out loud. */
  const ownerPass = process.env.SEED_OWNER_PASSWORD
    ? "(from SEED_OWNER_PASSWORD)"
    : "ownerdev123";
  const receptionPass = process.env.SEED_RECEPTION_PASSWORD
    ? "(from SEED_RECEPTION_PASSWORD)"
    : "receptiondev123";
  const seeded = process.env.SEED_OWNER_PASSWORD && process.env.SEED_RECEPTION_PASSWORD;

  console.log(
    seeded
      ? "  ✓ desk accounts (passwords taken from the environment):"
      : "  ✓ desk accounts (development passwords, change before going live):",
  );
  console.log(`           ${owner.email} / ${ownerPass}        owner, everything`);
  console.log(
    `           ${process.env.SEED_RECEPTION_EMAIL ?? "reception@apexpilates.cy"} / ${receptionPass}   the desk, no analytics`,
  );
  if (member) console.log("           member@example.com / member123   demo member");
  else console.log("           no demo member on this database, which is right for a live one");
  console.log("    → npm run staff   to set the real ones on this machine");

  /* Give the demo member a pack so the booking flow is clickable with no Stripe.
     No demo member, no free sessions: see above. */
  const { grantCredits, getAvailableCredits } = await import("@/lib/credits");
  const balance = member ? await getAvailableCredits(member.id) : -1;
  if (member && balance === 0) {
    grantCredits({
      userId: member.id,
      credits: 10,
      validityDays: 90,
      source: "GRANT",
      reason: "ADMIN_GRANT",
      note: "Seed data, demo pack",
    });
    console.log("  ✓ demo member granted 10 credits");
  }

  /* Six weeks of bookable classes */
  const { generateSessions } = await import("@/lib/schedule");
  const gen = generateSessions(6);
  console.log(
    `  ✓ sessions generated: ${gen.created} new, ${gen.skipped} already existed/past`,
  );

  console.log(`\n✓ seed complete. Owner id ${owner.id}\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
