import crypto from "node:crypto";
import { type ChildProcess, spawn } from "node:child_process";
import type { Express } from "express";
import { and, isNull, sql } from "drizzle-orm";
import { Redis } from "ioredis";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import type { AppConfig } from "../../src/config/env.js";
import { createAppContainer, type ContainerCradle } from "../../src/container.js";
import { outboxEvents } from "../../src/infrastructure/database/schema.js";
import { bootstrapAdministrator } from "../../src/modules/admin/admin-bootstrap.service.js";

const databaseUrl = process.env.TEST_DATABASE_URL ??
  "postgresql://amrutam:amrutam@localhost:5433/amrutam_test";
const redisUrl = process.env.TEST_REDIS_URL ?? "redis://localhost:6379/15";
const metricsToken = "e2e-metrics-token-that-is-at-least-32-characters";
const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 3101,
  TRUST_PROXY_HOPS: 0,
  DATABASE_URL: databaseUrl,
  REDIS_URL: redisUrl,
  APP_PUBLIC_URL: "http://localhost:3101",
  EMAIL_FROM: "no-reply@amrutam.test",
  EMAIL_TRANSPORT: "fake",
  LOG_LEVEL: "silent",
  JWT_ACCESS_SECRET: "e2e-access-secret-that-is-at-least-32-characters",
  JWT_ISSUER: "amrutam-e2e",
  JWT_AUDIENCE: "amrutam-e2e-clients",
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 1,
  PAYMENT_WEBHOOK_SECRET: "e2e-payment-secret-that-is-at-least-32-characters",
  MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  METRICS_BEARER_TOKEN: metricsToken,
  PAYMENT_GATEWAY_MODE: "fake",
  OUTBOX_POLL_INTERVAL_MS: 100,
  OUTBOX_BATCH_SIZE: 100,
  OUTBOX_MAX_ATTEMPTS: 5
};

let app: Express | undefined;
let cradle: ContainerCradle | undefined;
let redis: Redis | undefined;
let worker: ChildProcess | undefined;
let workerOutput = "";

describe("application end-to-end lifecycle", () => {
  beforeAll(async () => {
    assertIsolatedTestResources(databaseUrl, redisUrl);
    workerOutput = "";
    const container = createAppContainer(config);
    cradle = container.cradle;
    app = createApp(cradle);
    await cradle.database.execute(sql`TRUNCATE TABLE users, outbox_events RESTART IDENTITY CASCADE`);

    redis = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
    await redis.ping();
    await redis.flushdb();

    worker = startWorker();
    await waitForWorker(worker);
  });

  afterAll(async () => {
    const cleanupErrors: unknown[] = [];
    try {
      await stopWorker(worker);
    } catch (error) {
      cleanupErrors.push(error);
    }
    const applicationCleanup = await Promise.allSettled([
      cradle?.cache.close() ?? Promise.resolve(),
      cradle?.database.$client.end() ?? Promise.resolve()
    ]);
    for (const result of applicationCleanup) {
      if (result.status === "rejected") cleanupErrors.push(result.reason);
    }
    if (redis && redis.status !== "end") {
      try {
        await redis.flushdb();
        await redis.quit();
      } catch (error) {
        redis.disconnect(false);
        cleanupErrors.push(error);
      }
    }
    if (cleanupErrors.length > 0) throw new AggregateError(cleanupErrors, "E2E resource cleanup failed");
  });

  it("runs authentication, clinical, payment, operations, and outbox flows", async () => {
    const api = requireApp();
    const database = requireCradle().database;
    const adminCredentials = {
      email: "admin.e2e@example.test",
      password: "Admin-E2E-Password-2026"
    };

    const firstBootstrap = await bootstrapAdministrator({
      databaseUrl,
      ...adminCredentials,
      firstName: "E2E",
      lastName: "Admin"
    });
    const repeatedBootstrap = await bootstrapAdministrator({
      databaseUrl,
      ...adminCredentials,
      firstName: "Ignored",
      lastName: "On Replay"
    });
    expect(firstBootstrap.created).toBe(true);
    expect(repeatedBootstrap).toEqual({ id: firstBootstrap.id, created: false });

    const adminAccessToken = await enrollPrivilegedAccount(api, adminCredentials);
    const adminAuthorization = authorization(adminAccessToken);

    const doctorCredentials = {
      email: "doctor.e2e@example.test",
      password: "Doctor-E2E-Password-2026"
    };
    const doctorUserResponse = await request(api)
      .post("/api/v1/admin/users")
      .set(adminAuthorization)
      .send({
        ...doctorCredentials,
        role: "PATIENT",
        firstName: "E2E",
        lastName: "Doctor",
        emailVerified: true
      })
      .expect(201);
    const doctorUserId = requiredString(doctorUserResponse.body.user?.id, "doctor user id");

    const doctorResponse = await request(api)
      .post("/api/v1/doctors")
      .set(adminAuthorization)
      .send({
        userId: doctorUserId,
        licenseNumber: "E2E-LIC-001",
        specialty: "General Medicine",
        consultationFeeMinor: 50_000,
        bio: "End-to-end test doctor"
      })
      .expect(201);
    const doctorId = requiredString(doctorResponse.body.doctor?.id, "doctor id");
    expect(doctorResponse.body.doctor).toMatchObject({ verified: false, userId: doctorUserId });

    const pendingBeforeVerification = await request(api)
      .get("/api/v1/admin/doctors/pending")
      .set(adminAuthorization)
      .expect(200);
    expect(pendingBeforeVerification.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: doctorId, verified: false })])
    );

    const publicBeforeVerification = await request(api).get("/api/v1/doctors").expect(200);
    expect(publicBeforeVerification.body.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: doctorId })])
    );

    const doctorAccessToken = await enrollPrivilegedAccount(api, doctorCredentials);
    const doctorAuthorization = authorization(doctorAccessToken);
    const start = new Date(Date.now() + 48 * 60 * 60 * 1_000);
    start.setUTCSeconds(0, 0);
    const end = new Date(start.getTime() + 30 * 60 * 1_000);
    const slotResponse = await request(api)
      .post("/api/v1/doctors/me/availability")
      .set(doctorAuthorization)
      .send({ startsAt: start.toISOString(), endsAt: end.toISOString() })
      .expect(201);
    const firstSlotId = requiredString(slotResponse.body.slot?.id, "first slot id");
    expect(slotResponse.body.slot).toMatchObject({ doctorId, status: "AVAILABLE", version: 1 });

    const ownAvailability = await request(api)
      .get("/api/v1/doctors/me/availability")
      .set(doctorAuthorization)
      .expect(200);
    expect(ownAvailability.body.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: firstSlotId })])
    );

    const patientAgent = request.agent(api);
    const patientRegistration = await patientAgent
      .post("/api/v1/auth/register")
      .send({
        email: "patient.e2e@example.test",
        password: "Patient-E2E-Password-2026",
        firstName: "E2E",
        lastName: "Patient",
        phone: "+919999999999"
      })
      .expect(201);
    expect(patientRegistration.headers["set-cookie"]).toBeDefined();
    const patientUserId = requiredString(patientRegistration.body.user?.id, "patient user id");

    const refreshedPatientSession = await patientAgent.post("/api/v1/auth/refresh").expect(200);
    const patientAccessToken = requiredString(refreshedPatientSession.body.accessToken, "patient access token");
    const patientAuthorization = authorization(patientAccessToken);
    expect(refreshedPatientSession.body.user).toMatchObject({ id: patientUserId, role: "PATIENT" });

    await request(api).get("/api/v1/auth/me").set(patientAuthorization).expect(200)
      .expect(({ body }) => expect(body.user).toMatchObject({ id: patientUserId }));
    await request(api).get("/api/v1/admin/doctors/pending").set(patientAuthorization).expect(403)
      .expect(({ body }) => expect(body.error?.code).toBe("FORBIDDEN"));

    await request(api)
      .post("/api/v1/consultations")
      .set(patientAuthorization)
      .set("Idempotency-Key", "preverify-booking-key-0001")
      .send({ slotId: firstSlotId, reason: "Pre-verification booking must fail" })
      .expect(409)
      .expect(({ body }) => expect(body.error?.code).toBe("SLOT_UNAVAILABLE"));

    const verification = await request(api)
      .patch(`/api/v1/doctors/${doctorId}/verification`)
      .set(adminAuthorization)
      .send({ verified: true, reason: "E2E credential verification" })
      .expect(200);
    expect(verification.body.doctor).toMatchObject({ id: doctorId, verified: true });

    const pendingAfterVerification = await request(api)
      .get("/api/v1/admin/doctors/pending")
      .set(adminAuthorization)
      .expect(200);
    expect(pendingAfterVerification.body.items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: doctorId })])
    );

    for (let index = 0; index < 2; index += 1) {
      await request(api).get("/api/v1/doctors").expect(200)
        .expect(({ body }) => expect(body.items).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: doctorId, verified: true })])
        ));
      await request(api).get(`/api/v1/doctors/${doctorId}`).expect(200)
        .expect(({ body }) => expect(body.doctor).toMatchObject({ id: doctorId }));
      await request(api).get(`/api/v1/doctors/${doctorId}/availability`).expect(200)
        .expect(({ body }) => expect(body.items).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: firstSlotId, status: "AVAILABLE" })])
        ));
    }

    const bookingKey = "booking-e2e-key-0001";
    const bookingBody = { slotId: firstSlotId, reason: "End-to-end consultation" };
    const booked = await request(api)
      .post("/api/v1/consultations")
      .set(patientAuthorization)
      .set("Idempotency-Key", bookingKey)
      .send(bookingBody)
      .expect(201)
      .expect("Idempotency-Replayed", "false");
    const consultationId = requiredString(booked.body.consultation?.id, "consultation id");
    expect(booked.body.consultation).toMatchObject({
      id: consultationId,
      patientId: patientUserId,
      doctorId,
      status: "BOOKED",
      version: 1,
      cancellationReason: null
    });

    await request(api)
      .post("/api/v1/consultations")
      .set(patientAuthorization)
      .set("Idempotency-Key", bookingKey)
      .send(bookingBody)
      .expect(200)
      .expect("Idempotency-Replayed", "true")
      .expect(({ body }) => expect(body.consultation.id).toBe(consultationId));

    await request(api)
      .post("/api/v1/consultations")
      .set(patientAuthorization)
      .set("Idempotency-Key", bookingKey)
      .send({ ...bookingBody, reason: "A conflicting replay" })
      .expect(409)
      .expect(({ body }) => expect(body.error?.code).toBe("IDEMPOTENCY_KEY_REUSED"));

    const paymentKey = "payment-e2e-key-0001";
    const paymentCreated = await request(api)
      .post(`/api/v1/consultations/${consultationId}/payments`)
      .set(patientAuthorization)
      .set("Idempotency-Key", paymentKey)
      .expect(201)
      .expect("Idempotency-Replayed", "false");
    const paymentId = requiredString(paymentCreated.body.payment?.id, "payment id");
    expect(paymentCreated.body).toMatchObject({
      payment: { id: paymentId, consultationId, status: "PENDING", amountMinor: 50_000 },
      checkout: { provider: "fake", testMode: true }
    });

    await request(api)
      .post(`/api/v1/consultations/${consultationId}/payments`)
      .set(patientAuthorization)
      .set("Idempotency-Key", paymentKey)
      .expect(200)
      .expect("Idempotency-Replayed", "true")
      .expect(({ body }) => expect(body.payment.id).toBe(paymentId));

    const providerReference = requiredString(
      paymentCreated.body.payment?.providerReference,
      "payment provider reference"
    );
    const webhookBody = JSON.stringify({
      eventId: "e2e-provider-event-0001",
      paymentId,
      providerReference,
      status: "SUCCEEDED"
    });
    const webhookSignature = crypto.createHmac("sha256", config.PAYMENT_WEBHOOK_SECRET)
      .update(Buffer.from(webhookBody))
      .digest("hex");

    await request(api)
      .post("/api/v1/payments/webhooks/provider")
      .type("application/json")
      .set("x-payment-signature", `sha256=${"0".repeat(64)}`)
      .send(webhookBody)
      .expect(401)
      .expect(({ body }) => expect(body.error?.code).toBe("INVALID_WEBHOOK_SIGNATURE"));

    for (const replayed of [false, true]) {
      await request(api)
        .post("/api/v1/payments/webhooks/provider")
        .type("application/json")
        .set("x-payment-signature", `sha256=${webhookSignature}`)
        .send(webhookBody)
        .expect(200)
        .expect(({ body }) => expect(body).toEqual({ received: true, replayed }));
    }

    await request(api)
      .post(`/api/v1/dev/payments/${paymentId}`)
      .set(adminAuthorization)
      .send({ status: "REFUNDED" })
      .expect(200)
      .expect(({ body }) => expect(body.payment).toMatchObject({ id: paymentId, status: "REFUNDED" }));

    for (const actorAuthorization of [patientAuthorization, doctorAuthorization]) {
      await request(api).get(`/api/v1/payments/${paymentId}`).set(actorAuthorization).expect(200)
        .expect(({ body }) => expect(body.payment).toMatchObject({ id: paymentId, status: "REFUNDED" }));
      await request(api).get(`/api/v1/consultations/${consultationId}/payments`)
        .set(actorAuthorization).expect(200)
        .expect(({ body }) => expect(body.items).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: paymentId, status: "REFUNDED" })])
        ));
    }

    await transitionConsultation(api, consultationId, doctorAuthorization, "CONFIRMED", 1, 2);
    await transitionConsultation(api, consultationId, doctorAuthorization, "IN_PROGRESS", 2, 3);

    const prescriptionCreated = await request(api)
      .post(`/api/v1/consultations/${consultationId}/prescriptions`)
      .set(doctorAuthorization)
      .send({
        medications: [{
          name: "Amoxicillin",
          dosage: "500 mg",
          frequency: "Twice daily",
          duration: "5 days",
          instructions: "After food"
        }],
        notes: "Initial E2E prescription"
      })
      .expect(201);
    const prescriptionId = requiredString(prescriptionCreated.body.prescription?.id, "prescription id");
    expect(prescriptionCreated.body.prescription).toMatchObject({ id: prescriptionId, status: "DRAFT", version: 1 });

    await request(api).get(`/api/v1/consultations/${consultationId}/prescriptions`)
      .set(patientAuthorization).expect(200)
      .expect(({ body }) => expect(body.items).toEqual([]));
    await request(api).get(`/api/v1/prescriptions/${prescriptionId}`)
      .set(patientAuthorization).expect(404)
      .expect(({ body }) => expect(body.error?.code).toBe("PRESCRIPTION_NOT_FOUND"));

    await request(api)
      .patch(`/api/v1/prescriptions/${prescriptionId}`)
      .set(doctorAuthorization)
      .send({ notes: "Updated after clinical review" })
      .expect(200)
      .expect(({ body }) => expect(body.prescription).toMatchObject({
        id: prescriptionId,
        status: "DRAFT",
        version: 1,
        notes: "Updated after clinical review"
      }));

    await request(api)
      .post(`/api/v1/prescriptions/${prescriptionId}/finalize`)
      .set(doctorAuthorization)
      .expect(200)
      .expect(({ body }) => expect(body.prescription).toMatchObject({
        id: prescriptionId,
        status: "FINAL",
        version: 1
      }));
    await request(api).get(`/api/v1/prescriptions/${prescriptionId}`)
      .set(patientAuthorization).expect(200)
      .expect(({ body }) => expect(body.prescription).toMatchObject({ id: prescriptionId, status: "FINAL" }));

    await transitionConsultation(api, consultationId, doctorAuthorization, "COMPLETED", 3, 4);
    for (const actorAuthorization of [patientAuthorization, doctorAuthorization]) {
      await request(api).get(`/api/v1/consultations/${consultationId}`)
        .set(actorAuthorization).expect(200)
        .expect(({ body }) => expect(body.consultation).toMatchObject({ id: consultationId, status: "COMPLETED" }));
      await request(api).get("/api/v1/consultations").set(actorAuthorization).expect(200)
        .expect(({ body }) => expect(body.items).toEqual(
          expect.arrayContaining([expect.objectContaining({ id: consultationId, status: "COMPLETED" })])
        ));
    }

    const secondStart = new Date(start.getTime() + 24 * 60 * 60 * 1_000);
    const secondEnd = new Date(secondStart.getTime() + 30 * 60 * 1_000);
    const secondSlot = await request(api)
      .post("/api/v1/doctors/me/availability")
      .set(doctorAuthorization)
      .send({ startsAt: secondStart.toISOString(), endsAt: secondEnd.toISOString() })
      .expect(201);
    const secondSlotId = requiredString(secondSlot.body.slot?.id, "second slot id");
    const secondBooking = await request(api)
      .post("/api/v1/consultations")
      .set(patientAuthorization)
      .set("Idempotency-Key", "booking-e2e-key-0002")
      .send({ slotId: secondSlotId, reason: "Cancellation persistence check" })
      .expect(201);
    const cancelledConsultationId = requiredString(secondBooking.body.consultation?.id, "cancelled consultation id");
    await request(api)
      .post(`/api/v1/consultations/${cancelledConsultationId}/cancel`)
      .set(patientAuthorization)
      .send({ version: 1, reason: "Patient schedule conflict" })
      .expect(200)
      .expect(({ body }) => expect(body.consultation).toMatchObject({
        id: cancelledConsultationId,
        status: "CANCELLED",
        version: 2,
        cancellationReason: "Patient schedule conflict"
      }));
    await request(api).get(`/api/v1/consultations/${cancelledConsultationId}`)
      .set(patientAuthorization).expect(200)
      .expect(({ body }) => expect(body.consultation.cancellationReason).toBe("Patient schedule conflict"));

    const auditLogs = await request(api)
      .get("/api/v1/audit-logs?limit=100")
      .set(adminAuthorization)
      .expect(200);
    expect(auditLogs.body.items.length).toBeGreaterThan(10);
    const firstAuditLogId = requiredString(auditLogs.body.items[0]?.id, "audit log id");
    await request(api).get(`/api/v1/audit-logs/${firstAuditLogId}`).set(adminAuthorization).expect(200);

    for (const endpoint of ["overview", "consultations", "doctors", "payments"]) {
      await request(api).get(`/api/v1/admin/analytics/${endpoint}`).set(adminAuthorization).expect(200)
        .expect("Cache-Control", /private, max-age=60/);
    }

    await request(api).get("/api/v1/health/live").expect(200).expect({ status: "ok" });
    await request(api).get("/api/v1/health/ready").expect(200)
      .expect(({ body }) => expect(body).toEqual({ status: "ready", checks: { database: "up" } }));
    await request(api).get("/metrics").expect(401);
    await request(api).get("/metrics").set("Authorization", `Bearer ${metricsToken}`).expect(200)
      .expect("Content-Type", /text\/plain/)
      .expect(({ text }) => expect(text).toContain("http_requests_total"));
    await request(api).get("/api/openapi.json").expect(200)
      .expect(({ body }) => {
        expect(body.openapi).toBe("3.1.0");
        expect(body.paths["/consultations"]).toBeDefined();
      });

    const outbox = await waitForProcessedOutbox(database, 8);
    expect(outbox.map((event) => event.eventType)).toEqual(expect.arrayContaining([
      "consultation.booked",
      "consultation.status_changed",
      "payment.status_changed",
      "prescription.finalized"
    ]));
    expect(outbox.every((event) => event.processedAt !== null)).toBe(true);
  }, 60_000);
});

async function enrollPrivilegedAccount(
  target: Express,
  credentials: { email: string; password: string }
): Promise<string> {
  const login = await request(target).post("/api/v1/auth/login").send(credentials).expect(200);
  expect(login.body).toMatchObject({ mfaSetupRequired: true, mfaRequired: false });
  const challengeToken = requiredString(login.body.challengeToken, "MFA challenge token");
  const setup = await request(target)
    .post("/api/v1/auth/mfa/setup")
    .set("Authorization", `Bearer ${challengeToken}`)
    .expect(200)
    .expect("Cache-Control", "no-store");
  const secret = requiredString(setup.body.secret, "MFA secret");
  const verification = await request(target)
    .post("/api/v1/auth/mfa/verify-setup")
    .set("Authorization", `Bearer ${challengeToken}`)
    .send({ code: generateTotp(secret) })
    .expect(200)
    .expect("Cache-Control", "no-store");
  expect(verification.body.recoveryCodes).toHaveLength(10);
  return requiredString(verification.body.accessToken, "privileged access token");
}

async function transitionConsultation(
  target: Express,
  consultationId: string,
  actorAuthorization: { Authorization: string },
  status: "CONFIRMED" | "IN_PROGRESS" | "COMPLETED",
  version: number,
  expectedVersion: number
): Promise<void> {
  await request(target)
    .patch(`/api/v1/consultations/${consultationId}/status`)
    .set(actorAuthorization)
    .send({ status, version })
    .expect(200)
    .expect(({ body }) => expect(body.consultation).toMatchObject({ status, version: expectedVersion }));
}

function authorization(accessToken: string): { Authorization: string } {
  return { Authorization: `Bearer ${accessToken}` };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Missing ${label}`);
  return value;
}

function requireApp(): Express {
  if (!app) throw new Error("E2E application was not initialized");
  return app;
}

function requireCradle(): ContainerCradle {
  if (!cradle) throw new Error("E2E container was not initialized");
  return cradle;
}

function generateTotp(secret: string, now = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = crypto.createHmac("sha1", decodeBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary = ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 1_000_000).padStart(6, "0");
}

function decodeBase32(value: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let accumulator = 0;
  const bytes: number[] = [];
  for (const character of value.replaceAll("=", "").toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) throw new Error("Invalid Base32 MFA secret");
    accumulator = (accumulator << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((accumulator >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function startWorker(): ChildProcess {
  const child = spawn(process.execPath, ["--import", "tsx", "src/bootstrap-worker.ts"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: config.NODE_ENV,
      PORT: String(config.PORT),
      TRUST_PROXY_HOPS: String(config.TRUST_PROXY_HOPS),
      DATABASE_URL: config.DATABASE_URL,
      REDIS_URL: config.REDIS_URL,
      APP_PUBLIC_URL: config.APP_PUBLIC_URL,
      EMAIL_FROM: config.EMAIL_FROM,
      EMAIL_TRANSPORT: config.EMAIL_TRANSPORT,
      LOG_LEVEL: "info",
      JWT_ACCESS_SECRET: config.JWT_ACCESS_SECRET,
      JWT_ISSUER: config.JWT_ISSUER,
      JWT_AUDIENCE: config.JWT_AUDIENCE,
      ACCESS_TOKEN_TTL_SECONDS: String(config.ACCESS_TOKEN_TTL_SECONDS),
      REFRESH_TOKEN_TTL_DAYS: String(config.REFRESH_TOKEN_TTL_DAYS),
      PAYMENT_WEBHOOK_SECRET: config.PAYMENT_WEBHOOK_SECRET,
      MFA_ENCRYPTION_KEY: config.MFA_ENCRYPTION_KEY,
      METRICS_BEARER_TOKEN: config.METRICS_BEARER_TOKEN,
      PAYMENT_GATEWAY_MODE: config.PAYMENT_GATEWAY_MODE,
      OUTBOX_POLL_INTERVAL_MS: String(config.OUTBOX_POLL_INTERVAL_MS),
      OUTBOX_BATCH_SIZE: String(config.OUTBOX_BATCH_SIZE),
      OUTBOX_MAX_ATTEMPTS: String(config.OUTBOX_MAX_ATTEMPTS),
      OTEL_ENABLED: "false"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout?.on("data", (chunk: Buffer) => { workerOutput += chunk.toString(); });
  child.stderr?.on("data", (chunk: Buffer) => { workerOutput += chunk.toString(); });
  return child;
}

async function waitForWorker(child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Outbox worker exited early (${child.exitCode}): ${workerOutput}`);
    if (workerOutput.includes("Outbox worker started")) return;
    await delay(50);
  }
  throw new Error(`Timed out waiting for outbox worker: ${workerOutput}`);
}

async function stopWorker(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exited = new Promise<void>((resolve) => child.once("exit", () => resolve()));
  child.kill("SIGTERM");
  await Promise.race([exited, delay(5_000)]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(2_000)]);
  }
}

async function waitForProcessedOutbox(database: ContainerCradle["database"], minimumEvents: number) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const events = await database.select({
      eventType: outboxEvents.eventType,
      processedAt: outboxEvents.processedAt
    }).from(outboxEvents);
    const [pending] = await database.select({ count: sql<number>`count(*)::int` })
      .from(outboxEvents)
      .where(and(isNull(outboxEvents.processedAt), sql`${outboxEvents.attempts} < ${config.OUTBOX_MAX_ATTEMPTS}`));
    if (events.length >= minimumEvents && pending?.count === 0) return events;
    await delay(100);
  }
  throw new Error(`Outbox was not fully processed: ${workerOutput}`);
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function assertIsolatedTestResources(databaseConnection: string, redisConnection: string): void {
  const databaseName = decodeURIComponent(new URL(databaseConnection).pathname.slice(1));
  if (!databaseName.endsWith("_test")) {
    throw new Error(`Refusing to truncate non-test database '${databaseName}'`);
  }
  const redisDatabase = new URL(redisConnection).pathname.replace(/^\//, "") || "0";
  if (redisDatabase !== "15") {
    throw new Error(`Refusing to flush Redis database ${redisDatabase}; E2E requires isolated database 15`);
  }
}
