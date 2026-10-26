import { z } from "zod";

export const analyticsRangeSchema = z.object({
  from: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
  to: z.iso.datetime({ offset: true }).transform((value) => new Date(value)).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25)
}).refine((value) => !value.from || !value.to || value.to > value.from, {
  message: "to must be after from",
  path: ["to"]
}).refine((value) => {
  if (!value.from || !value.to) return true;
  return value.to.getTime() - value.from.getTime() <= 366 * 86_400_000;
}, {
  message: "Analytics range cannot exceed 366 days",
  path: ["to"]
});

export type AnalyticsRangeQuery = z.infer<typeof analyticsRangeSchema>;
export type AnalyticsRange = { from: Date; to: Date; limit: number };
