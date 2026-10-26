import { Router } from "express";
import { authenticate, authorizeRoles } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/token.service.js";
import type { ConsultationController } from "./consultation.controller.js";

export function createConsultationRouter(dependencies: {
  consultationController: ConsultationController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  router.use(authenticate(dependencies.tokenService));
  router.post("/", authorizeRoles("PATIENT"), dependencies.consultationController.book);
  router.get("/", dependencies.consultationController.list);
  router.get("/:consultationId", dependencies.consultationController.get);
  router.patch(
    "/:consultationId/status",
    authorizeRoles("DOCTOR", "ADMIN"),
    dependencies.consultationController.transition
  );
  router.post(
    "/:consultationId/cancel",
    authorizeRoles("PATIENT"),
    dependencies.consultationController.cancel
  );
  return router;
}
