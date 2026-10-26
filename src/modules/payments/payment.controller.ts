import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import { consultationIdParamsSchema } from "../consultations/consultation.schemas.js";
import { fakePaymentStatusSchema, paymentIdParamsSchema, paymentWebhookSchema } from "./payment.schemas.js";
import type { PaymentService } from "./payment.service.js";

export class PaymentController {
  constructor(private readonly service: PaymentService) {}

  create = async (request: Request, response: Response): Promise<void> => {
    const { consultationId } = consultationIdParamsSchema.parse(request.params);
    const key = request.header("Idempotency-Key");
    if (!key) throw new AppError("Idempotency-Key header is required", 400, "IDEMPOTENCY_KEY_REQUIRED");
    const result = await this.service.create(consultationId, requireAuth(request).userId, key, String(request.id));
    response.status(result.replayed ? 200 : 201)
      .setHeader("Idempotency-Replayed", String(result.replayed))
      .json({ payment: result.payment, checkout: result.checkout });
  };

  list = async (request: Request, response: Response): Promise<void> => {
    const { consultationId } = consultationIdParamsSchema.parse(request.params);
    response.status(200).json({ items: await this.service.list(consultationId, requireAuth(request)) });
  };

  get = async (request: Request, response: Response): Promise<void> => {
    const { paymentId } = paymentIdParamsSchema.parse(request.params);
    response.status(200).json({ payment: await this.service.get(paymentId, requireAuth(request)) });
  };

  webhook = async (request: Request, response: Response): Promise<void> => {
    const result = await this.service.processWebhook(
      paymentWebhookSchema.parse(request.body),
      request.rawBody ?? Buffer.from(JSON.stringify(request.body)),
      request.header("x-payment-signature")
    );
    response.status(200).json({ received: true, replayed: result.replayed });
  };

  simulate = async (request: Request, response: Response): Promise<void> => {
    const { paymentId } = paymentIdParamsSchema.parse(request.params);
    const { status } = fakePaymentStatusSchema.parse(request.body);
    const result = await this.service.simulate(paymentId, status);
    response.status(200).json({ payment: result.payment, replayed: result.replayed });
  };
}

function requireAuth(request: Request) {
  if (!request.auth) throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
  return request.auth;
}
