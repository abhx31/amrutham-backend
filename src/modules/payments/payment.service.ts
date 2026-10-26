import crypto from "node:crypto";
import { AppError } from "../../common/errors/app-error.js";
import type { AppConfig } from "../../config/env.js";
import type { AccessTokenIdentity } from "../auth/auth.types.js";
import type { ConsultationRepository } from "../consultations/consultation.repository.js";
import { PaymentRepository } from "./payment.repository.js";
import type { PaymentWebhookInput } from "./payment.schemas.js";
import type { PaymentView } from "./payment.types.js";
import type { PaymentGateway } from "./payment.gateway.js";

export class PaymentService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly consultationRepository: ConsultationRepository,
    private readonly config: AppConfig,
    private readonly gateway: PaymentGateway
  ) {}

  async create(
    consultationId: string,
    patientId: string,
    idempotencyKey: string,
    requestId?: string
  ) {
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new AppError("A valid Idempotency-Key header is required", 400, "INVALID_IDEMPOTENCY_KEY");
    }
    const consultation = await this.consultationRepository.findById(consultationId);
    if (!consultation) throw new AppError("Consultation not found", 404, "CONSULTATION_NOT_FOUND");
    if (consultation.patientId !== patientId) {
      throw new AppError("Only the patient can initiate payment", 403, "FORBIDDEN");
    }
    if (["CANCELLED", "NO_SHOW"].includes(consultation.status)) {
      throw new AppError("This consultation cannot be paid", 409, "CONSULTATION_NOT_PAYABLE");
    }
    const requestHash = crypto.createHash("sha256").update(consultationId).digest("hex");
    const result = await this.repository.create({ consultationId, patientId, idempotencyKey, requestHash, requestId });
    return { ...result, checkout: await this.gateway.createCheckout(result.payment) };
  }

  async list(consultationId: string, actor: AccessTokenIdentity): Promise<PaymentView[]> {
    await this.assertConsultationAccess(consultationId, actor);
    return this.repository.listForConsultation(consultationId);
  }

  async get(paymentId: string, actor: AccessTokenIdentity): Promise<PaymentView> {
    const payment = await this.repository.findById(paymentId);
    if (!payment) throw new AppError("Payment not found", 404, "PAYMENT_NOT_FOUND");
    await this.assertConsultationAccess(payment.consultationId, actor);
    return payment;
  }

  processWebhook(input: PaymentWebhookInput, rawBody: Buffer, signature: string | undefined) {
    if (!signature || !this.isValidSignature(rawBody, signature)) {
      throw new AppError("Invalid webhook signature", 401, "INVALID_WEBHOOK_SIGNATURE");
    }
    const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
    return this.repository.processWebhook(input, payloadHash);
  }

  async simulate(paymentId: string, status: "SUCCEEDED" | "FAILED" | "REFUNDED") {
    if (this.config.NODE_ENV === "production") {
      throw new AppError("Fake payment gateway is disabled", 404, "NOT_FOUND");
    }
    const payment = await this.repository.findById(paymentId);
    if (!payment || !payment.providerReference) {
      throw new AppError("Payment not found", 404, "PAYMENT_NOT_FOUND");
    }
    const event = {
      eventId: `fake_${crypto.randomUUID()}`,
      paymentId,
      providerReference: payment.providerReference,
      status
    };
    return this.repository.processWebhook(event, crypto.createHash("sha256").update(JSON.stringify(event)).digest("hex"));
  }

  private async assertConsultationAccess(consultationId: string, actor: AccessTokenIdentity): Promise<void> {
    const consultation = await this.consultationRepository.findById(consultationId);
    if (!consultation) throw new AppError("Consultation not found", 404, "CONSULTATION_NOT_FOUND");
    if (
      actor.role !== "ADMIN" &&
      consultation.patientId !== actor.userId &&
      consultation.doctorUserId !== actor.userId
    ) throw new AppError("You cannot access these payments", 403, "FORBIDDEN");
  }

  private isValidSignature(rawBody: Buffer, supplied: string): boolean {
    const expected = crypto.createHmac("sha256", this.config.PAYMENT_WEBHOOK_SECRET).update(rawBody).digest("hex");
    const normalized = supplied.startsWith("sha256=") ? supplied.slice(7) : supplied;
    if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(normalized, "hex"));
  }
}
