import { z } from "zod";

const addressSchema = z.object({
  line1: z.string().trim().min(1).max(200),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(1).max(100),
  state: z.string().trim().min(1).max(100),
  postalCode: z.string().trim().min(3).max(20),
  country: z.string().trim().length(2).transform((value) => value.toUpperCase())
}).strict();

const emergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(150),
  relationship: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(8).max(20)
}).strict();

export const profileUserIdParamsSchema = z.object({ userId: z.string().uuid() });

export const updateProfileDetailsSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.union([z.string().trim().min(8).max(20), z.null()]).optional(),
  dateOfBirth: z.union([
    z.iso.date().refine((value) => new Date(`${value}T00:00:00.000Z`) <= new Date(), "Date of birth cannot be in the future"),
    z.null()
  ]).optional(),
  gender: z.union([z.string().trim().min(1).max(50), z.null()]).optional(),
  address: z.union([addressSchema, z.null()]).optional(),
  emergencyContact: z.union([emergencyContactSchema, z.null()]).optional()
}).strict().refine((value) => Object.keys(value).length > 0, "At least one field is required");

export type UpdateProfileDetailsInput = z.infer<typeof updateProfileDetailsSchema>;
