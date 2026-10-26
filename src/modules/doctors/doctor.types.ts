export type DoctorView = {
  id: string;
  userId: string;
  firstName: string;
  lastName: string;
  specialty: string;
  consultationFeeMinor: number;
  bio: string | null;
  verified: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type AvailabilityView = {
  id: string;
  doctorId: string;
  startsAt: Date;
  endsAt: Date;
  status: "AVAILABLE" | "BOOKED" | "BLOCKED";
  version: number;
};
