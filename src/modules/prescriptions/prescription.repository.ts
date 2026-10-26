import { and, desc, eq, sql } from "drizzle-orm";
import { AppError } from "../../common/errors/app-error.js";
import type { Database } from "../../infrastructure/database/database.js";
import { auditLogs, consultations, doctors, outboxEvents, prescriptions } from "../../infrastructure/database/schema.js";
import type { CreatePrescriptionInput, UpdatePrescriptionInput } from "./prescription.schemas.js";
import type { Medication, PrescriptionView } from "./prescription.types.js";

const selection = {
  id: prescriptions.id,
  consultationId: prescriptions.consultationId,
  doctorId: prescriptions.doctorId,
  doctorUserId: doctors.userId,
  patientId: consultations.patientId,
  version: prescriptions.version,
  status: prescriptions.status,
  medications: prescriptions.medications,
  notes: prescriptions.notes,
  finalizedAt: prescriptions.finalizedAt,
  createdAt: prescriptions.createdAt,
  updatedAt: prescriptions.updatedAt
};

export class PrescriptionRepository {
  constructor(private readonly database: Database) {}

  create(
    consultationId: string,
    doctorId: string,
    input: CreatePrescriptionInput,
    actorId: string,
    requestId?: string
  ): Promise<PrescriptionView> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${consultationId}))`);
      const [latest] = await transaction.select({
        version: prescriptions.version,
        status: prescriptions.status
      }).from(prescriptions).where(eq(prescriptions.consultationId, consultationId))
        .orderBy(desc(prescriptions.version)).limit(1);
      if (latest?.status === "DRAFT") {
        throw new AppError("Finalize the current draft before creating an amendment", 409, "PRESCRIPTION_DRAFT_EXISTS");
      }
      const [created] = await transaction.insert(prescriptions).values({
        consultationId,
        doctorId,
        version: (latest?.version ?? 0) + 1,
        medications: input.medications,
        notes: input.notes
      }).returning({ id: prescriptions.id });
      if (!created) throw new Error("Prescription insert returned no record");
      await transaction.insert(auditLogs).values({
        actorId,
        action: "PRESCRIPTION_DRAFT_CREATED",
        entityType: "prescription",
        entityId: created.id,
        requestId,
        metadata: { consultationId, version: (latest?.version ?? 0) + 1 }
      });
      const record = await selectPrescription(transaction, created.id);
      if (!record) throw new Error("Created prescription could not be loaded");
      return record;
    });
  }

  async listForConsultation(consultationId: string, finalOnly = false): Promise<PrescriptionView[]> {
    const records = await prescriptionQuery(this.database).where(and(
      eq(prescriptions.consultationId, consultationId),
      finalOnly ? eq(prescriptions.status, "FINAL") : undefined
    ))
      .orderBy(desc(prescriptions.version));
    return records.map(mapPrescription);
  }

  findById(prescriptionId: string): Promise<PrescriptionView | undefined> {
    return selectPrescription(this.database, prescriptionId);
  }

  updateDraft(
    prescriptionId: string,
    input: UpdatePrescriptionInput,
    actorId: string,
    requestId?: string
  ): Promise<PrescriptionView | undefined> {
    return this.database.transaction(async (transaction) => {
      const update: { medications?: CreatePrescriptionInput["medications"]; notes?: string | null; updatedAt: Date } = {
        updatedAt: new Date()
      };
      if (input.medications !== undefined) update.medications = input.medications;
      if (input.notes !== undefined) update.notes = input.notes;
      const [changed] = await transaction.update(prescriptions).set(update)
        .where(and(eq(prescriptions.id, prescriptionId), eq(prescriptions.status, "DRAFT")))
        .returning({ id: prescriptions.id });
      if (!changed) return undefined;
      await transaction.insert(auditLogs).values({
        actorId,
        action: "PRESCRIPTION_DRAFT_UPDATED",
        entityType: "prescription",
        entityId: prescriptionId,
        requestId,
        metadata: { changedFields: Object.keys(input) }
      });
      return selectPrescription(transaction, prescriptionId);
    });
  }

  finalize(prescriptionId: string, actorId: string, requestId?: string): Promise<PrescriptionView | undefined> {
    return this.database.transaction(async (transaction) => {
      const [changed] = await transaction.update(prescriptions).set({
        status: "FINAL",
        finalizedAt: new Date(),
        updatedAt: new Date()
      }).where(and(eq(prescriptions.id, prescriptionId), eq(prescriptions.status, "DRAFT")))
        .returning({ id: prescriptions.id });
      if (!changed) return undefined;
      await transaction.insert(auditLogs).values({
        actorId,
        action: "PRESCRIPTION_FINALIZED",
        entityType: "prescription",
        entityId: prescriptionId,
        requestId
      });
      const record = await selectPrescription(transaction, prescriptionId);
      if (!record) throw new Error("Finalized prescription could not be loaded");
      await transaction.insert(outboxEvents).values({
        eventType: "prescription.finalized",
        aggregateType: "prescription",
        aggregateId: prescriptionId,
        payload: {
          prescriptionId,
          consultationId: record.consultationId,
          patientId: record.patientId
        }
      });
      return record;
    });
  }
}

function prescriptionQuery(database: Database | Parameters<Parameters<Database["transaction"]>[0]>[0]) {
  return database.select(selection).from(prescriptions)
    .innerJoin(consultations, eq(consultations.id, prescriptions.consultationId))
    .innerJoin(doctors, eq(doctors.id, prescriptions.doctorId));
}

async function selectPrescription(
  database: Database | Parameters<Parameters<Database["transaction"]>[0]>[0],
  prescriptionId: string
): Promise<PrescriptionView | undefined> {
  const [record] = await prescriptionQuery(database).where(eq(prescriptions.id, prescriptionId)).limit(1);
  return record ? mapPrescription(record) : undefined;
}

function mapPrescription(record: any): PrescriptionView {
  return { ...record, medications: record.medications as Medication[] };
}
