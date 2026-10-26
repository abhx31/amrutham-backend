import { z } from "zod";

export const auditLogIdParamsSchema = z.object({ auditLogId: z.string().uuid() });

export const listAuditLogsSchema = z.object({
  actorId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(100).optional(),
  entityType: z.string().trim().min(1).max(100).optional(),
  entityId: z.string().uuid().optional(),
  from: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
  to: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0)
}).refine((value) => !value.from || !value.to || value.to > value.from, {
  message: "to must be after from",
  path: ["to"]
});

export type ListAuditLogsInput = z.infer<typeof listAuditLogsSchema>;
