import { describe, expect, it, vi } from "vitest";
import type { ConsultationRepository } from "../src/modules/consultations/consultation.repository.js";
import { ConsultationService } from "../src/modules/consultations/consultation.service.js";
import type { CacheStore } from "../src/infrastructure/cache/cache.service.js";
import { doctorCacheKeys } from "../src/infrastructure/cache/cache-keys.js";

const consultation = {
  id: "76ce2961-4308-44d6-a314-02cff8c677bb",
  slotId: "74635161-e6ae-42b7-820f-81a973211cf0",
  doctorId: "a26c381f-203d-438b-8947-1843c3f40dc3",
  doctorUserId: "75a00bf8-407d-48e2-96a4-8711f528a411",
  doctorName: "Maya Shah",
  patientId: "6e0e61d4-9e40-4439-8005-a194b4ef5f4d",
  status: "BOOKED" as const,
  reason: null,
  startsAt: new Date("2099-01-01T10:00:00.000Z"),
  endsAt: new Date("2099-01-01T10:30:00.000Z"),
  version: 1,
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("consultation policies", () => {
  it("requires a meaningful idempotency key for booking", async () => {
    const service = new ConsultationService({} as ConsultationRepository);
    await expect(service.book(consultation.patientId, "short", { slotId: consultation.slotId }))
      .rejects.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY", statusCode: 400 });
  });

  it("prevents an unrelated doctor from changing consultation state", async () => {
    const repository = { findById: vi.fn().mockResolvedValue(consultation) } as unknown as ConsultationRepository;
    const service = new ConsultationService(repository);
    await expect(service.transition(
      consultation.id,
      { status: "CONFIRMED", version: 1 },
      { userId: "42f520ba-bb3b-42dc-916b-585af49c4713", role: "DOCTOR" }
    )).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
  });

  it("rejects invalid lifecycle transitions", async () => {
    const completed = { ...consultation, status: "COMPLETED" as const };
    const repository = { findById: vi.fn().mockResolvedValue(completed) } as unknown as ConsultationRepository;
    const service = new ConsultationService(repository);
    await expect(service.transition(
      completed.id,
      { status: "CONFIRMED", version: 2 },
      { userId: completed.doctorUserId, role: "DOCTOR" }
    )).rejects.toMatchObject({ code: "INVALID_STATUS_TRANSITION", statusCode: 409 });
  });

  it("invalidates public availability after cancellation releases the slot", async () => {
    const cancelled = { ...consultation, status: "CANCELLED" as const, version: 2 };
    const repository = {
      findById: vi.fn().mockResolvedValue(consultation),
      transition: vi.fn().mockResolvedValue(cancelled)
    } as unknown as ConsultationRepository;
    const increment = vi.fn().mockResolvedValue(undefined);
    const service = new ConsultationService(repository, { increment } as unknown as CacheStore);

    await service.cancel(
      consultation.id,
      { version: 1, reason: "Schedule conflict" },
      { userId: consultation.patientId, role: "PATIENT" }
    );

    expect(increment).toHaveBeenCalledWith(doctorCacheKeys.availabilityVersion(consultation.doctorId));
  });
});
