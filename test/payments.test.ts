import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config/env.js";
import type { ConsultationRepository } from "../src/modules/consultations/consultation.repository.js";
import type { PaymentRepository } from "../src/modules/payments/payment.repository.js";
import { PaymentService } from "../src/modules/payments/payment.service.js";
import { FakePaymentGateway } from "../src/modules/payments/fake-payment.gateway.js";

const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 3000,
  TRUST_PROXY_HOPS: 0,
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  REDIS_URL: "redis://localhost:6379",
  APP_PUBLIC_URL: "http://localhost:3000",
  EMAIL_FROM: "no-reply@amrutam.local",
  EMAIL_TRANSPORT: "fake",
  LOG_LEVEL: "silent",
  JWT_ACCESS_SECRET: "test-secret-with-at-least-32-characters-long",
  JWT_ISSUER: "amrutam-api",
  JWT_AUDIENCE: "amrutam-clients",
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 30,
  PAYMENT_WEBHOOK_SECRET: "test-payment-webhook-secret-32-characters",
  MFA_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  METRICS_BEARER_TOKEN: "test-metrics-bearer-token-32-characters",
  PAYMENT_GATEWAY_MODE: "fake",
  OUTBOX_POLL_INTERVAL_MS: 1000,
  OUTBOX_BATCH_SIZE: 100,
  OUTBOX_MAX_ATTEMPTS: 5
};

const webhook = {
  eventId: "event_12345678",
  paymentId: "ecf36fb7-a91e-4bcd-8c0f-12a81691d111",
  providerReference: "pay_provider_123",
  status: "SUCCEEDED" as const
};

describe("payment security", () => {
  it("returns deterministic fake checkout instructions", async () => {
    const gateway = new FakePaymentGateway();
    const checkout = await gateway.createCheckout({
      id: "ecf36fb7-a91e-4bcd-8c0f-12a81691d111",
      consultationId: "9b9f4311-2f58-4f7b-aca3-8a170943c20e",
      initiatedBy: "3f90b048-b166-455d-a083-2c8f34f87ef0",
      providerReference: "pay_fake_order",
      amountMinor: 75000,
      currency: "INR",
      status: "PENDING",
      completedAt: null,
      refundedAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    expect(checkout).toEqual({
      provider: "fake",
      orderId: "pay_fake_order",
      checkoutUrl: "/api/v1/dev/payments/ecf36fb7-a91e-4bcd-8c0f-12a81691d111",
      testMode: true
    });
  });

  it("rejects webhooks with an invalid signature", () => {
    const service = new PaymentService(
      {} as PaymentRepository,
      {} as ConsultationRepository,
      config,
      new FakePaymentGateway()
    );
    const body = Buffer.from(JSON.stringify(webhook));
    expect(() => service.processWebhook(webhook, body, "sha256=" + "0".repeat(64)))
      .toThrowError(expect.objectContaining({ code: "INVALID_WEBHOOK_SIGNATURE" }));
  });

  it("accepts a correctly signed webhook and passes its payload hash to storage", async () => {
    const body = Buffer.from(JSON.stringify(webhook));
    const signature = crypto.createHmac("sha256", config.PAYMENT_WEBHOOK_SECRET).update(body).digest("hex");
    const processWebhook = vi.fn().mockResolvedValue({ payment: {}, replayed: false });
    const repository = { processWebhook } as unknown as PaymentRepository;
    const service = new PaymentService(repository, {} as ConsultationRepository, config, new FakePaymentGateway());

    await expect(service.processWebhook(webhook, body, `sha256=${signature}`))
      .resolves.toMatchObject({ replayed: false });
    expect(processWebhook).toHaveBeenCalledWith(
      webhook,
      crypto.createHash("sha256").update(body).digest("hex")
    );
  });
});
