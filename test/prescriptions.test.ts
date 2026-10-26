import { describe, expect, it, vi } from "vitest";
import type { ConsultationRepository } from "../src/modules/consultations/consultation.repository.js";
import type { PrescriptionRepository } from "../src/modules/prescriptions/prescription.repository.js";
import { PrescriptionService } from "../src/modules/prescriptions/prescription.service.js";

const consultation = {
  id: "76ce2961-4308-44d6-a314-02cff8c677bb",
  doctorId: "a26c381f-203d-438b-8947-1843c3f40dc3",
  doctorUserId: "75a00bf8-407d-48e2-96a4-8711f528a411",
  patientId: "6e0e61d4-9e40-4439-8005-a194b4ef5f4d",
  status: "IN_PROGRESS" as const
};

describe("prescription policies", () => {
  it("does not expose draft prescriptions to patients by direct ID", async () => {
    const repository = {
      findById: vi.fn().mockResolvedValue({
        id: "96c11495-fd88-43ac-a942-5850a96cc2bf",
        consultationId: consultation.id,
        doctorId: consultation.doctorId,
        doctorUserId: consultation.doctorUserId,
        patientId: consultation.patientId,
        version: 1,
        status: "DRAFT",
        medications: [],
        notes: null,
        finalizedAt: null,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    } as unknown as PrescriptionRepository;
    const service = new PrescriptionService(repository, {} as ConsultationRepository);
    await expect(service.get(
      "96c11495-fd88-43ac-a942-5850a96cc2bf",
      { userId: consultation.patientId, role: "PATIENT" }
    )).rejects.toMatchObject({ code: "PRESCRIPTION_NOT_FOUND", statusCode: 404 });
  });

  it("allows only the assigned doctor to prescribe", async () => {
    const consultationRepository = {
      findById: vi.fn().mockResolvedValue(consultation)
    } as unknown as ConsultationRepository;
    const service = new PrescriptionService({} as PrescriptionRepository, consultationRepository);

    await expect(service.create(
      consultation.id,
      { medications: [{ name: "Medicine", dosage: "10 mg", frequency: "Once daily", duration: "5 days" }] },
      { userId: "38ea37cf-d581-452e-b1c3-ed50234a44ac", role: "DOCTOR" }
    )).rejects.toMatchObject({ code: "FORBIDDEN", statusCode: 403 });
  });

  it("allows the patient to read prescriptions from their consultation", async () => {
    const consultationRepository = {
      findById: vi.fn().mockResolvedValue(consultation)
    } as unknown as ConsultationRepository;
    const listForConsultation = vi.fn().mockResolvedValue([]);
    const repository = { listForConsultation } as unknown as PrescriptionRepository;
    const service = new PrescriptionService(repository, consultationRepository);

    await expect(service.list(
      consultation.id,
      { userId: consultation.patientId, role: "PATIENT" }
    )).resolves.toEqual([]);
    expect(listForConsultation).toHaveBeenCalledWith(consultation.id, true);
  });
});
