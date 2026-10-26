export type OverviewAnalytics = {
  range: { from: Date; to: Date };
  users: { total: number; active: number; patients: number; doctors: number };
  consultations: { total: number; completed: number; cancelled: number; completionRate: number };
  payments: { succeededCount: number; grossMinor: number; refundedMinor: number; netMinor: number; currency: "INR" };
};

export type ConsultationTrend = {
  date: string;
  total: number;
  completed: number;
  cancelled: number;
  noShow: number;
};

export type DoctorUtilization = {
  doctorId: string;
  doctorName: string;
  specialty: string;
  consultations: number;
  completed: number;
  cancelled: number;
  availableSlots: number;
  utilizationRate: number;
};

export type PaymentTrend = {
  date: string;
  succeededCount: number;
  failedCount: number;
  refundedCount: number;
  grossMinor: number;
  refundedMinor: number;
};
