import { z } from "zod";
import {
  HEIGHT_MAX_CM,
  HEIGHT_MIN_CM,
  WEIGHT_MAX_KG,
  WEIGHT_MIN_KG,
  isValidReminderMinutes,
} from "./profile";

export const PASSWORD_MIN = 8;

/* A phone number the studio can actually ring. Loose on formatting, strict on
   there being enough digits to be real. */
const phone = z
  .string({ required_error: "PHONE_REQUIRED", invalid_type_error: "PHONE_REQUIRED" })
  .trim()
  .min(8, "PHONE_REQUIRED")
  .max(32, "PHONE_INVALID")
  .refine((v) => (v.match(/\d/g) ?? []).length >= 8, "PHONE_INVALID");

export const registerSchema = z.object({
  name: z
    .string({ required_error: "NAME_REQUIRED", invalid_type_error: "NAME_REQUIRED" })
    .trim()
    .min(2, "NAME_REQUIRED")
    .max(80, "NAME_TOO_LONG"),
  email: z
    .string({ required_error: "EMAIL_INVALID", invalid_type_error: "EMAIL_INVALID" })
    .trim()
    .toLowerCase()
    .email("EMAIL_INVALID"),
  /* Required now: the studio needs to reach a member when a class moves, and
     a booking reminder by SMS is impossible without it. */
  phone,
  password: z
    .string({ required_error: "PASSWORD_SHORT", invalid_type_error: "PASSWORD_SHORT" })
    .min(PASSWORD_MIN, "PASSWORD_SHORT")
    .max(200, "PASSWORD_LONG"),
  /* Studio and timetable notices. Must be accepted to hold an account, so it
     is validated as literally true rather than merely present. */
  serviceOptIn: z.literal(true, {
    errorMap: () => ({ message: "SERVICE_CONSENT_REQUIRED" }),
  }),
  /* Offers and news. Never required. */
  marketingOptIn: z.boolean().optional(),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "CURRENT_PASSWORD_REQUIRED"),
    newPassword: z.string().min(PASSWORD_MIN, "PASSWORD_SHORT").max(200, "PASSWORD_LONG"),
  })
  .refine((v) => v.currentPassword !== v.newPassword, {
    message: "PASSWORD_UNCHANGED",
    path: ["newPassword"],
  });

/* Everything a member may change about themselves. Email and phone are absent
   on purpose: both are identity and contact of record, so they are changed by
   asking the studio, not by editing a field. */
export const profileSchema = z.object({
  name: z.string().trim().min(2, "NAME_REQUIRED").max(80, "NAME_TOO_LONG"),
  birthDate: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "BIRTHDATE_INVALID")
    .optional()
    .or(z.literal("")),
  heightCm: z.number().int().min(HEIGHT_MIN_CM, "HEIGHT_RANGE").max(HEIGHT_MAX_CM, "HEIGHT_RANGE").nullable().optional(),
  weightKg: z.number().min(WEIGHT_MIN_KG, "WEIGHT_RANGE").max(WEIGHT_MAX_KG, "WEIGHT_RANGE").nullable().optional(),
  marketingOptIn: z.boolean(),
  /* Members who registered before this consent existed have none on record.
     They are asked for it in the profile, so it can arrive here — but it can
     only ever be granted, never revoked, because withdrawing it means closing
     the account. */
  serviceOptIn: z.boolean().optional(),
  notifyEmail: z.boolean(),
  notifySms: z.boolean(),
  notifyPush: z.boolean(),
  /** null switches reminders off */
  reminderMinutes: z
    .number()
    .int()
    .refine((n) => isValidReminderMinutes(n), "REMINDER_INVALID")
    .nullable(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const bookSchema = z.object({
  sessionId: z.string().min(1),
});

/**
 * Either identifier will do. The checkout page knows the pack by the slug in
 * its own URL, so making it look the id up first was a round trip for nothing.
 */
export const checkoutSchema = z
  .object({
    packageId: z.string().min(1).optional(),
    packSlug: z.string().min(1).optional(),
  })
  .refine((v) => Boolean(v.packageId || v.packSlug), {
    message: "packageId or packSlug is required",
  });

/**
 * A message short enough to be a mistyped word is not an enquiry, so the studio
 * gets a floor rather than a mailbox of "hi". The number is exported because
 * the form both states it up front and counts towards it.
 */
export const CONTACT_NAME_MIN = 2;
export const CONTACT_MESSAGE_MIN = 20;
export const CONTACT_MESSAGE_MAX = 4000;

/* Machine codes rather than prose: the form is bilingual, so the wording lives
   in the dictionaries and the server only says which rule failed. */
/* The required_error matters as much as the min(): a field that is absent
   entirely never reaches .min(), so without it a missing name comes back as
   Zod's own "Required" and the form has no code to translate. */
const required = (code: string) => ({
  required_error: code,
  invalid_type_error: code,
});

export const contactSchema = z.object({
  name: z
    .string(required("NAME_REQUIRED"))
    .trim()
    .min(CONTACT_NAME_MIN, "NAME_REQUIRED")
    .max(80, "NAME_TOO_LONG"),
  email: z
    .string(required("EMAIL_INVALID"))
    .trim()
    .toLowerCase()
    .email("EMAIL_INVALID"),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  message: z
    .string(required("MESSAGE_TOO_SHORT"))
    .trim()
    .min(CONTACT_MESSAGE_MIN, "MESSAGE_TOO_SHORT")
    .max(CONTACT_MESSAGE_MAX, "MESSAGE_TOO_LONG"),
});

export const grantSchema = z.object({
  userId: z.string().min(1),
  credits: z.number().int().min(-100).max(100),
  validityDays: z.number().int().min(0).max(1000).optional(),
  note: z.string().max(200).optional(),
});

export const attendanceSchema = z.object({
  bookingId: z.string().min(1),
  status: z.enum(["ATTENDED", "NO_SHOW", "CONFIRMED"]),
});

export const generateSchema = z.object({
  weeks: z.number().int().min(1).max(26),
});
