import { z } from "zod";

export const prescriptionIdParamsSchema = z.object({ prescriptionId: z.string().uuid() });

const medicationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  dosage: z.string().trim().min(1).max(100),
  frequency: z.string().trim().min(1).max(100),
  duration: z.string().trim().min(1).max(100),
  instructions: z.string().trim().max(500).optional()
}).strict();

export const createPrescriptionSchema = z.object({
  medications: z.array(medicationSchema).min(1).max(50),
  notes: z.string().trim().max(2_000).optional()
}).strict();

export const updatePrescriptionSchema = z.object({
  medications: z.array(medicationSchema).min(1).max(50).optional(),
  notes: z.union([z.string().trim().max(2_000), z.null()]).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type CreatePrescriptionInput = z.infer<typeof createPrescriptionSchema>;
export type UpdatePrescriptionInput = z.infer<typeof updatePrescriptionSchema>;
