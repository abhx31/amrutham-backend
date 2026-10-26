import { and, asc, eq, gt, gte, ilike, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import type { Database } from "../../infrastructure/database/database.js";
import {
  auditLogs,
  availabilitySlots,
  doctors,
  profiles,
  users
} from "../../infrastructure/database/schema.js";
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
import type { AvailabilityView, DoctorView } from "./doctor.types.js";

const doctorSelection = {
  id: doctors.id,
  userId: doctors.userId,
  firstName: profiles.firstName,
  lastName: profiles.lastName,
  specialty: doctors.specialty,
  consultationFeeMinor: doctors.consultationFeeMinor,
  bio: doctors.bio,
  verified: doctors.verified,
  createdAt: doctors.createdAt,
  updatedAt: doctors.updatedAt
};

const slotSelection = {
  id: availabilitySlots.id,
  doctorId: availabilitySlots.doctorId,
  startsAt: availabilitySlots.startsAt,
  endsAt: availabilitySlots.endsAt,
  status: availabilitySlots.status,
  version: availabilitySlots.version
};

export class DoctorRepository {
  constructor(private readonly database: Database) {}

  async listVerified(input: ListDoctorsInput): Promise<DoctorView[]> {
    const conditions: SQL[] = [eq(doctors.verified, true), eq(users.status, "ACTIVE")];
    if (input.specialty) conditions.push(ilike(doctors.specialty, input.specialty));
    if (input.search) {
      const pattern = `%${escapeLike(input.search)}%`;
      conditions.push(or(
        ilike(profiles.firstName, pattern),
        ilike(profiles.lastName, pattern),
        ilike(doctors.specialty, pattern)
      )!);
    }
    return this.database.select(doctorSelection).from(doctors)
      .innerJoin(users, eq(users.id, doctors.userId))
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(and(...conditions)).orderBy(asc(profiles.firstName), asc(profiles.lastName))
      .limit(input.limit).offset(input.offset);
  }

  async findById(doctorId: string, verifiedOnly = false): Promise<DoctorView | undefined> {
    const conditions = [eq(doctors.id, doctorId)];
    if (verifiedOnly) conditions.push(eq(doctors.verified, true), eq(users.status, "ACTIVE"));
    const [record] = await this.database.select(doctorSelection).from(doctors)
      .innerJoin(users, eq(users.id, doctors.userId))
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(and(...conditions)).limit(1);
    return record;
  }

  async findByUserId(userId: string): Promise<DoctorView | undefined> {
    const [record] = await this.database.select(doctorSelection).from(doctors)
      .innerJoin(users, eq(users.id, doctors.userId))
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(doctors.userId, userId)).limit(1);
    return record;
  }

  listPending(input: ListPendingDoctorsInput): Promise<DoctorView[]> {
    return this.database.select(doctorSelection).from(doctors)
      .innerJoin(users, eq(users.id, doctors.userId))
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(doctors.verified, false))
      .orderBy(asc(doctors.createdAt))
      .limit(input.limit).offset(input.offset);
  }

  create(input: CreateDoctorInput, actorId: string, requestId?: string): Promise<DoctorView | undefined> {
    return this.database.transaction(async (transaction) => {
      const usersUpdated = await transaction.update(users).set({ role: "DOCTOR", updatedAt: new Date() })
        .where(and(eq(users.id, input.userId), eq(users.status, "ACTIVE")))
        .returning({ id: users.id });
      if (usersUpdated.length === 0) return undefined;

      const [doctor] = await transaction.insert(doctors).values({
        userId: input.userId,
        licenseNumber: input.licenseNumber,
        specialty: input.specialty,
        consultationFeeMinor: input.consultationFeeMinor,
        bio: input.bio
      }).returning({ id: doctors.id });
      if (!doctor) return undefined;
      await transaction.insert(auditLogs).values({
        actorId,
        action: "DOCTOR_CREATED",
        entityType: "doctor",
        entityId: doctor.id,
        requestId,
        metadata: { userId: input.userId }
      });
      const [record] = await transaction.select(doctorSelection).from(doctors)
        .innerJoin(users, eq(users.id, doctors.userId))
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .where(eq(doctors.id, doctor.id)).limit(1);
      return record;
    });
  }

  updateOwn(userId: string, input: UpdateDoctorInput, requestId?: string): Promise<DoctorView | undefined> {
    return this.database.transaction(async (transaction) => {
      const update: { specialty?: string; consultationFeeMinor?: number; bio?: string | null; updatedAt: Date } = { updatedAt: new Date() };
      if (input.specialty !== undefined) update.specialty = input.specialty;
      if (input.consultationFeeMinor !== undefined) update.consultationFeeMinor = input.consultationFeeMinor;
      if (input.bio !== undefined) update.bio = input.bio;
      const [changed] = await transaction.update(doctors).set(update).where(eq(doctors.userId, userId))
        .returning({ id: doctors.id });
      if (!changed) return undefined;
      await transaction.insert(auditLogs).values({
        actorId: userId,
        action: "DOCTOR_PROFILE_UPDATED",
        entityType: "doctor",
        entityId: changed.id,
        requestId,
        metadata: { changedFields: Object.keys(input) }
      });
      const [record] = await transaction.select(doctorSelection).from(doctors)
        .innerJoin(users, eq(users.id, doctors.userId))
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .where(eq(doctors.id, changed.id)).limit(1);
      return record;
    });
  }

  verify(doctorId: string, input: VerifyDoctorInput, actorId: string, requestId?: string): Promise<DoctorView | undefined> {
    return this.database.transaction(async (transaction) => {
      const [changed] = await transaction.update(doctors).set({ verified: input.verified, updatedAt: new Date() })
        .where(eq(doctors.id, doctorId)).returning({ id: doctors.id });
      if (!changed) return undefined;
      await transaction.insert(auditLogs).values({
        actorId,
        action: input.verified ? "DOCTOR_VERIFIED" : "DOCTOR_VERIFICATION_REVOKED",
        entityType: "doctor",
        entityId: doctorId,
        requestId,
        metadata: { reason: input.reason }
      });
      const [record] = await transaction.select(doctorSelection).from(doctors)
        .innerJoin(users, eq(users.id, doctors.userId))
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .where(eq(doctors.id, doctorId)).limit(1);
      return record;
    });
  }

  async listAvailability(doctorId: string, input: ListAvailabilityInput): Promise<AvailabilityView[]> {
    const conditions: SQL[] = [
      eq(availabilitySlots.doctorId, doctorId),
      eq(availabilitySlots.status, "AVAILABLE"),
      gte(availabilitySlots.startsAt, input.from ?? new Date())
    ];
    if (input.to) conditions.push(lte(availabilitySlots.endsAt, input.to));
    return this.database.select(slotSelection).from(availabilitySlots)
      .where(and(...conditions)).orderBy(asc(availabilitySlots.startsAt)).limit(input.limit);
  }

  async listOwnAvailability(doctorId: string, input: ListOwnAvailabilityInput): Promise<AvailabilityView[]> {
    const conditions: SQL[] = [
      eq(availabilitySlots.doctorId, doctorId),
      gte(availabilitySlots.startsAt, input.from ?? new Date())
    ];
    if (input.to) conditions.push(lte(availabilitySlots.endsAt, input.to));
    if (input.status) conditions.push(eq(availabilitySlots.status, input.status));
    return this.database.select(slotSelection).from(availabilitySlots)
      .where(and(...conditions)).orderBy(asc(availabilitySlots.startsAt)).limit(input.limit);
  }

  createAvailability(
    doctorId: string,
    input: AvailabilityInput,
    actorId: string,
    requestId?: string
  ): Promise<AvailabilityView | undefined> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${doctorId}))`);
      const overlap = await transaction.select({ id: availabilitySlots.id }).from(availabilitySlots)
        .where(and(
          eq(availabilitySlots.doctorId, doctorId),
          ne(availabilitySlots.status, "BLOCKED"),
          lt(availabilitySlots.startsAt, input.endsAt),
          gt(availabilitySlots.endsAt, input.startsAt)
        )).limit(1);
      if (overlap.length > 0) return undefined;
      const [record] = await transaction.insert(availabilitySlots).values({ doctorId, ...input })
        .returning(slotSelection);
      if (!record) throw new Error("Availability insert returned no record");
      await transaction.insert(auditLogs).values({
        actorId,
        action: "AVAILABILITY_CREATED",
        entityType: "availability_slot",
        entityId: record.id,
        requestId,
        metadata: { doctorId }
      });
      return record;
    });
  }

  async updateAvailability(
    doctorId: string,
    slotId: string,
    input: AvailabilityInput,
    actorId: string,
    requestId?: string
  ): Promise<AvailabilityView | undefined> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${doctorId}))`);
      const overlap = await transaction.select({ id: availabilitySlots.id }).from(availabilitySlots)
        .where(and(
          eq(availabilitySlots.doctorId, doctorId),
          ne(availabilitySlots.id, slotId),
          ne(availabilitySlots.status, "BLOCKED"),
          lt(availabilitySlots.startsAt, input.endsAt),
          gt(availabilitySlots.endsAt, input.startsAt)
        )).limit(1);
      if (overlap.length > 0) return undefined;
      const [record] = await transaction.update(availabilitySlots).set({
        ...input,
        version: sql`${availabilitySlots.version} + 1`,
        updatedAt: new Date()
      }).where(and(
        eq(availabilitySlots.id, slotId),
        eq(availabilitySlots.doctorId, doctorId),
        eq(availabilitySlots.status, "AVAILABLE")
      )).returning(slotSelection);
      if (!record) return undefined;
      await transaction.insert(auditLogs).values({
        actorId,
        action: "AVAILABILITY_UPDATED",
        entityType: "availability_slot",
        entityId: record.id,
        requestId,
        metadata: { doctorId }
      });
      return record;
    });
  }

  blockAvailability(
    doctorId: string,
    slotId: string,
    actorId: string,
    requestId?: string
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const changed = await transaction.update(availabilitySlots).set({
        status: "BLOCKED",
        version: sql`${availabilitySlots.version} + 1`,
        updatedAt: new Date()
      }).where(and(
        eq(availabilitySlots.id, slotId),
        eq(availabilitySlots.doctorId, doctorId),
        eq(availabilitySlots.status, "AVAILABLE")
      )).returning({ id: availabilitySlots.id });
      if (changed.length === 0) return false;
      await transaction.insert(auditLogs).values({
        actorId,
        action: "AVAILABILITY_BLOCKED",
        entityType: "availability_slot",
        entityId: slotId,
        requestId,
        metadata: { doctorId }
      });
      return true;
    });
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}
