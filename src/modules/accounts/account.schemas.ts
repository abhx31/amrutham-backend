import { z } from "zod";

const strongPassword = z.string().min(12).max(128)
  .regex(/[a-z]/, "Password must contain a lowercase letter")
  .regex(/[A-Z]/, "Password must contain an uppercase letter")
  .regex(/[0-9]/, "Password must contain a number");

export const requestPasswordResetSchema = z.object({
  email: z.string().email().transform((value) => value.trim().toLowerCase())
}).strict();

export const resetPasswordSchema = z.object({
  token: z.string().min(20).max(500),
  newPassword: strongPassword
}).strict();

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: strongPassword
}).strict().refine((value) => value.currentPassword !== value.newPassword, {
  message: "New password must be different",
  path: ["newPassword"]
});

export const requestEmailVerificationSchema = requestPasswordResetSchema;
export const verifyEmailSchema = z.object({ token: z.string().min(20).max(500) }).strict();
export const sessionIdParamsSchema = z.object({ sessionId: z.string().uuid() });
