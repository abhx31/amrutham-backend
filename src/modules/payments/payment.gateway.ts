import type { PaymentView } from "./payment.types.js";

export type CheckoutDetails = {
  provider: string;
  orderId: string;
  checkoutUrl: string;
  testMode: boolean;
};

export interface PaymentGateway {
  createCheckout(payment: PaymentView): Promise<CheckoutDetails>;
}
