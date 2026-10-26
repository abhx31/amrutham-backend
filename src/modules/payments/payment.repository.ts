import crypto from "node:crypto";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { AppError } from "../../common/errors/app-error.js";
import type { Database } from "../../infrastructure/database/database.js";
import {
  auditLogs,
  consultations,
  doctors,
  idempotencyKeys,
  outboxEvents,
  payments,
  paymentWebhookEvents
} from "../../infrastructure/database/schema.js";
import type { PaymentWebhookInput } from "./payment.schemas.js";
import type { PaymentStatus, PaymentView } from "./payment.types.js";

const selection = {
  id: payments.id,
  consultationId: payments.consultationId,
  initiatedBy: payments.initiatedBy,
  providerReference: payments.providerReference,
  amountMinor: payments.amountMinor,
  currency: payments.currency,
  status: payments.status,
  completedAt: payments.completedAt,
  refundedAt: payments.refundedAt,
  createdAt: payments.createdAt,
  updatedAt: payments.updatedAt
};

export class PaymentRepository {
  constructor(private readonly database: Database) {}

  create(input: {
    consultationId: string;
    patientId: string;
    idempotencyKey: string;
    requestHash: string;
    requestId?: string | undefined;
  }): Promise<{ payment: PaymentView; replayed: boolean }> {
    return this.database.transaction(async (transaction) => {
      // Serialize every payment attempt for a consultation, not only retries
      // carrying the same idempotency key. Otherwise two different keys can
      // both observe that no active payment exists and insert concurrently.
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`payment:${input.consultationId}`}))`);
      const [existingKey] = await transaction.select({
        requestHash: idempotencyKeys.requestHash,
        responseBody: idempotencyKeys.responseBody
      }).from(idempotencyKeys).where(and(
        eq(idempotencyKeys.userId, input.patientId),
        eq(idempotencyKeys.key, `payment:${input.idempotencyKey}`)
      )).limit(1);
      if (existingKey) {
        if (existingKey.requestHash !== input.requestHash) {
          throw new AppError("Idempotency key was used for a different payment", 409, "IDEMPOTENCY_KEY_REUSED");
        }
        const paymentId = readPaymentId(existingKey.responseBody);
        const payment = await selectPayment(transaction, paymentId);
        if (!payment) throw new AppError("Stored payment response is unavailable", 409, "IDEMPOTENCY_RESPONSE_UNAVAILABLE");
        return { payment, replayed: true };
      }

      const [existingPayment] = await transaction.select(selection).from(payments).where(and(
        eq(payments.consultationId, input.consultationId),
        inArray(payments.status, ["PENDING", "SUCCEEDED"])
      )).limit(1);
      if (existingPayment) throw new AppError("This consultation already has an active payment", 409, "PAYMENT_ALREADY_EXISTS");

      const [pricing] = await transaction.select({ fee: doctors.consultationFeeMinor }).from(consultations)
        .innerJoin(doctors, eq(doctors.id, consultations.doctorId))
        .where(and(eq(consultations.id, input.consultationId), eq(consultations.patientId, input.patientId)))
        .limit(1);
      if (!pricing) throw new AppError("Consultation not found", 404, "CONSULTATION_NOT_FOUND");

      const providerReference = `pay_${crypto.randomUUID()}`;
      const [created] = await transaction.insert(payments).values({
        consultationId: input.consultationId,
        initiatedBy: input.patientId,
        providerReference,
        amountMinor: pricing.fee,
        currency: "INR"
      }).returning(selection);
      if (!created) throw new Error("Payment insert returned no record");

      await transaction.insert(idempotencyKeys).values({
        key: `payment:${input.idempotencyKey}`,
        userId: input.patientId,
        requestHash: input.requestHash,
        responseStatus: 201,
        responseBody: { paymentId: created.id },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000)
      });
      await transaction.insert(auditLogs).values({
        actorId: input.patientId,
        action: "PAYMENT_CREATED",
        entityType: "payment",
        entityId: created.id,
        requestId: input.requestId,
        metadata: { amountMinor: created.amountMinor, currency: created.currency }
      });
      return { payment: created, replayed: false };
    });
  }

  async listForConsultation(consultationId: string): Promise<PaymentView[]> {
    return this.database.select(selection).from(payments)
      .where(eq(payments.consultationId, consultationId)).orderBy(desc(payments.createdAt));
  }

  findById(paymentId: string): Promise<PaymentView | undefined> {
    return selectPayment(this.database, paymentId);
  }

  processWebhook(input: PaymentWebhookInput, payloadHash: string): Promise<{ payment: PaymentView; replayed: boolean }> {
    return this.database.transaction(async (transaction) => {
      // The event lock makes provider-event deduplication deterministic even
      // when a reused event ID references another payment. The payment lock
      // then serializes distinct provider events for the same payment.
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`payment-event:${input.eventId}`}))`);
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`payment:${input.paymentId}`}))`);
      const [existingEvent] = await transaction.select({
        payloadHash: paymentWebhookEvents.payloadHash
      }).from(paymentWebhookEvents).where(eq(paymentWebhookEvents.id, input.eventId)).limit(1);
      if (existingEvent) {
        if (existingEvent.payloadHash !== payloadHash) {
          throw new AppError("Webhook event ID was reused with a different payload", 409, "WEBHOOK_EVENT_REUSED");
        }
        const payment = await selectPayment(transaction, input.paymentId);
        if (!payment) throw new AppError("Payment not found", 404, "PAYMENT_NOT_FOUND");
        return { payment, replayed: true };
      }

      const current = await selectPayment(transaction, input.paymentId);
      if (!current) throw new AppError("Payment not found", 404, "PAYMENT_NOT_FOUND");
      if (current.providerReference !== input.providerReference) {
        throw new AppError("Provider reference does not match", 409, "PAYMENT_REFERENCE_MISMATCH");
      }
      assertPaymentTransition(current.status, input.status);
      const now = new Date();
      const [updated] = await transaction.update(payments).set({
        status: input.status,
        completedAt: input.status === "SUCCEEDED" ? now : current.completedAt,
        refundedAt: input.status === "REFUNDED" ? now : null,
        updatedAt: now
      }).where(eq(payments.id, input.paymentId)).returning(selection);
      if (!updated) throw new Error("Payment update returned no record");
      await transaction.insert(paymentWebhookEvents).values({
        id: input.eventId,
        payloadHash,
        paymentId: input.paymentId
      });
      await transaction.insert(auditLogs).values({
        action: "PAYMENT_STATUS_CHANGED",
        entityType: "payment",
        entityId: input.paymentId,
        metadata: { status: input.status, eventId: input.eventId }
      });
      await transaction.insert(outboxEvents).values({
        eventType: "payment.status_changed",
        aggregateType: "payment",
        aggregateId: input.paymentId,
        payload: { paymentId: input.paymentId, consultationId: updated.consultationId, status: input.status }
      });
      return { payment: updated, replayed: false };
    });
  }
}

async function selectPayment(
  database: Database | Parameters<Parameters<Database["transaction"]>[0]>[0],
  paymentId: string
): Promise<PaymentView | undefined> {
  const [record] = await database.select(selection).from(payments).where(eq(payments.id, paymentId)).limit(1);
  return record;
}

function readPaymentId(value: unknown): string {
  if (typeof value !== "object" || value === null || !("paymentId" in value) || typeof value.paymentId !== "string") {
    throw new AppError("Stored payment response is invalid", 409, "IDEMPOTENCY_RESPONSE_UNAVAILABLE");
  }
  return value.paymentId;
}

function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  const valid = (from === "PENDING" && (to === "SUCCEEDED" || to === "FAILED")) ||
    (from === "SUCCEEDED" && to === "REFUNDED");
  if (!valid) throw new AppError(`Cannot transition payment from ${from} to ${to}`, 409, "INVALID_PAYMENT_TRANSITION");
}
