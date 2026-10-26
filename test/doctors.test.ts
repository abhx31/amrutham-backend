import { describe, expect, it, vi } from "vitest";
import type { DoctorRepository } from "../src/modules/doctors/doctor.repository.js";
import { createAvailabilitySchema } from "../src/modules/doctors/doctor.schemas.js";
import { DoctorService } from "../src/modules/doctors/doctor.service.js";
import type { CacheStore } from "../src/infrastructure/cache/cache.service.js";

const doctor = {
  id: "73f7b99d-d7ce-4a26-8442-5c9b87fa352d",
  userId: "bc774044-d421-4970-aa95-2904698d2aab",
  firstName: "Maya",
  lastName: "Shah",
  specialty: "Dermatology",
  consultationFeeMinor: 75000,
  bio: null,
  verified: true,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("doctor policies and availability", () => {
  it("serves a public doctor from cache without querying PostgreSQL", async () => {
    const findById = vi.fn();
    const repository = { findById } as unknown as DoctorRepository;
    const get = vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(doctor);
    const service = new DoctorService(repository, { get } as unknown as CacheStore);

    await expect(service.getPublic(doctor.id)).resolves.toEqual(doctor);
    expect(findById).not.toHaveBeenCalled();
  });

  it("resolves the authenticated doctor's ID when listing their schedule", async () => {
    const listOwnAvailability = vi.fn().mockResolvedValue([]);
    const repository = {
      findByUserId: vi.fn().mockResolvedValue(doctor),
      listOwnAvailability
    } as unknown as DoctorRepository;
    const service = new DoctorService(repository);
    await service.listOwnAvailability(doctor.userId, { limit: 50 });
    expect(listOwnAvailability).toHaveBeenCalledWith(doctor.id, { limit: 50 });
  });

  it("rejects an availability interval longer than three hours", () => {
    expect(() => createAvailabilitySchema.parse({
      startsAt: "2099-01-01T08:00:00+05:30",
      endsAt: "2099-01-01T12:00:00+05:30"
    })).toThrow();
  });

  it("derives the doctor from the authenticated user before creating availability", async () => {
    const slot = {
      id: "fa3aa020-9418-4f90-94e5-edfb6f996f15",
      doctorId: doctor.id,
      startsAt: new Date("2099-01-01T02:30:00.000Z"),
      endsAt: new Date("2099-01-01T03:00:00.000Z"),
      status: "AVAILABLE" as const,
      version: 1
    };
    const createAvailability = vi.fn().mockResolvedValue(slot);
    const repository = {
      findByUserId: vi.fn().mockResolvedValue(doctor),
      createAvailability
    } as unknown as DoctorRepository;
    const service = new DoctorService(repository);

    await expect(service.createAvailability(doctor.userId, {
      startsAt: slot.startsAt,
      endsAt: slot.endsAt
    })).resolves.toEqual(slot);
    expect(createAvailability).toHaveBeenCalledWith(
      doctor.id,
      { startsAt: slot.startsAt, endsAt: slot.endsAt },
      doctor.userId,
      undefined
    );
  });

  it("rejects availability management when the caller has no doctor profile", async () => {
    const repository = { findByUserId: vi.fn().mockResolvedValue(undefined) } as unknown as DoctorRepository;
    const service = new DoctorService(repository);

    await expect(service.removeAvailability(
      "bc774044-d421-4970-aa95-2904698d2aab",
      "fa3aa020-9418-4f90-94e5-edfb6f996f15"
    )).rejects.toMatchObject({ code: "DOCTOR_NOT_FOUND", statusCode: 404 });
  });
});
