import { AppError } from "../../common/errors/app-error.js";
import { doctorCacheKeys } from "../../infrastructure/cache/cache-keys.js";
import type { CacheStore } from "../../infrastructure/cache/cache.service.js";
import type {
  AvailabilityInput,
  CreateDoctorInput,
  ListAvailabilityInput,
  ListDoctorsInput,
  ListOwnAvailabilityInput,
  ListPendingDoctorsInput,
  UpdateDoctorInput,
  VerifyDoctorInput
} from "./doctor.schemas.js";
import { DoctorRepository } from "./doctor.repository.js";
import type { AvailabilityView, DoctorView } from "./doctor.types.js";

export class DoctorService {
  constructor(private readonly repository: DoctorRepository, private readonly cache?: CacheStore) {}

  async list(input: ListDoctorsInput): Promise<DoctorView[]> {
    const version = await this.cacheVersion(doctorCacheKeys.listVersion);
    const key = doctorCacheKeys.list(version, input);
    const cached = await this.cache?.get<DoctorView[]>(key);
    if (cached) return cached;
    const doctors = await this.repository.listVerified(input);
    await this.cache?.set(key, doctors, 30);
    return doctors;
  }

  listPending(input: ListPendingDoctorsInput): Promise<DoctorView[]> {
    return this.repository.listPending(input);
  }

  async getPublic(doctorId: string): Promise<DoctorView> {
    const versionKey = doctorCacheKeys.profileVersion(doctorId);
    const version = await this.cacheVersion(versionKey);
    const key = doctorCacheKeys.profile(doctorId, version);
    const cached = await this.cache?.get<DoctorView>(key);
    if (cached) return cached;
    const doctor = await this.repository.findById(doctorId, true);
    if (!doctor) throw new AppError("Doctor not found", 404, "DOCTOR_NOT_FOUND");
    await this.cache?.set(key, doctor, 30);
    return doctor;
  }

  async getMine(userId: string): Promise<DoctorView> {
    return this.requireOwnedDoctor(userId);
  }

  async create(input: CreateDoctorInput, actorId: string, requestId?: string): Promise<DoctorView> {
    try {
      const doctor = await this.repository.create(input, actorId, requestId);
      if (!doctor) throw new AppError("An active user is required", 404, "USER_NOT_FOUND");
      await this.invalidateDoctor(doctor.id);
      return doctor;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError("A doctor already exists for this user or license", 409, "DOCTOR_ALREADY_EXISTS");
      }
      throw error;
    }
  }

  async updateMine(userId: string, input: UpdateDoctorInput, requestId?: string): Promise<DoctorView> {
    const doctor = await this.repository.updateOwn(userId, input, requestId);
    if (!doctor) throw new AppError("Doctor profile not found", 404, "DOCTOR_NOT_FOUND");
    await this.invalidateDoctor(doctor.id);
    return doctor;
  }

  async verify(
    doctorId: string,
    input: VerifyDoctorInput,
    actorId: string,
    requestId?: string
  ): Promise<DoctorView> {
    const doctor = await this.repository.verify(doctorId, input, actorId, requestId);
    if (!doctor) throw new AppError("Doctor not found", 404, "DOCTOR_NOT_FOUND");
    await this.invalidateDoctor(doctor.id);
    return doctor;
  }

  async listAvailability(doctorId: string, input: ListAvailabilityInput): Promise<AvailabilityView[]> {
    await this.getPublic(doctorId);
    const version = await this.cacheVersion(doctorCacheKeys.availabilityVersion(doctorId));
    const key = doctorCacheKeys.availability(doctorId, version, input);
    const cached = await this.cache?.get<AvailabilityView[]>(key);
    if (cached) return cached;
    const availability = await this.repository.listAvailability(doctorId, input);
    await this.cache?.set(key, availability, 10);
    return availability;
  }

  async listOwnAvailability(userId: string, input: ListOwnAvailabilityInput): Promise<AvailabilityView[]> {
    const doctor = await this.requireOwnedDoctor(userId);
    return this.repository.listOwnAvailability(doctor.id, input);
  }

  async createAvailability(
    userId: string,
    input: AvailabilityInput,
    requestId?: string
  ): Promise<AvailabilityView> {
    const doctor = await this.requireOwnedDoctor(userId);
    const slot = await this.repository.createAvailability(doctor.id, input, userId, requestId);
    if (!slot) throw new AppError("Availability overlaps an existing slot", 409, "AVAILABILITY_OVERLAP");
    await this.invalidateAvailability(doctor.id);
    return slot;
  }

  async updateAvailability(
    userId: string,
    slotId: string,
    input: AvailabilityInput,
    requestId?: string
  ): Promise<AvailabilityView> {
    const doctor = await this.requireOwnedDoctor(userId);
    const slot = await this.repository.updateAvailability(doctor.id, slotId, input, userId, requestId);
    if (!slot) {
      throw new AppError(
        "Slot overlaps existing availability or is no longer editable",
        409,
        "AVAILABILITY_NOT_EDITABLE"
      );
    }
    await this.invalidateAvailability(doctor.id);
    return slot;
  }

  async removeAvailability(userId: string, slotId: string, requestId?: string): Promise<void> {
    const doctor = await this.requireOwnedDoctor(userId);
    if (!(await this.repository.blockAvailability(doctor.id, slotId, userId, requestId))) {
      throw new AppError("Available slot not found or no longer editable", 404, "AVAILABILITY_NOT_EDITABLE");
    }
    await this.invalidateAvailability(doctor.id);
  }

  async invalidateAvailability(doctorId: string): Promise<void> {
    await this.cache?.increment(doctorCacheKeys.availabilityVersion(doctorId));
  }

  private async invalidateDoctor(doctorId: string): Promise<void> {
    await Promise.all([
      this.cache?.increment(doctorCacheKeys.listVersion),
      this.cache?.increment(doctorCacheKeys.profileVersion(doctorId))
    ]);
  }

  private async cacheVersion(key: string): Promise<number> {
    return (await this.cache?.get<number>(key)) ?? 0;
  }

  private async requireOwnedDoctor(userId: string): Promise<DoctorView> {
    const doctor = await this.repository.findByUserId(userId);
    if (!doctor) throw new AppError("Doctor profile not found", 404, "DOCTOR_NOT_FOUND");
    return doctor;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
