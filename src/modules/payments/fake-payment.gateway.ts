import type { PaymentGateway, CheckoutDetails } from "./payment.gateway.js";
import type { PaymentView } from "./payment.types.js";

export class FakePaymentGateway implements PaymentGateway {
  async createCheckout(payment: PaymentView): Promise<CheckoutDetails> {
    return {
      provider: "fake",
      orderId: payment.providerReference ?? payment.id,
      checkoutUrl: `/api/v1/dev/payments/${payment.id}`,
      testMode: true
    };
  }
}
