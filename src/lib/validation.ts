import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Please enter your name").max(80),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  password: z.string().min(8, "At least 8 characters").max(200),
  marketingOptIn: z.boolean().optional(),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

export const bookSchema = z.object({
  sessionId: z.string().min(1),
});

export const checkoutSchema = z.object({
  packageId: z.string().min(1),
});

export const contactSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().max(32).optional().or(z.literal("")),
  message: z.string().trim().min(5).max(4000),
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
