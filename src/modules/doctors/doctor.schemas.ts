import { z } from "zod";

export const doctorIdParamsSchema = z.object({ doctorId: z.string().uuid() });
export const slotIdParamsSchema = z.object({ slotId: z.string().uuid() });

export const listDoctorsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
  specialty: z.string().trim().min(1).max(100).optional(),
  search: z.string().trim().min(1).max(100).optional()
});

export const createDoctorSchema = z.object({
  userId: z.string().uuid(),
  licenseNumber: z.string().trim().min(3).max(100),
  specialty: z.string().trim().min(2).max(100),
  consultationFeeMinor: z.number().int().min(0).max(10_000_000),
  bio: z.string().trim().max(2_000).optional()
}).strict();

export const updateDoctorSchema = z.object({
  specialty: z.string().trim().min(2).max(100).optional(),
  consultationFeeMinor: z.number().int().min(0).max(10_000_000).optional(),
  bio: z.union([z.string().trim().max(2_000), z.null()]).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const verifyDoctorSchema = z.object({
  verified: z.boolean(),
  reason: z.string().trim().min(3).max(500)
}).strict();

const slotTimesSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value)),
  endsAt: z.iso.datetime({ offset: true }).transform((value) => new Date(value))
}).refine((value) => value.endsAt > value.startsAt, {
  message: "endsAt must be after startsAt",
  path: ["endsAt"]
}).refine((value) => value.endsAt.getTime() - value.startsAt.getTime() <= 3 * 60 * 60 * 1_000, {
  message: "Availability slots cannot exceed three hours",
  path: ["endsAt"]
});

export const createAvailabilitySchema = slotTimesSchema.refine(
  (value) => value.startsAt.getTime() > Date.now(),
  { message: "Availability must start in the future", path: ["startsAt"] }
);

export const updateAvailabilitySchema = slotTimesSchema;

export const listAvailabilitySchema = z.object({
  from: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
  to: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
}).refine((value) => !value.from || !value.to || value.to > value.from, {
  message: "to must be after from",
  path: ["to"]
});

export const listOwnAvailabilitySchema = z.object({
  from: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
  to: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
  status: z.enum(["AVAILABLE", "BOOKED", "BLOCKED"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
}).refine((value) => !value.from || !value.to || value.to > value.from, {
  message: "to must be after from",
  path: ["to"]
});

export const listPendingDoctorsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).max(10_000).default(0)
});

export type ListDoctorsInput = z.infer<typeof listDoctorsSchema>;
export type CreateDoctorInput = z.infer<typeof createDoctorSchema>;
export type UpdateDoctorInput = z.infer<typeof updateDoctorSchema>;
export type VerifyDoctorInput = z.infer<typeof verifyDoctorSchema>;
export type AvailabilityInput = z.infer<typeof createAvailabilitySchema>;
export type ListAvailabilityInput = z.infer<typeof listAvailabilitySchema>;
export type ListOwnAvailabilityInput = z.infer<typeof listOwnAvailabilitySchema>;
export type ListPendingDoctorsInput = z.infer<typeof listPendingDoctorsSchema>;
