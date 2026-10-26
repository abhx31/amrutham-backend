import crypto from "node:crypto";
import { AppError } from "../../common/errors/app-error.js";
import type { AccessTokenIdentity } from "../auth/auth.types.js";
import { ConsultationRepository } from "./consultation.repository.js";
import type {
  CancelConsultationInput,
  CreateConsultationInput,
  ListConsultationsInput,
  TransitionConsultationInput
} from "./consultation.schemas.js";
import type { ConsultationStatus, ConsultationView } from "./consultation.types.js";
import type { CacheStore } from "../../infrastructure/cache/cache.service.js";
import { doctorCacheKeys } from "../../infrastructure/cache/cache-keys.js";

const transitions: Record<ConsultationStatus, ConsultationStatus[]> = {
  BOOKED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["IN_PROGRESS", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: []
};

export class ConsultationService {
  constructor(private readonly repository: ConsultationRepository, private readonly cache?: CacheStore) {}

  async book(
    patientId: string,
    idempotencyKey: string,
    input: CreateConsultationInput,
    requestId?: string
  ) {
    if (idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      throw new AppError("A valid Idempotency-Key header is required", 400, "INVALID_IDEMPOTENCY_KEY");
    }
    const requestHash = crypto.createHash("sha256").update(JSON.stringify({
      slotId: input.slotId,
      reason: input.reason ?? null
    })).digest("hex");
    const result = await this.repository.book({ patientId, idempotencyKey, requestHash, body: input, requestId });
    if (!result.replayed) {
      await this.cache?.increment(doctorCacheKeys.availabilityVersion(result.consultation.doctorId));
    }
    return result;
  }

  list(actor: AccessTokenIdentity, input: ListConsultationsInput): Promise<ConsultationView[]> {
    return this.repository.listForActor(actor.userId, actor.role, input);
  }

  async get(consultationId: string, actor: AccessTokenIdentity): Promise<ConsultationView> {
    const consultation = await this.requireConsultation(consultationId);
    this.assertParticipant(consultation, actor);
    return consultation;
  }

  async transition(
    consultationId: string,
    input: TransitionConsultationInput,
    actor: AccessTokenIdentity,
    requestId?: string
  ): Promise<ConsultationView> {
    const current = await this.requireConsultation(consultationId);
    if (actor.role !== "ADMIN" && current.doctorUserId !== actor.userId) {
      throw new AppError("Only the assigned doctor can update this consultation", 403, "FORBIDDEN");
    }
    if (!transitions[current.status].includes(input.status)) {
      throw new AppError(`Cannot transition from ${current.status} to ${input.status}`, 409, "INVALID_STATUS_TRANSITION");
    }
    const updated = await this.repository.transition({
      consultationId,
      from: [current.status],
      to: input.status,
      version: input.version,
      actorId: actor.userId,
      requestId,
      releaseSlot: input.status === "CANCELLED"
    });
    if (!updated) throw new AppError("Consultation was modified by another request", 409, "CONCURRENT_MODIFICATION");
    if (input.status === "CANCELLED") {
      await this.cache?.increment(doctorCacheKeys.availabilityVersion(updated.doctorId));
    }
    return updated;
  }

  async cancel(
    consultationId: string,
    input: CancelConsultationInput,
    actor: AccessTokenIdentity,
    requestId?: string
  ): Promise<ConsultationView> {
    const current = await this.requireConsultation(consultationId);
    if (current.patientId !== actor.userId) {
      throw new AppError("Only the patient can cancel this consultation", 403, "FORBIDDEN");
    }
    if (!transitions[current.status].includes("CANCELLED")) {
      throw new AppError(`Cannot cancel a ${current.status.toLowerCase()} consultation`, 409, "INVALID_STATUS_TRANSITION");
    }
    const updated = await this.repository.transition({
      consultationId,
      from: [current.status],
      to: "CANCELLED",
      version: input.version,
      actorId: actor.userId,
      requestId,
      releaseSlot: true,
      cancellationReason: input.reason
    });
    if (!updated) throw new AppError("Consultation was modified by another request", 409, "CONCURRENT_MODIFICATION");
    await this.cache?.increment(doctorCacheKeys.availabilityVersion(updated.doctorId));
    return updated;
  }

  private async requireConsultation(consultationId: string): Promise<ConsultationView> {
    const consultation = await this.repository.findById(consultationId);
    if (!consultation) throw new AppError("Consultation not found", 404, "CONSULTATION_NOT_FOUND");
    return consultation;
  }

  private assertParticipant(consultation: ConsultationView, actor: AccessTokenIdentity): void {
    if (
      actor.role !== "ADMIN" &&
      consultation.patientId !== actor.userId &&
      consultation.doctorUserId !== actor.userId
    ) throw new AppError("You cannot access this consultation", 403, "FORBIDDEN");
  }
}
