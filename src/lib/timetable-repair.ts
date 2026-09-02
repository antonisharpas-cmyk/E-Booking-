import { sqlite } from "@/db";
import {
  PERSONAL_DURATION_MINUTES,
  PERSONAL_SLOT_DAYS,
  PERSONAL_SLOT_HOURS,
} from "./personal";
import { classHoursOn } from "./rota";
import { generateSessions } from "./schedule";
import { STUDIO } from "./studio";
import { studioStartOfDay } from "./time";

/**
 * The timetable's own shape, repaired on the first read after boot.
 *
 * Two structural facts about the studio changed at once, and both of them live
 * in rows rather than in code, so neither could be fixed by editing a constant.
 *
 * **One class, one name.** The rota was seeded with six class types —
 * Foundations, Flow, Sculpt, Jumpboard, Restore, Athletic — and the studio does
 * not teach six different things. It teaches Reformer Flow, and a member reading
 * six names was being asked to choose between distinctions the room does not
 * make. The templates are moved onto Flow, the classes still to come are moved
 * with them, and the other five are withdrawn.
 *
 * Days already past are left alone. A member's history saying they attended
 * Reformer Sculpt in July is true, and rewriting it would be the site editing
 * somebody's own record to match a decision taken afterwards.
 *
 * **The midday appointments.** Personal and duet sessions need a class type of
 * their own and fifteen weekly slots, and neither can be a constant either: the
 * generator reads templates out of the database. So they are written in here,
 * matched on the day and the hour, and adding them is a no-op on the second run.
 *
 * Idempotent, cheap, and reported so a boot that changed something says so.
 */

let done = false;

export function repairTimetableOnce() {
  if (done) return;
  done = true;
  try {
    repairTimetable();
  } catch (err) {
    /* A repair that fails must not take the timetable down with it. The old
       names are wrong; a 500 is worse. */
    console.error("[timetable] repair failed", err);
  }
}

export type TimetableSync = {
  /** Templates moved onto the single class name. */
  templatesMoved: number;
  /** Classes still to come, moved with them. */
  sessionsMoved: number;
  /** Class types withdrawn because the studio no longer names them. */
  withdrawn: number;
  /** Weekly appointment slots written in. */
  personalTemplates: number;
  /** Group class slots the rota calls for that the database was missing. */
  classTemplates: number;
};

/** The one name every group class on the timetable carries. */
const FLOW = {
  slug: "flow",
  nameEn: "Reformer Flow",
  nameEl: "Reformer Flow",
  descEn:
    "Fifty minutes on the reformer, five people, one instructor watching all five. The work is built to your day rather than to a level printed on a timetable.",
  descEl:
    "Πενήντα λεπτά στο reformer, πέντε άτομα, ένας εκπαιδευτής που βλέπει και τα πέντε. Η άσκηση προσαρμόζεται στη μέρα σου και όχι σε ένα επίπεδο τυπωμένο σε ένα πρόγραμμα.",
  focusEn: "Strength, control, alignment",
  focusEl: "Δύναμη, έλεγχος, ευθυγράμμιση",
} as const;

/** The appointment slot, which is a class type because the generator needs one. */
const PERSONAL = {
  slug: "personal-session",
  nameEn: "Personal or Duet",
  nameEl: "Ατομική ή Duet",
  descEn:
    "The room to yourself, or to the two of you. Fifty minutes on whatever you want to work on, booked by the end of the day before so an instructor can be there for it.",
  descEl:
    "Ο χώρος δικός σου, ή των δυο σας. Πενήντα λεπτά πάνω σε ό,τι θέλεις να δουλέψεις, με κράτηση μέχρι το τέλος της προηγούμενης μέρας ώστε να είναι εκεί εκπαιδευτής για εσένα.",
  focusEn: "One to one attention",
  focusEl: "Προσοχή ένας προς έναν",
} as const;

export function repairTimetable(now = new Date()): TimetableSync {
  const out: TimetableSync = {
    templatesMoved: 0,
    sessionsMoved: 0,
    withdrawn: 0,
    personalTemplates: 0,
    classTemplates: 0,
  };

  /* Nothing to repair before the schema exists. */
  const hasTypes = sqlite
    .prepare("select name from sqlite_master where type='table' and name='class_types'")
    .get();
  if (!hasTypes) return out;

  sqlite.transaction(() => {
    /* ------------------------------------------------ the single class name */
    let flow = sqlite
      .prepare("select id from class_types where slug = ?")
      .get(FLOW.slug) as { id: string } | undefined;

    if (!flow) {
      const id = crypto.randomUUID();
      sqlite
        .prepare(
          `insert into class_types
             (id, slug, name_en, name_el, desc_en, desc_el, level, intensity,
              focus_en, focus_el, kind, active, sort_order)
           values (?, ?, ?, ?, ?, ?, 'ALL', 2, ?, ?, 'GROUP', 1, 1)`,
        )
        .run(
          id,
          FLOW.slug,
          FLOW.nameEn,
          FLOW.nameEl,
          FLOW.descEn,
          FLOW.descEl,
          FLOW.focusEn,
          FLOW.focusEl,
        );
      flow = { id };
    } else {
      sqlite
        .prepare(
          `update class_types
              set name_en = ?, name_el = ?, desc_en = ?, desc_el = ?,
                  focus_en = ?, focus_el = ?, level = 'ALL', kind = 'GROUP',
                  active = 1, sort_order = 1
            where id = ?`,
        )
        .run(
          FLOW.nameEn,
          FLOW.nameEl,
          FLOW.descEn,
          FLOW.descEl,
          FLOW.focusEn,
          FLOW.focusEl,
          flow.id,
        );
    }

    out.templatesMoved = sqlite
      .prepare(
        `update class_templates set class_type_id = ?
          where class_type_id != ?
            and class_type_id in (select id from class_types where kind = 'GROUP')`,
      )
      .run(flow.id, flow.id).changes;

    /* From the start of today, because that is the window the timetable shows.
       Yesterday is history and history is left as it happened. */
    const cutoff = Math.floor(studioStartOfDay(now).getTime() / 1000);
    out.sessionsMoved = sqlite
      .prepare(
        `update class_sessions set class_type_id = ?
          where starts_at >= ?
            and class_type_id != ?
            and class_type_id in (select id from class_types where kind = 'GROUP')`,
      )
      .run(flow.id, cutoff, flow.id).changes;

    out.withdrawn = sqlite
      .prepare(
        `update class_types set active = 0
          where kind = 'GROUP' and slug != ? and active = 1`,
      )
      .run(FLOW.slug).changes;

    /* ----------------------------------------------- the midday appointments */
    let personal = sqlite
      .prepare("select id from class_types where slug = ?")
      .get(PERSONAL.slug) as { id: string } | undefined;

    if (!personal) {
      const id = crypto.randomUUID();
      sqlite
        .prepare(
          `insert into class_types
             (id, slug, name_en, name_el, desc_en, desc_el, level, intensity,
              focus_en, focus_el, kind, active, sort_order)
           values (?, ?, ?, ?, ?, ?, 'ALL', 2, ?, ?, 'PERSONAL', 1, 2)`,
        )
        .run(
          id,
          PERSONAL.slug,
          PERSONAL.nameEn,
          PERSONAL.nameEl,
          PERSONAL.descEn,
          PERSONAL.descEl,
          PERSONAL.focusEn,
          PERSONAL.focusEl,
        );
      personal = { id };
    } else {
      sqlite
        .prepare(
          `update class_types
              set name_en = ?, name_el = ?, desc_en = ?, desc_el = ?,
                  focus_en = ?, focus_el = ?, kind = 'PERSONAL', active = 1,
                  sort_order = 2
            where id = ?`,
        )
        .run(
          PERSONAL.nameEn,
          PERSONAL.nameEl,
          PERSONAL.descEn,
          PERSONAL.descEl,
          PERSONAL.focusEn,
          PERSONAL.focusEl,
          personal.id,
        );
    }

    const exists = sqlite.prepare(
      `select id from class_templates
        where class_type_id = ? and day_of_week = ? and start_minutes = ?`,
    );
    const insert = sqlite.prepare(
      `insert into class_templates
         (id, class_type_id, instructor_id, day_of_week, start_minutes,
          duration_min, capacity, active)
       values (?, ?, null, ?, ?, ?, 1, 1)`,
    );
    const fix = sqlite.prepare(
      `update class_templates
          set duration_min = ?, capacity = 1, active = 1
        where id = ?`,
    );

    for (const day of PERSONAL_SLOT_DAYS) {
      for (const hour of PERSONAL_SLOT_HOURS) {
        const minutes = hour * 60;
        const row = exists.get(personal.id, day, minutes) as
          | { id: string }
          | undefined;
        if (row) {
          fix.run(PERSONAL_DURATION_MINUTES, row.id);
          continue;
        }
        insert.run(
          crypto.randomUUID(),
          personal.id,
          day,
          minutes,
          PERSONAL_DURATION_MINUTES,
        );
        out.personalTemplates++;
      }
    }

    /* No instructor is named on an appointment template, and none should be:
       who teaches it is decided when the studio rings round after the booking
       lands. A name printed on the slot before anybody has agreed to work it is
       a promise the site is not in a position to make. */

    /**
     * Every hour the rota calls for, as a group template.
     *
     * The rota used to exist only inside the seed, so changing it reached a live
     * database by re-seeding — which nobody will do to a database holding real
     * bookings. When Saturday's close moved from 11:00 to 12:00, the new 11:00
     * class existed in the code and nowhere a member could book it.
     *
     * Missing slots are added; nothing is removed. A template the rota does not
     * mention is left alone on purpose, because the desk can add a one-off class
     * and having it quietly deleted on the next boot would be far worse than an
     * extra row.
     */
    const flowType = sqlite
      .prepare("select id from class_types where slug = ? limit 1")
      .get(FLOW.slug) as { id: string } | undefined;

    if (flowType) {
      const findSlot = sqlite.prepare(
        `select id from class_templates
          where day_of_week = ? and start_minutes = ?
            and class_type_id in (select id from class_types where kind = 'GROUP')
          limit 1`,
      );
      const addSlot = sqlite.prepare(
        `insert into class_templates
           (id, class_type_id, instructor_id, day_of_week, start_minutes,
            duration_min, capacity, active)
         values (?, ?, null, ?, ?, ?, ?, 1)`,
      );

      for (let day = 0; day <= 6; day++) {
        for (const hour of classHoursOn(day)) {
          if (findSlot.get(day, hour * 60)) continue;
          addSlot.run(
            crypto.randomUUID(),
            flowType.id,
            day,
            hour * 60,
            STUDIO.classLengthMinutes,
            STUDIO.capacity,
          );
          out.classTemplates++;
        }
      }
    }
  })();

  /**
   * And then roll them forward, because a template is not a bookable hour.
   *
   * The generator turns templates into real dated classes, and it is normally
   * run from the desk. Leaving it at that here would have shipped fifteen
   * weekly slots that appear nowhere until somebody thinks to press a button
   * they have no reason to connect with a feature they have just been told is
   * live. The studio would have concluded, correctly, that it did not work.
   *
   * Only when something was actually written, so this costs one transaction once
   * and nothing on every boot after. `generateSessions` is idempotent, so even
   * the pathological case of it running twice creates nothing twice.
   */
  if (out.personalTemplates > 0 || out.classTemplates > 0) {
    try {
      generateSessions(GENERATE_WEEKS, now);
    } catch (err) {
      console.error("[timetable] could not roll the new slots forward", err);
    }
  }

  return out;
}

/** How far ahead to roll the new appointment slots. Six weeks, as the desk does. */
const GENERATE_WEEKS = 6;
