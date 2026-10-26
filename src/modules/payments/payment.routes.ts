import { Router } from "express";
import { authenticate, authorizeRoles } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/token.service.js";
import type { PaymentController } from "./payment.controller.js";

export function createPaymentRouter(dependencies: {
  paymentController: PaymentController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  router.post("/payments/webhooks/provider", dependencies.paymentController.webhook);
  router.post(
    "/dev/payments/:paymentId",
    authenticate(dependencies.tokenService),
    authorizeRoles("ADMIN"),
    dependencies.paymentController.simulate
  );
  router.post(
    "/consultations/:consultationId/payments",
    authenticate(dependencies.tokenService),
    authorizeRoles("PATIENT"),
    dependencies.paymentController.create
  );
  router.get(
    "/consultations/:consultationId/payments",
    authenticate(dependencies.tokenService),
    dependencies.paymentController.list
  );
  router.get(
    "/payments/:paymentId",
    authenticate(dependencies.tokenService),
    dependencies.paymentController.get
  );
  return router;
}
