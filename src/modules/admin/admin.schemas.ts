import { z } from "zod";

export const createAdminUserSchema = z.object({
  email: z.string().email().max(254).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(12).max(128)
    .regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
  role: z.enum(["PATIENT", "ADMIN"]),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  phone: z.string().trim().min(8).max(20).optional(),
  emailVerified: z.boolean().default(false)
}).strict();

export type CreateAdminUserInput = z.infer<typeof createAdminUserSchema>;
