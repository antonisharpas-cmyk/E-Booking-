/**
 * APEX pilates — database schema (Drizzle ORM / SQLite)
 *
 * SQLite keeps local development at zero setup. To move to Postgres later,
 * swap the `drizzle-orm/sqlite-core` imports for `pg-core` and change
 * src/db/index.ts — the shape of the data does not change.
 *
 * Credit model: credits live in dated *batches*. A purchase creates one batch
 * with an expiry date; a booking spends one credit from the batch that expires
 * soonest. That makes expiry exact and refunds traceable to the batch they came
 * from. Every movement is also written to creditLedger as an audit trail.
 */
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());

const now = () => integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date());

/* ------------------------------------------------------------------ People */

export const users = sqliteTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    phone: text("phone"),
    passwordHash: text("password_hash").notNull(),
    /** MEMBER | STAFF | ADMIN */
    role: text("role").notNull().default("MEMBER"),
    /* ---- consents -------------------------------------------------------
       Two deliberately separate things. serviceOptIn covers the messages a
       member cannot sensibly opt out of and still use the studio: a class
       moved, an instructor swapped, the room closed. It is required to hold an
       account, so it is recorded with the date it was given rather than as a
       flag that can drift. marketingOptIn covers offers and news, is never
       required, and can be withdrawn at any time. */
    serviceOptInAt: integer("service_opt_in_at", { mode: "timestamp" }),
    marketingOptIn: integer("marketing_opt_in", { mode: "boolean" })
      .notNull()
      .default(false),

    /* ---- how we are allowed to reach them ---- */
    notifyEmail: integer("notify_email", { mode: "boolean" })
      .notNull()
      .default(true),
    notifySms: integer("notify_sms", { mode: "boolean" })
      .notNull()
      .default(false),
    /* Not a preference: the studio keeps push on, and the member's browser or
       phone is the only thing that can silence it. Kept as a column so the
       delivery code reads consent the same way for all three channels. */
    notifyPush: integer("notify_push", { mode: "boolean" })
      .notNull()
      .default(true),

    /* Minutes before a class starts to send its reminder. Null means the
       member does not want one. See REMINDER_STEP_MINUTES in lib/profile.ts. */
    reminderMinutes: integer("reminder_minutes"),

    /* ---- optional profile ----
       Date of birth rather than an age: an age written down is wrong within a
       year, and the studio needs it for screening, not for a birthday card. */
    birthDate: text("birth_date"),
    heightCm: integer("height_cm"),
    weightGrams: integer("weight_grams"),

    /** Studio notes: injuries, goals, spring preferences */
    notes: text("notes"),
    createdAt: now().notNull(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

/**
 * Profile photographs, kept out of the users row and out of the filesystem.
 *
 * A separate table because a blob on `users` would be read on every session
 * lookup for no reason. In the database rather than on disk because this app
 * ships as one SQLite file: a backup or a move then carries the photos with
 * it, and there is no upload directory to get lost, go read-only on a
 * serverless host, or fall out of sync with the rows pointing at it.
 * Images are resized in the browser first and capped again on the server.
 */
export const userAvatars = sqliteTable("user_avatars", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  contentType: text("content_type").notNull(),
  bytes: integer("bytes").notNull(),
  data: text("data").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const instructors = sqliteTable("instructors", {
  id: id(),
  name: text("name").notNull(),
  bioEn: text("bio_en").notNull().default(""),
  bioEl: text("bio_el").notNull().default(""),
  photoUrl: text("photo_url"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

/* --------------------------------------------------------------- Catalogue */

export const classTypes = sqliteTable(
  "class_types",
  {
    id: id(),
    slug: text("slug").notNull(),
    nameEn: text("name_en").notNull(),
    nameEl: text("name_el").notNull(),
    descEn: text("desc_en").notNull(),
    descEl: text("desc_el").notNull(),
    /** ALL | BEGINNER | INTERMEDIATE | ADVANCED */
    level: text("level").notNull().default("ALL"),
    /** 1 = restorative, 2 = moderate, 3 = hard */
    intensity: integer("intensity").notNull().default(2),
    focusEn: text("focus_en").notNull().default(""),
    focusEl: text("focus_el").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("class_types_slug_idx").on(t.slug)],
);

export const creditPackages = sqliteTable(
  "credit_packages",
  {
    id: id(),
    slug: text("slug").notNull(),
    nameEn: text("name_en").notNull(),
    nameEl: text("name_el").notNull(),
    credits: integer("credits").notNull(),
    priceCents: integer("price_cents").notNull(),
    validityDays: integer("validity_days").notNull().default(90),
    /** POPULAR | BEST_VALUE | null */
    badge: text("badge"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("credit_packages_slug_idx").on(t.slug)],
);

/* ---------------------------------------------------------------- Schedule */

/** Weekly recurring blueprint. Bookable classes are generated from these. */
export const classTemplates = sqliteTable(
  "class_templates",
  {
    id: id(),
    classTypeId: text("class_type_id")
      .notNull()
      .references(() => classTypes.id),
    instructorId: text("instructor_id").references(() => instructors.id),
    /** 0 = Sunday … 6 = Saturday */
    dayOfWeek: integer("day_of_week").notNull(),
    /** Minutes from midnight — 06:00 = 360 */
    startMinutes: integer("start_minutes").notNull(),
    durationMin: integer("duration_min").notNull().default(50),
    capacity: integer("capacity").notNull().default(8),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [index("class_templates_day_idx").on(t.dayOfWeek)],
);

/** A single bookable class at a real date and time. */
export const classSessions = sqliteTable(
  "class_sessions",
  {
    id: id(),
    classTypeId: text("class_type_id")
      .notNull()
      .references(() => classTypes.id),
    instructorId: text("instructor_id").references(() => instructors.id),
    templateId: text("template_id").references(() => classTemplates.id),
    startsAt: integer("starts_at", { mode: "timestamp" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp" }).notNull(),
    capacity: integer("capacity").notNull().default(8),
    /** SCHEDULED | CANCELLED */
    status: text("status").notNull().default("SCHEDULED"),
    note: text("note"),
    createdAt: now().notNull(),
  },
  (t) => [
    uniqueIndex("class_sessions_template_start_idx").on(t.templateId, t.startsAt),
    index("class_sessions_starts_idx").on(t.startsAt),
  ],
);

export const bookings = sqliteTable(
  "bookings",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => classSessions.id, { onDelete: "cascade" }),
    /** CONFIRMED | CANCELLED | ATTENDED | NO_SHOW */
    status: text("status").notNull().default("CONFIRMED"),
    /** Batch the credit was taken from, so a refund goes back to the same one */
    creditBatchId: text("credit_batch_id"),
    creditRefunded: integer("credit_refunded", { mode: "boolean" })
      .notNull()
      .default(false),
    createdAt: now().notNull(),
    cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
  },
  (t) => [
    uniqueIndex("bookings_user_session_idx").on(t.userId, t.sessionId),
    index("bookings_session_status_idx").on(t.sessionId, t.status),
  ],
);

/* -------------------------------------------------------- Money & credits */

export const purchases = sqliteTable(
  "purchases",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    packageId: text("package_id").references(() => creditPackages.id),
    credits: integer("credits").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("eur"),
    /** PENDING | PAID | FAILED | REFUNDED */
    status: text("status").notNull().default("PENDING"),
    /** stripe | hosted | test | manual */
    provider: text("provider").notNull().default("stripe"),
    /** The provider's own reference for this payment, whoever the provider is. */
    providerRef: text("provider_ref"),
    stripeSession: text("stripe_session"),
    stripeIntent: text("stripe_intent"),
    createdAt: now().notNull(),
    paidAt: integer("paid_at", { mode: "timestamp" }),
  },
  (t) => [
    uniqueIndex("purchases_stripe_session_idx").on(t.stripeSession),
    index("purchases_user_idx").on(t.userId),
  ],
);

export const creditBatches = sqliteTable(
  "credit_batches",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purchaseId: text("purchase_id").references(() => purchases.id),
    creditsTotal: integer("credits_total").notNull(),
    creditsRemaining: integer("credits_remaining").notNull(),
    /** PURCHASE | GRANT | COMPENSATION */
    source: text("source").notNull().default("PURCHASE"),
    expiresAt: integer("expires_at", { mode: "timestamp" }),
    createdAt: now().notNull(),
  },
  (t) => [index("credit_batches_user_idx").on(t.userId, t.expiresAt)],
);

/** Human-readable audit trail of every credit movement. */
export const creditLedger = sqliteTable(
  "credit_ledger",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** +10 purchase, -1 booking, +1 refund */
    delta: integer("delta").notNull(),
    /** PURCHASE | BOOKING | CANCELLATION_REFUND | ADMIN_GRANT | EXPIRY */
    reason: text("reason").notNull(),
    note: text("note"),
    batchId: text("batch_id"),
    bookingId: text("booking_id"),
    purchaseId: text("purchase_id"),
    createdAt: now().notNull(),
  },
  (t) => [index("credit_ledger_user_idx").on(t.userId, t.createdAt)],
);

/* ------------------------------------------------------------------- Misc */

export const contactMessages = sqliteTable("contact_messages", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  message: text("message").notNull(),
  handled: integer("handled", { mode: "boolean" }).notNull().default(false),
  createdAt: now().notNull(),
});

/* --------------------------------------------------------------- Relations */

/**
 * One row per reminder owed to a member for a booked class.
 *
 * The queue is written when the class is booked and removed when it is
 * cancelled, so what is owed is always derivable from a single table rather
 * than recomputed by scanning bookings. `dueAt` is stamped at scheduling time
 * from the member's chosen lead time, which means changing that preference
 * later does not silently move reminders that were already promised.
 *
 * `sentAt` closes the row. Nothing here sends anything: delivery belongs to
 * whatever provider the studio picks, and /api/reminders/due hands it the
 * list. See lib/reminders.ts.
 */
export const bookingReminders = sqliteTable(
  "booking_reminders",
  {
    id: id(),
    bookingId: text("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    dueAt: integer("due_at", { mode: "timestamp" }).notNull(),
    /** email | sms | push, as chosen when the reminder was scheduled */
    channels: text("channels").notNull(),
    sentAt: integer("sent_at", { mode: "timestamp" }),
    createdAt: now().notNull(),
  },
  (t) => [
    index("booking_reminders_due_idx").on(t.dueAt),
    uniqueIndex("booking_reminders_booking_idx").on(t.bookingId),
  ],
);

export const usersRelations = relations(users, ({ many }) => ({
  bookings: many(bookings),
  creditBatches: many(creditBatches),
  purchases: many(purchases),
  ledger: many(creditLedger),
}));

export const classSessionsRelations = relations(classSessions, ({ one, many }) => ({
  classType: one(classTypes, {
    fields: [classSessions.classTypeId],
    references: [classTypes.id],
  }),
  instructor: one(instructors, {
    fields: [classSessions.instructorId],
    references: [instructors.id],
  }),
  bookings: many(bookings),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  user: one(users, { fields: [bookings.userId], references: [users.id] }),
  session: one(classSessions, {
    fields: [bookings.sessionId],
    references: [classSessions.id],
  }),
}));

export const classTemplatesRelations = relations(classTemplates, ({ one }) => ({
  classType: one(classTypes, {
    fields: [classTemplates.classTypeId],
    references: [classTypes.id],
  }),
  instructor: one(instructors, {
    fields: [classTemplates.instructorId],
    references: [instructors.id],
  }),
}));

export const purchasesRelations = relations(purchases, ({ one }) => ({
  user: one(users, { fields: [purchases.userId], references: [users.id] }),
  package: one(creditPackages, {
    fields: [purchases.packageId],
    references: [creditPackages.id],
  }),
}));

export const creditBatchesRelations = relations(creditBatches, ({ one }) => ({
  user: one(users, { fields: [creditBatches.userId], references: [users.id] }),
  purchase: one(purchases, {
    fields: [creditBatches.purchaseId],
    references: [purchases.id],
  }),
}));

/* -------------------------------------------------- The studio's own diary */

/**
 * A day the studio is shut: a public holiday, the summer break, a burst pipe.
 *
 * Stored as the studio's own calendar day (YYYY-MM-DD in Asia/Nicosia) rather
 * than a timestamp, because "closed on the 15th" is a statement about a day in
 * Larnaca, not about an instant. Closing a day cancels and refunds everything
 * booked on it, and the timetable stops offering it.
 */
export const studioClosures = sqliteTable(
  "studio_closures",
  {
    id: id(),
    /** YYYY-MM-DD in the studio's timezone. */
    day: text("day").notNull(),
    reasonEn: text("reason_en").notNull().default(""),
    reasonEl: text("reason_el").notNull().default(""),
    createdBy: text("created_by").references(() => users.id),
    createdAt: now().notNull(),
  },
  (t) => [uniqueIndex("studio_closures_day_idx").on(t.day)],
);

/* ------------------------------------------------------------ Studio notices */

/** A message from the studio to its members, written at the desk. */
export const notices = sqliteTable(
  "notices",
  {
    id: id(),
    titleEn: text("title_en").notNull(),
    bodyEn: text("body_en").notNull(),
    /** Optional Greek version. Falls back to the English one when empty. */
    titleEl: text("title_el").notNull().default(""),
    bodyEl: text("body_el").notNull().default(""),
    /**
     * Who it was for. ALL means every member — those are the studio and
     * timetable notices nobody can opt out of, because a class being cancelled
     * is not marketing. OFFERS means only members who ticked offers, news and
     * new class types.
     */
    audience: text("audience").notNull().default("ALL"),
    /** Which channels it went out on, e.g. "push,email". In-app is always. */
    channels: text("channels").notNull().default(""),
    /** Marks the ones that matter: shown with the studio's gold accent. */
    important: integer("important", { mode: "boolean" }).notNull().default(false),
    createdBy: text("created_by").references(() => users.id),
    createdAt: now().notNull(),
  },
  (t) => [index("notices_created_idx").on(t.createdAt)],
);

/**
 * Who has read what. A row exists only once somebody has read a notice, so
 * "unread" is the absence of a row — nothing has to be written when a notice is
 * sent, however many members there are.
 */
export const noticeReads = sqliteTable(
  "notice_reads",
  {
    noticeId: text("notice_id")
      .notNull()
      .references(() => notices.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: integer("read_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("notice_reads_idx").on(t.noticeId, t.userId)],
);

/**
 * One browser, one device, one permission grant.
 *
 * A member can have several — phone, laptop, the studio's tablet — and each is
 * revoked independently by whoever owns the device, not by us. Dead endpoints
 * are pruned when the push service reports them gone (404/410), which is the
 * only reliable signal we get: a browser never tells us it was uninstalled.
 */
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The push service URL. Unique: re-subscribing the same browser updates. */
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent").notNull().default(""),
    createdAt: now().notNull(),
    lastSentAt: integer("last_sent_at", { mode: "timestamp" }),
    /** Consecutive send failures. Used to retire a flaky endpoint. */
    failures: integer("failures").notNull().default(0),
  },
  (t) => [
    uniqueIndex("push_endpoint_idx").on(t.endpoint),
    index("push_user_idx").on(t.userId),
  ],
);

/**
 * What actually happened when a notice was sent, per channel.
 *
 * Counts rather than a row per recipient: the desk needs to know "did it go
 * out", and 400 rows per notice to answer that is a bad trade. The first few
 * error messages are kept in `detail`, which is what makes a failure
 * diagnosable without turning on logging in production.
 */
export const noticeDeliveries = sqliteTable(
  "notice_deliveries",
  {
    id: id(),
    noticeId: text("notice_id")
      .notNull()
      .references(() => notices.id, { onDelete: "cascade" }),
    /** push | email | sms */
    channel: text("channel").notNull(),
    sent: integer("sent").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    /** Recipients the channel did not apply to: no consent, no phone, no device. */
    skipped: integer("skipped").notNull().default(0),
    detail: text("detail").notNull().default(""),
    createdAt: now().notNull(),
  },
  (t) => [index("notice_deliveries_idx").on(t.noticeId)],
);

/* ------------------------------------------------------------------ Pricing */

/**
 * A discount the studio is running.
 *
 * `packageId` null means the whole list; set, it overrides the list rule for
 * that one pack. Only rows with `active` count, so an offer is switched off
 * rather than deleted and the history of what was run stays.
 */
export const pricingRules = sqliteTable(
  "pricing_rules",
  {
    id: id(),
    /** null = every pack */
    packageId: text("package_id").references(() => creditPackages.id, {
      onDelete: "cascade",
    }),
    /** PERCENT | FLAT */
    kind: text("kind").notNull(),
    /** Percent (1-90) or cents off, depending on kind. */
    value: integer("value").notNull(),
    labelEn: text("label_en").notNull().default(""),
    labelEl: text("label_el").notNull().default(""),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdBy: text("created_by").references(() => users.id),
    createdAt: now().notNull(),
  },
  (t) => [index("pricing_rules_active_idx").on(t.active)],
);

/* ------------------------------------------------------------------- Types */

export type User = typeof users.$inferSelect;
export type Instructor = typeof instructors.$inferSelect;
export type ClassType = typeof classTypes.$inferSelect;
export type CreditPackage = typeof creditPackages.$inferSelect;
export type ClassTemplate = typeof classTemplates.$inferSelect;
export type ClassSession = typeof classSessions.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Purchase = typeof purchases.$inferSelect;
export type CreditBatch = typeof creditBatches.$inferSelect;
export type CreditLedgerRow = typeof creditLedger.$inferSelect;
export type StudioClosure = typeof studioClosures.$inferSelect;
export type Notice = typeof notices.$inferSelect;
export type PricingRule = typeof pricingRules.$inferSelect;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NoticeDelivery = typeof noticeDeliveries.$inferSelect;
