import { sql } from "drizzle-orm";
import { createDatabase } from "../../src/infrastructure/database/database.js";
import {
  availabilitySlots,
  doctors,
  profiles,
  users
} from "../../src/infrastructure/database/schema.js";
import type { AppConfig } from "../../src/config/env.js";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://amrutam:amrutam@localhost:5433/amrutam_test";

const config = {
  DATABASE_URL: databaseUrl
} as AppConfig;

export const integrationDatabase = createDatabase({ config });

export async function resetIntegrationDatabase(): Promise<void> {
  await integrationDatabase.execute(sql`TRUNCATE TABLE users, outbox_events RESTART IDENTITY CASCADE`);
}

export async function seedBookingScenario() {
  const [doctorUser, firstPatient, secondPatient] = await integrationDatabase.insert(users).values([
    { email: "doctor@example.test", passwordHash: "test-hash", role: "DOCTOR", status: "ACTIVE" },
    { email: "patient-one@example.test", passwordHash: "test-hash", role: "PATIENT", status: "ACTIVE" },
    { email: "patient-two@example.test", passwordHash: "test-hash", role: "PATIENT", status: "ACTIVE" }
  ]).returning({ id: users.id, role: users.role });
  if (!doctorUser || !firstPatient || !secondPatient) throw new Error("Failed to seed users");

  await integrationDatabase.insert(profiles).values({
    userId: doctorUser.id,
    firstName: "Integration",
    lastName: "Doctor"
  });
  const [doctor] = await integrationDatabase.insert(doctors).values({
    userId: doctorUser.id,
    licenseNumber: "INT-TEST-001",
    specialty: "General Medicine",
    consultationFeeMinor: 50000,
    verified: true
  }).returning({ id: doctors.id });
  if (!doctor) throw new Error("Failed to seed doctor");
  const [slot] = await integrationDatabase.insert(availabilitySlots).values({
    doctorId: doctor.id,
    startsAt: new Date("2099-01-01T10:00:00.000Z"),
    endsAt: new Date("2099-01-01T10:30:00.000Z")
  }).returning({ id: availabilitySlots.id });
  if (!slot) throw new Error("Failed to seed availability");

  return {
    doctorUserId: doctorUser.id,
    doctorId: doctor.id,
    firstPatientId: firstPatient.id,
    secondPatientId: secondPatient.id,
    slotId: slot.id
  };
}
