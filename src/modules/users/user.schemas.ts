import { z } from "zod";
import { roles } from "../auth/auth.types.js";

export const userIdParamsSchema = z.object({ userId: z.string().uuid() });

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  phone: z.union([z.string().trim().min(8).max(20), z.null()]).optional()
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");

export const updateStatusSchema = z.object({
  status: z.enum(["ACTIVE", "SUSPENDED"]),
  reason: z.string().trim().min(3).max(500)
});

export const listUsersSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().max(500).optional(),
  role: z.enum(roles).optional(),
  status: z.enum(["PENDING", "ACTIVE", "SUSPENDED"]).optional(),
  search: z.string().trim().min(1).max(100).optional()
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type UpdateStatusInput = z.infer<typeof updateStatusSchema>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;
