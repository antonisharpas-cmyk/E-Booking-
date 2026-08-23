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
    marketingOptIn: integer("marketing_opt_in", { mode: "boolean" })
      .notNull()
      .default(false),
    /** Studio notes: injuries, goals, spring preferences */
    notes: text("notes"),
    createdAt: now().notNull(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

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
    /** stripe | manual */
    provider: text("provider").notNull().default("stripe"),
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
