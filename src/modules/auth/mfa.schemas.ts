import { z } from "zod";

export const verifyMfaSetupSchema = z.object({
  code: z.string().regex(/^\d{6}$/)
}).strict();

export const verifyMfaLoginSchema = z.object({
  challengeToken: z.string().min(20),
  code: z.string().regex(/^\d{6}$/).optional(),
  recoveryCode: z.string().trim().min(8).max(30).optional()
}).strict().refine((value) => Boolean(value.code) !== Boolean(value.recoveryCode), {
  message: "Provide either code or recoveryCode"
});

export const disableMfaSchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/)
}).strict();
