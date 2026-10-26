import { eq } from "drizzle-orm";
import type { Database } from "../database/database.js";
import { consultations, doctors, users } from "../database/schema.js";

export interface NotificationRecipientRepository {
  findEmail(userId: string): Promise<string | undefined>;
  findConsultationRecipients(consultationId: string): Promise<ConsultationRecipients | undefined>;
}

export type ConsultationRecipients = {
  patientEmail: string;
  doctorEmail: string;
};

export class NotificationRepository implements NotificationRecipientRepository {
  constructor(private readonly database: Database) {}

  async findEmail(userId: string): Promise<string | undefined> {
    const [user] = await this.database.select({ email: users.email }).from(users)
      .where(eq(users.id, userId)).limit(1);
    return user?.email;
  }

  async findConsultationRecipients(consultationId: string): Promise<ConsultationRecipients | undefined> {
    const [consultation] = await this.database.select({
      patientId: consultations.patientId,
      doctorUserId: doctors.userId
    }).from(consultations).innerJoin(doctors, eq(doctors.id, consultations.doctorId))
      .where(eq(consultations.id, consultationId)).limit(1);
    if (!consultation) return undefined;
    const [patient, doctor] = await Promise.all([
      this.findEmail(consultation.patientId),
      this.findEmail(consultation.doctorUserId)
    ]);
    if (!patient || !doctor) return undefined;
    return { patientEmail: patient, doctorEmail: doctor };
  }
}
