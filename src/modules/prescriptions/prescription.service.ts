import { AppError } from "../../common/errors/app-error.js";
import type { AccessTokenIdentity } from "../auth/auth.types.js";
import type { ConsultationRepository } from "../consultations/consultation.repository.js";
import { PrescriptionRepository } from "./prescription.repository.js";
import type { CreatePrescriptionInput, UpdatePrescriptionInput } from "./prescription.schemas.js";
import type { PrescriptionView } from "./prescription.types.js";

export class PrescriptionService {
  constructor(
    private readonly repository: PrescriptionRepository,
    private readonly consultationRepository: ConsultationRepository
  ) {}

  async create(
    consultationId: string,
    input: CreatePrescriptionInput,
    actor: AccessTokenIdentity,
    requestId?: string
  ): Promise<PrescriptionView> {
    const consultation = await this.consultationRepository.findById(consultationId);
    if (!consultation) throw new AppError("Consultation not found", 404, "CONSULTATION_NOT_FOUND");
    if (consultation.doctorUserId !== actor.userId) {
      throw new AppError("Only the assigned doctor can prescribe", 403, "FORBIDDEN");
    }
    if (!(["IN_PROGRESS", "COMPLETED"] as const).includes(consultation.status as "IN_PROGRESS" | "COMPLETED")) {
      throw new AppError("Prescriptions require an active or completed consultation", 409, "CONSULTATION_NOT_PRESCRIBABLE");
    }
    return this.repository.create(consultationId, consultation.doctorId, input, actor.userId, requestId);
  }

  async list(consultationId: string, actor: AccessTokenIdentity): Promise<PrescriptionView[]> {
    const consultation = await this.consultationRepository.findById(consultationId);
    if (!consultation) throw new AppError("Consultation not found", 404, "CONSULTATION_NOT_FOUND");
    if (
      actor.role !== "ADMIN" &&
      consultation.patientId !== actor.userId &&
      consultation.doctorUserId !== actor.userId
    ) throw new AppError("You cannot access these prescriptions", 403, "FORBIDDEN");
    return this.repository.listForConsultation(consultationId, actor.role === "PATIENT");
  }

  async get(prescriptionId: string, actor: AccessTokenIdentity): Promise<PrescriptionView> {
    const prescription = await this.repository.findById(prescriptionId);
    if (!prescription) throw new AppError("Prescription not found", 404, "PRESCRIPTION_NOT_FOUND");
    const isDoctor = prescription.doctorUserId === actor.userId;
    const isPatient = prescription.patientId === actor.userId;
    if (actor.role !== "ADMIN" && !isDoctor && !isPatient) {
      throw new AppError("You cannot access this prescription", 403, "FORBIDDEN");
    }
    if (isPatient && prescription.status !== "FINAL") {
      throw new AppError("Prescription not found", 404, "PRESCRIPTION_NOT_FOUND");
    }
    return prescription;
  }

  async updateDraft(
    prescriptionId: string,
    input: UpdatePrescriptionInput,
    actor: AccessTokenIdentity,
    requestId?: string
  ): Promise<PrescriptionView> {
    const prescription = await this.repository.findById(prescriptionId);
    if (!prescription) throw new AppError("Prescription not found", 404, "PRESCRIPTION_NOT_FOUND");
    if (prescription.doctorUserId !== actor.userId) {
      throw new AppError("Only the assigned doctor can edit this prescription", 403, "FORBIDDEN");
    }
    if (prescription.status !== "DRAFT") {
      throw new AppError("Final prescriptions are immutable", 409, "PRESCRIPTION_ALREADY_FINAL");
    }
    const updated = await this.repository.updateDraft(prescriptionId, input, actor.userId, requestId);
    if (!updated) throw new AppError("Prescription is no longer editable", 409, "PRESCRIPTION_ALREADY_FINAL");
    return updated;
  }

  async finalize(
    prescriptionId: string,
    actor: AccessTokenIdentity,
    requestId?: string
  ): Promise<PrescriptionView> {
    const prescription = await this.repository.findById(prescriptionId);
    if (!prescription) throw new AppError("Prescription not found", 404, "PRESCRIPTION_NOT_FOUND");
    if (prescription.doctorUserId !== actor.userId) {
      throw new AppError("Only the assigned doctor can finalize this prescription", 403, "FORBIDDEN");
    }
    const finalized = await this.repository.finalize(prescriptionId, actor.userId, requestId);
    if (!finalized) throw new AppError("Prescription is already final", 409, "PRESCRIPTION_ALREADY_FINAL");
    return finalized;
  }
}
