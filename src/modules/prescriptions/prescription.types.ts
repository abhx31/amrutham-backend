export type Medication = {
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  instructions?: string;
};

export type PrescriptionView = {
  id: string;
  consultationId: string;
  doctorId: string;
  doctorUserId: string;
  patientId: string;
  version: number;
  status: "DRAFT" | "FINAL";
  medications: Medication[];
  notes: string | null;
  finalizedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
