import { z } from "zod";

export const consultationIdParamsSchema = z.object({ consultationId: z.string().uuid() });

export const createConsultationSchema = z.object({
  slotId: z.string().uuid(),
  reason: z.string().trim().min(3).max(1_000).optional()
}).strict();

export const transitionConsultationSchema = z.object({
  status: z.enum(["CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]),
  version: z.number().int().positive()
}).strict();

export const cancelConsultationSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().min(3).max(500)
}).strict();

export const listConsultationsSchema = z.object({
  status: z.enum(["BOOKED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});

export type CreateConsultationInput = z.infer<typeof createConsultationSchema>;
export type TransitionConsultationInput = z.infer<typeof transitionConsultationSchema>;
export type CancelConsultationInput = z.infer<typeof cancelConsultationSchema>;
export type ListConsultationsInput = z.infer<typeof listConsultationsSchema>;
