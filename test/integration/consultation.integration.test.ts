import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  auditLogs,
  availabilitySlots,
  consultations,
  doctors,
  outboxEvents,
  users
} from "../../src/infrastructure/database/schema.js";
import { ConsultationRepository } from "../../src/modules/consultations/consultation.repository.js";
import { ConsultationService } from "../../src/modules/consultations/consultation.service.js";
import { PaymentRepository } from "../../src/modules/payments/payment.repository.js";
import { integrationDatabase, resetIntegrationDatabase, seedBookingScenario } from "./database.js";

const repository = new ConsultationRepository(integrationDatabase);
const service = new ConsultationService(repository);
const paymentRepository = new PaymentRepository(integrationDatabase);

describe("PostgreSQL consultation concurrency", () => {
  beforeEach(resetIntegrationDatabase);
  afterAll(() => integrationDatabase.$client.end());

  it("allows exactly one patient to claim a slot", async () => {
    const scenario = await seedBookingScenario();
    const results = await Promise.allSettled([
      service.book(scenario.firstPatientId, "booking-key-patient-one", { slotId: scenario.slotId }),
      service.book(scenario.secondPatientId, "booking-key-patient-two", { slotId: scenario.slotId })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({ reason: { code: "SLOT_UNAVAILABLE", statusCode: 409 } });

    const consultationCount = (await integrationDatabase.select({ count: sql<number>`count(*)::int` }).from(consultations))[0]!.count;
    const outboxCount = (await integrationDatabase.select({ count: sql<number>`count(*)::int` }).from(outboxEvents))[0]!.count;
    const auditCount = (await integrationDatabase.select({ count: sql<number>`count(*)::int` }).from(auditLogs))[0]!.count;
    const [slot] = await integrationDatabase.select({ status: availabilitySlots.status }).from(availabilitySlots)
      .where(eq(availabilitySlots.id, scenario.slotId));
    expect({ consultationCount, outboxCount, auditCount, slotStatus: slot?.status }).toEqual({
      consultationCount: 1,
      outboxCount: 1,
      auditCount: 1,
      slotStatus: "BOOKED"
    });
  });

  it("rejects a hidden slot when its doctor is not verified", async () => {
    const scenario = await seedBookingScenario();
    await integrationDatabase.update(doctors).set({ verified: false })
      .where(eq(doctors.id, scenario.doctorId));

    await expect(service.book(scenario.firstPatientId, "unverified-doctor-slot", {
      slotId: scenario.slotId
    })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE", statusCode: 409 });

    const [slot] = await integrationDatabase.select({ status: availabilitySlots.status })
      .from(availabilitySlots).where(eq(availabilitySlots.id, scenario.slotId));
    expect(slot?.status).toBe("AVAILABLE");
  });

  it("rejects a slot when the doctor's account is suspended", async () => {
    const scenario = await seedBookingScenario();
    await integrationDatabase.update(users).set({ status: "SUSPENDED" })
      .where(eq(users.id, scenario.doctorUserId));

    await expect(service.book(scenario.firstPatientId, "suspended-doctor-slot", {
      slotId: scenario.slotId
    })).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE", statusCode: 409 });
  });

  it("serializes concurrent retries with the same idempotency key", async () => {
    const scenario = await seedBookingScenario();
    const [first, second] = await Promise.all([
      service.book(scenario.firstPatientId, "same-booking-key", { slotId: scenario.slotId, reason: "Regular checkup" }),
      service.book(scenario.firstPatientId, "same-booking-key", { slotId: scenario.slotId, reason: "Regular checkup" })
    ]);

    expect(first.consultation.id).toBe(second.consultation.id);
    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    const count = (await integrationDatabase.select({ count: sql<number>`count(*)::int` }).from(consultations))[0]!.count;
    expect(count).toBe(1);
  });

  it("allows only one optimistic state transition for a version", async () => {
    const scenario = await seedBookingScenario();
    const booked = await service.book(scenario.firstPatientId, "transition-booking-key", { slotId: scenario.slotId });
    const consultationId = booked.consultation.id;
    const results = await Promise.all([
      repository.transition({
        consultationId, from: ["BOOKED"], to: "CONFIRMED", version: 1,
        actorId: scenario.doctorUserId, releaseSlot: false
      }),
      repository.transition({
        consultationId, from: ["BOOKED"], to: "CANCELLED", version: 1,
        actorId: scenario.firstPatientId, releaseSlot: true
      })
    ]);

    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => result === undefined)).toHaveLength(1);
    const [stored] = await integrationDatabase.select({ status: consultations.status, version: consultations.version })
      .from(consultations).where(eq(consultations.id, consultationId));
    expect(stored?.version).toBe(2);
    expect(["CONFIRMED", "CANCELLED"]).toContain(stored?.status);
  });

  it("allows a future slot to be rebooked after cancellation", async () => {
    const scenario = await seedBookingScenario();
    const first = await service.book(scenario.firstPatientId, "first-cancelled-booking", {
      slotId: scenario.slotId
    });

    await service.cancel(
      first.consultation.id,
      { version: 1, reason: "Schedule conflict" },
      { userId: scenario.firstPatientId, role: "PATIENT" }
    );
    const second = await service.book(scenario.secondPatientId, "second-replacement-booking", {
      slotId: scenario.slotId
    });

    expect(second.consultation.patientId).toBe(scenario.secondPatientId);
    const stored = await integrationDatabase.select({
      status: consultations.status,
      cancellationReason: consultations.cancellationReason
    })
      .from(consultations).where(eq(consultations.slotId, scenario.slotId));
    expect(stored.map((row) => row.status).sort()).toEqual(["BOOKED", "CANCELLED"]);
    expect(stored.find((row) => row.status === "CANCELLED")?.cancellationReason).toBe("Schedule conflict");
  });

  it("allows only one active payment under concurrent initiation", async () => {
    const scenario = await seedBookingScenario();
    const booked = await service.book(scenario.firstPatientId, "payment-booking-key", { slotId: scenario.slotId });
    const results = await Promise.allSettled([
      paymentRepository.create({
        consultationId: booked.consultation.id,
        patientId: scenario.firstPatientId,
        idempotencyKey: "payment-one",
        requestHash: "hash-one"
      }),
      paymentRepository.create({
        consultationId: booked.consultation.id,
        patientId: scenario.firstPatientId,
        idempotencyKey: "payment-two",
        requestHash: "hash-two"
      })
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.find((result) => result.status === "rejected")).toMatchObject({
      reason: { code: "PAYMENT_ALREADY_EXISTS", statusCode: 409 }
    });
  });

  it("processes a concurrently repeated webhook exactly once in PostgreSQL", async () => {
    const scenario = await seedBookingScenario();
    const booked = await service.book(scenario.firstPatientId, "webhook-booking-key", { slotId: scenario.slotId });
    const { payment } = await paymentRepository.create({
      consultationId: booked.consultation.id,
      patientId: scenario.firstPatientId,
      idempotencyKey: "webhook-payment-key",
      requestHash: "webhook-payment-hash"
    });
    const webhook = {
      eventId: "provider-event-concurrency-1",
      paymentId: payment.id,
      providerReference: payment.providerReference!,
      status: "SUCCEEDED" as const
    };

    const [first, second] = await Promise.all([
      paymentRepository.processWebhook(webhook, "same-payload-hash"),
      paymentRepository.processWebhook(webhook, "same-payload-hash")
    ]);

    expect([first.replayed, second.replayed].sort()).toEqual([false, true]);
    expect(first.payment.status).toBe("SUCCEEDED");
    expect(second.payment.status).toBe("SUCCEEDED");
  });
});
