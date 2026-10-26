import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { Database } from "../../infrastructure/database/database.js";
import {
  availabilitySlots,
  consultations,
  doctors,
  payments,
  profiles,
  users
} from "../../infrastructure/database/schema.js";
import type { AnalyticsRange } from "./analytics.schemas.js";
import type {
  ConsultationTrend,
  DoctorUtilization,
  OverviewAnalytics,
  PaymentTrend
} from "./analytics.types.js";

export class AnalyticsRepository {
  constructor(private readonly database: Database) {}

  async overview(range: AnalyticsRange): Promise<OverviewAnalytics> {
    const [[userTotals], [consultationTotals], [paymentTotals]] = await Promise.all([
      this.database.select({
        total: sql<number>`count(*)`,
        active: sql<number>`count(*) filter (where ${users.status} = 'ACTIVE')`,
        patients: sql<number>`count(*) filter (where ${users.role} = 'PATIENT')`,
        doctors: sql<number>`count(*) filter (where ${users.role} = 'DOCTOR')`
      }).from(users),
      this.database.select({
        total: sql<number>`count(*)`,
        completed: sql<number>`count(*) filter (where ${consultations.status} = 'COMPLETED')`,
        cancelled: sql<number>`count(*) filter (where ${consultations.status} = 'CANCELLED')`
      }).from(consultations).where(and(
        gte(consultations.createdAt, range.from),
        lt(consultations.createdAt, range.to)
      )),
      this.database.select({
        succeededCount: sql<number>`count(*) filter (where ${payments.status} = 'SUCCEEDED')`,
        grossMinor: sql<number>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} in ('SUCCEEDED', 'REFUNDED')), 0)`,
        refundedMinor: sql<number>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} = 'REFUNDED'), 0)`
      }).from(payments).where(and(
        gte(payments.createdAt, range.from),
        lt(payments.createdAt, range.to)
      ))
    ]);

    const totalConsultations = Number(consultationTotals?.total ?? 0);
    const completed = Number(consultationTotals?.completed ?? 0);
    const grossMinor = Number(paymentTotals?.grossMinor ?? 0);
    const refundedMinor = Number(paymentTotals?.refundedMinor ?? 0);
    return {
      range: { from: range.from, to: range.to },
      users: {
        total: Number(userTotals?.total ?? 0),
        active: Number(userTotals?.active ?? 0),
        patients: Number(userTotals?.patients ?? 0),
        doctors: Number(userTotals?.doctors ?? 0)
      },
      consultations: {
        total: totalConsultations,
        completed,
        cancelled: Number(consultationTotals?.cancelled ?? 0),
        completionRate: totalConsultations === 0 ? 0 : roundRate(completed / totalConsultations)
      },
      payments: {
        succeededCount: Number(paymentTotals?.succeededCount ?? 0),
        grossMinor,
        refundedMinor,
        netMinor: grossMinor - refundedMinor,
        currency: "INR"
      }
    };
  }

  async consultationTrends(range: AnalyticsRange): Promise<ConsultationTrend[]> {
    const day = sql<string>`to_char(date_trunc('day', ${consultations.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
    const records = await this.database.select({
      date: day,
      total: sql<number>`count(*)`,
      completed: sql<number>`count(*) filter (where ${consultations.status} = 'COMPLETED')`,
      cancelled: sql<number>`count(*) filter (where ${consultations.status} = 'CANCELLED')`,
      noShow: sql<number>`count(*) filter (where ${consultations.status} = 'NO_SHOW')`
    }).from(consultations).where(and(
      gte(consultations.createdAt, range.from),
      lt(consultations.createdAt, range.to)
    )).groupBy(day).orderBy(day);
    return records.map((record) => ({
      date: record.date,
      total: Number(record.total),
      completed: Number(record.completed),
      cancelled: Number(record.cancelled),
      noShow: Number(record.noShow)
    }));
  }

  async doctorUtilization(range: AnalyticsRange): Promise<DoctorUtilization[]> {
    const records = await this.database.select({
      doctorId: doctors.id,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      specialty: doctors.specialty,
      consultations: sql<number>`count(distinct ${consultations.id})`,
      completed: sql<number>`count(distinct ${consultations.id}) filter (where ${consultations.status} = 'COMPLETED')`,
      cancelled: sql<number>`count(distinct ${consultations.id}) filter (where ${consultations.status} = 'CANCELLED')`,
      availableSlots: sql<number>`count(distinct ${availabilitySlots.id}) filter (where ${availabilitySlots.status} = 'AVAILABLE')`
    }).from(doctors)
      .innerJoin(profiles, eq(profiles.userId, doctors.userId))
      .leftJoin(consultations, and(
        eq(consultations.doctorId, doctors.id),
        gte(consultations.createdAt, range.from),
        lt(consultations.createdAt, range.to)
      ))
      .leftJoin(availabilitySlots, and(
        eq(availabilitySlots.doctorId, doctors.id),
        gte(availabilitySlots.startsAt, range.from),
        lt(availabilitySlots.startsAt, range.to)
      ))
      .groupBy(doctors.id, profiles.firstName, profiles.lastName)
      .orderBy(sql`count(distinct ${consultations.id}) desc`)
      .limit(range.limit);

    return records.map((record) => {
      const consultationCount = Number(record.consultations);
      const availableSlots = Number(record.availableSlots);
      const totalCapacity = consultationCount + availableSlots;
      return {
        doctorId: record.doctorId,
        doctorName: `${record.firstName} ${record.lastName}`,
        specialty: record.specialty,
        consultations: consultationCount,
        completed: Number(record.completed),
        cancelled: Number(record.cancelled),
        availableSlots,
        utilizationRate: totalCapacity === 0 ? 0 : roundRate(consultationCount / totalCapacity)
      };
    });
  }

  async paymentTrends(range: AnalyticsRange): Promise<PaymentTrend[]> {
    const day = sql<string>`to_char(date_trunc('day', ${payments.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`;
    const records = await this.database.select({
      date: day,
      succeededCount: sql<number>`count(*) filter (where ${payments.status} = 'SUCCEEDED')`,
      failedCount: sql<number>`count(*) filter (where ${payments.status} = 'FAILED')`,
      refundedCount: sql<number>`count(*) filter (where ${payments.status} = 'REFUNDED')`,
      grossMinor: sql<number>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} in ('SUCCEEDED', 'REFUNDED')), 0)`,
      refundedMinor: sql<number>`coalesce(sum(${payments.amountMinor}) filter (where ${payments.status} = 'REFUNDED'), 0)`
    }).from(payments).where(and(
      gte(payments.createdAt, range.from),
      lt(payments.createdAt, range.to)
    )).groupBy(day).orderBy(day);
    return records.map((record) => ({
      date: record.date,
      succeededCount: Number(record.succeededCount),
      failedCount: Number(record.failedCount),
      refundedCount: Number(record.refundedCount),
      grossMinor: Number(record.grossMinor),
      refundedMinor: Number(record.refundedMinor)
    }));
  }
}

function roundRate(value: number): number {
  return Math.round(value * 10_000) / 100;
}
