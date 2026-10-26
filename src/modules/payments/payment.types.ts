export type PaymentStatus = "PENDING" | "SUCCEEDED" | "FAILED" | "REFUNDED";

export type PaymentView = {
  id: string;
  consultationId: string;
  initiatedBy: string;
  providerReference: string | null;
  amountMinor: number;
  currency: string;
  status: PaymentStatus;
  completedAt: Date | null;
  refundedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
