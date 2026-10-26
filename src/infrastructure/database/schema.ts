import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
};

export const userRole = pgEnum("user_role", ["PATIENT", "DOCTOR", "ADMIN"]);
export const userStatus = pgEnum("user_status", ["PENDING", "ACTIVE", "SUSPENDED"]);
export const slotStatus = pgEnum("slot_status", ["AVAILABLE", "BOOKED", "BLOCKED"]);
export const consultationStatus = pgEnum("consultation_status", [
  "BOOKED", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"
]);
export const prescriptionStatus = pgEnum("prescription_status", ["DRAFT", "FINAL"]);
export const paymentStatus = pgEnum("payment_status", ["PENDING", "SUCCEEDED", "FAILED", "REFUNDED"]);
export const accountTokenType = pgEnum("account_token_type", ["PASSWORD_RESET", "EMAIL_VERIFICATION"]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull(),
  status: userStatus("status").notNull().default("PENDING"),
  mfaEnabled: boolean("mfa_enabled").notNull().default(false),
  emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
  ...timestamps
}, (table) => [uniqueIndex("users_email_unique").on(table.email)]);

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  phone: text("phone"),
  dateOfBirth: date("date_of_birth"),
  gender: text("gender"),
  address: jsonb("address"),
  emergencyContact: jsonb("emergency_contact"),
  ...timestamps
}, (table) => [uniqueIndex("profiles_user_unique").on(table.userId)]);

export const refreshTokens = pgTable("refresh_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  familyId: uuid("family_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  replacedByTokenId: uuid("replaced_by_token_id"),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("refresh_tokens_hash_unique").on(table.tokenHash),
  index("refresh_tokens_user_idx").on(table.userId),
  index("refresh_tokens_family_idx").on(table.familyId)
]);

export const mfaCredentials = pgTable("mfa_credentials", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  encryptedSecret: text("encrypted_secret").notNull(),
  recoveryCodeHashes: jsonb("recovery_code_hashes").notNull().default([]),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  lastUsedStep: integer("last_used_step"),
  ...timestamps
}, (table) => [uniqueIndex("mfa_credentials_user_unique").on(table.userId)]);

export const accountTokens = pgTable("account_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  type: accountTokenType("type").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  uniqueIndex("account_tokens_hash_unique").on(table.tokenHash),
  index("account_tokens_user_type_idx").on(table.userId, table.type)
]);

export const doctors = pgTable("doctors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  licenseNumber: text("license_number").notNull(),
  specialty: text("specialty").notNull(),
  bio: text("bio"),
  consultationFeeMinor: integer("consultation_fee_minor").notNull().default(0),
  verified: boolean("verified").notNull().default(false),
  ...timestamps
}, (table) => [
  uniqueIndex("doctors_user_unique").on(table.userId),
  uniqueIndex("doctors_license_unique").on(table.licenseNumber),
  index("doctors_specialty_idx").on(table.specialty)
]);

export const availabilitySlots = pgTable("availability_slots", {
  id: uuid("id").primaryKey().defaultRandom(),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "cascade" }),
  startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
  endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
  status: slotStatus("status").notNull().default("AVAILABLE"),
  version: integer("version").notNull().default(1),
  ...timestamps
}, (table) => [
  uniqueIndex("doctor_slot_start_unique").on(table.doctorId, table.startsAt),
  index("available_slots_search_idx").on(table.doctorId, table.status, table.startsAt)
]);

export const consultations = pgTable("consultations", {
  id: uuid("id").primaryKey().defaultRandom(),
  slotId: uuid("slot_id").notNull().references(() => availabilitySlots.id, { onDelete: "restrict" }),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "restrict" }),
  patientId: uuid("patient_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  status: consultationStatus("status").notNull().default("BOOKED"),
  reason: text("reason"),
  cancellationReason: text("cancellation_reason"),
  version: integer("version").notNull().default(1),
  ...timestamps
}, (table) => [
  uniqueIndex("consultations_active_slot_unique").on(table.slotId)
    .where(sql`${table.status} <> 'CANCELLED'`),
  index("patient_consultations_idx").on(table.patientId, table.createdAt),
  index("doctor_consultations_idx").on(table.doctorId, table.createdAt)
]);

export const prescriptions = pgTable("prescriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  consultationId: uuid("consultation_id").notNull().references(() => consultations.id, { onDelete: "restrict" }),
  doctorId: uuid("doctor_id").notNull().references(() => doctors.id, { onDelete: "restrict" }),
  version: integer("version").notNull().default(1),
  status: prescriptionStatus("status").notNull().default("DRAFT"),
  medications: jsonb("medications").notNull(),
  notes: text("notes"),
  finalizedAt: timestamp("finalized_at", { withTimezone: true }),
  ...timestamps
}, (table) => [uniqueIndex("prescription_version_unique").on(table.consultationId, table.version)]);

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  consultationId: uuid("consultation_id").notNull().references(() => consultations.id, { onDelete: "restrict" }),
  initiatedBy: uuid("initiated_by").notNull().references(() => users.id, { onDelete: "restrict" }),
  providerReference: text("provider_reference"),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull().default("INR"),
  status: paymentStatus("status").notNull().default("PENDING"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  refundedAt: timestamp("refunded_at", { withTimezone: true }),
  ...timestamps
}, (table) => [
  index("payment_consultation_idx").on(table.consultationId),
  uniqueIndex("payment_active_consultation_unique").on(table.consultationId)
    .where(sql`${table.status} in ('PENDING', 'SUCCEEDED')`),
  uniqueIndex("payment_provider_reference_unique").on(table.providerReference)
]);

export const paymentWebhookEvents = pgTable("payment_webhook_events", {
  id: text("id").primaryKey(),
  payloadHash: text("payload_hash").notNull(),
  paymentId: uuid("payment_id").notNull().references(() => payments.id, { onDelete: "restrict" }),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow()
});

export const auditLogs = pgTable("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorId: uuid("actor_id").references(() => users.id, { onDelete: "set null" }),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  requestId: text("request_id"),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [
  index("audit_entity_idx").on(table.entityType, table.entityId),
  index("audit_created_at_idx").on(table.createdAt)
]);

export const idempotencyKeys = pgTable("idempotency_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestHash: text("request_hash").notNull(),
  responseStatus: integer("response_status"),
  responseBody: jsonb("response_body"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [uniqueIndex("idempotency_user_key_unique").on(table.userId, table.key)]);

export const outboxEvents = pgTable("outbox_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventType: text("event_type").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  payload: jsonb("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (table) => [index("outbox_pending_idx").on(table.processedAt, table.createdAt)]);
