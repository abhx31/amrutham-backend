import { and, desc, eq, gt, inArray, sql, type SQL } from "drizzle-orm";
import { AppError } from "../../common/errors/app-error.js";
import type { Database } from "../../infrastructure/database/database.js";
import {
  auditLogs,
  availabilitySlots,
  consultations,
  doctors,
  idempotencyKeys,
  outboxEvents,
  profiles,
  users
} from "../../infrastructure/database/schema.js";
import type { UserRole } from "../auth/auth.types.js";
import type { CreateConsultationInput, ListConsultationsInput } from "./consultation.schemas.js";
import type { ConsultationStatus, ConsultationView } from "./consultation.types.js";

const consultationSelection = {
  id: consultations.id,
  slotId: consultations.slotId,
  doctorId: consultations.doctorId,
  doctorUserId: doctors.userId,
  doctorFirstName: profiles.firstName,
  doctorLastName: profiles.lastName,
  patientId: consultations.patientId,
  status: consultations.status,
  reason: consultations.reason,
  cancellationReason: consultations.cancellationReason,
  startsAt: availabilitySlots.startsAt,
  endsAt: availabilitySlots.endsAt,
  version: consultations.version,
  createdAt: consultations.createdAt,
  updatedAt: consultations.updatedAt
};

export class ConsultationRepository {
  constructor(private readonly database: Database) {}

  book(input: {
    patientId: string;
    idempotencyKey: string;
    requestHash: string;
    body: CreateConsultationInput;
    requestId?: string | undefined;
  }): Promise<{ consultation: ConsultationView; replayed: boolean }> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.patientId}:${input.idempotencyKey}`}))`);
      const [existing] = await transaction.select({
        requestHash: idempotencyKeys.requestHash,
        responseBody: idempotencyKeys.responseBody
      }).from(idempotencyKeys).where(and(
        eq(idempotencyKeys.userId, input.patientId),
        eq(idempotencyKeys.key, input.idempotencyKey)
      )).limit(1);

      if (existing) {
        if (existing.requestHash !== input.requestHash) {
          throw new AppError("Idempotency key was used for a different request", 409, "IDEMPOTENCY_KEY_REUSED");
        }
        const consultationId = readConsultationId(existing.responseBody);
        const replay = await selectConsultation(transaction, consultationId);
        if (!replay) throw new AppError("Stored idempotent response is unavailable", 409, "IDEMPOTENCY_RESPONSE_UNAVAILABLE");
        return { consultation: replay, replayed: true };
      }

      const [eligible] = await transaction.select({ doctorId: availabilitySlots.doctorId })
        .from(availabilitySlots)
        .innerJoin(doctors, eq(doctors.id, availabilitySlots.doctorId))
        .innerJoin(users, eq(users.id, doctors.userId))
        .where(and(
          eq(availabilitySlots.id, input.body.slotId),
          eq(availabilitySlots.status, "AVAILABLE"),
          gt(availabilitySlots.startsAt, new Date()),
          eq(doctors.verified, true),
          eq(users.status, "ACTIVE")
        ))
        .limit(1)
        .for("share", { of: [doctors, users] });
      if (!eligible) throw new AppError("This slot is unavailable", 409, "SLOT_UNAVAILABLE");

      const [claimed] = await transaction.update(availabilitySlots).set({
        status: "BOOKED",
        version: sql`${availabilitySlots.version} + 1`,
        updatedAt: new Date()
      }).where(and(
        eq(availabilitySlots.id, input.body.slotId),
        eq(availabilitySlots.status, "AVAILABLE"),
        gt(availabilitySlots.startsAt, new Date()),
        eq(availabilitySlots.doctorId, eligible.doctorId)
      )).returning({ doctorId: availabilitySlots.doctorId });
      if (!claimed) throw new AppError("This slot is unavailable", 409, "SLOT_UNAVAILABLE");

      const [created] = await transaction.insert(consultations).values({
        slotId: input.body.slotId,
        doctorId: claimed.doctorId,
        patientId: input.patientId,
        reason: input.body.reason
      }).returning({ id: consultations.id });
      if (!created) throw new Error("Consultation insert returned no record");

      await transaction.insert(idempotencyKeys).values({
        key: input.idempotencyKey,
        userId: input.patientId,
        requestHash: input.requestHash,
        responseStatus: 201,
        responseBody: { consultationId: created.id },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000)
      });
      await transaction.insert(auditLogs).values({
        actorId: input.patientId,
        action: "CONSULTATION_BOOKED",
        entityType: "consultation",
        entityId: created.id,
        requestId: input.requestId
      });
      await transaction.insert(outboxEvents).values({
        eventType: "consultation.booked",
        aggregateType: "consultation",
        aggregateId: created.id,
        payload: { consultationId: created.id, patientId: input.patientId, doctorId: claimed.doctorId }
      });

      const consultation = await selectConsultation(transaction, created.id);
      if (!consultation) throw new Error("Created consultation could not be loaded");
      return { consultation, replayed: false };
    });
  }

  findById(consultationId: string): Promise<ConsultationView | undefined> {
    return selectConsultation(this.database, consultationId);
  }

  async listForActor(
    userId: string,
    role: UserRole,
    input: ListConsultationsInput
  ): Promise<ConsultationView[]> {
    const conditions: SQL[] = [];
    if (role === "PATIENT") conditions.push(eq(consultations.patientId, userId));
    if (role === "DOCTOR") conditions.push(eq(doctors.userId, userId));
    if (input.status) conditions.push(eq(consultations.status, input.status));
    const records = await consultationQuery(this.database)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(availabilitySlots.startsAt))
      .limit(input.limit).offset(input.offset);
    return records.map(mapConsultation);
  }

  transition(input: {
    consultationId: string;
    from: ConsultationStatus[];
    to: ConsultationStatus;
    version: number;
    actorId: string;
    requestId?: string | undefined;
    releaseSlot: boolean;
    cancellationReason?: string | undefined;
  }): Promise<ConsultationView | undefined> {
    return this.database.transaction(async (transaction) => {
      const [changed] = await transaction.update(consultations).set({
        status: input.to,
        ...(input.cancellationReason === undefined ? {} : { cancellationReason: input.cancellationReason }),
        version: sql`${consultations.version} + 1`,
        updatedAt: new Date()
      }).where(and(
        eq(consultations.id, input.consultationId),
        eq(consultations.version, input.version),
        inArray(consultations.status, input.from)
      )).returning({ id: consultations.id, slotId: consultations.slotId });
      if (!changed) return undefined;
      if (input.releaseSlot) {
        await transaction.update(availabilitySlots).set({
          status: "AVAILABLE",
          version: sql`${availabilitySlots.version} + 1`,
          updatedAt: new Date()
        }).where(and(eq(availabilitySlots.id, changed.slotId), gt(availabilitySlots.startsAt, new Date())));
      }
      await transaction.insert(auditLogs).values({
        actorId: input.actorId,
        action: "CONSULTATION_STATUS_CHANGED",
        entityType: "consultation",
        entityId: input.consultationId,
        requestId: input.requestId,
        metadata: { status: input.to }
      });
      await transaction.insert(outboxEvents).values({
        eventType: "consultation.status_changed",
        aggregateType: "consultation",
        aggregateId: input.consultationId,
        payload: { consultationId: input.consultationId, status: input.to }
      });
      return selectConsultation(transaction, input.consultationId);
    });
  }
}

function consultationQuery(database: Database | Parameters<Parameters<Database["transaction"]>[0]>[0]) {
  return database.select(consultationSelection).from(consultations)
    .innerJoin(availabilitySlots, eq(availabilitySlots.id, consultations.slotId))
    .innerJoin(doctors, eq(doctors.id, consultations.doctorId))
    .innerJoin(profiles, eq(profiles.userId, doctors.userId));
}

async function selectConsultation(
  database: Database | Parameters<Parameters<Database["transaction"]>[0]>[0],
  consultationId: string
): Promise<ConsultationView | undefined> {
  const [record] = await consultationQuery(database).where(eq(consultations.id, consultationId)).limit(1);
  return record ? mapConsultation(record) : undefined;
}

function mapConsultation(record: typeof consultationSelection extends never ? never : any): ConsultationView {
  return {
    id: record.id,
    slotId: record.slotId,
    doctorId: record.doctorId,
    doctorUserId: record.doctorUserId,
    doctorName: `${record.doctorFirstName} ${record.doctorLastName}`,
    patientId: record.patientId,
    status: record.status,
    reason: record.reason,
    cancellationReason: record.cancellationReason,
    startsAt: record.startsAt,
    endsAt: record.endsAt,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt
  };
}

function readConsultationId(value: unknown): string {
  if (typeof value !== "object" || value === null || !("consultationId" in value) || typeof value.consultationId !== "string") {
    throw new AppError("Stored idempotent response is invalid", 409, "IDEMPOTENCY_RESPONSE_UNAVAILABLE");
  }
  return value.consultationId;
}
