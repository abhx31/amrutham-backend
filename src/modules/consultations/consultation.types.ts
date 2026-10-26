export type ConsultationStatus = "BOOKED" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW";

export type ConsultationView = {
  id: string;
  slotId: string;
  doctorId: string;
  doctorUserId: string;
  doctorName: string;
  patientId: string;
  status: ConsultationStatus;
  reason: string | null;
  cancellationReason: string | null;
  startsAt: Date;
  endsAt: Date;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};
