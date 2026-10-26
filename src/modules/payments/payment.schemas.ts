import { z } from "zod";

export const paymentIdParamsSchema = z.object({ paymentId: z.string().uuid() });

export const paymentWebhookSchema = z.object({
  eventId: z.string().min(8).max(200),
  paymentId: z.string().uuid(),
  providerReference: z.string().min(3).max(200),
  status: z.enum(["SUCCEEDED", "FAILED", "REFUNDED"])
}).strict();

export type PaymentWebhookInput = z.infer<typeof paymentWebhookSchema>;

export const fakePaymentStatusSchema = z.object({
  status: z.enum(["SUCCEEDED", "FAILED", "REFUNDED"])
}).strict();
