import { Router } from "express";
import { authenticate, authorizeRoles } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/token.service.js";
import type { PrescriptionController } from "./prescription.controller.js";

export function createPrescriptionRouter(dependencies: {
  prescriptionController: PrescriptionController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  const requireAuth = authenticate(dependencies.tokenService);
  router.get("/consultations/:consultationId/prescriptions", requireAuth, dependencies.prescriptionController.list);
  router.get("/prescriptions/:prescriptionId", requireAuth, dependencies.prescriptionController.get);
  router.post(
    "/consultations/:consultationId/prescriptions",
    requireAuth,
    authorizeRoles("DOCTOR"),
    dependencies.prescriptionController.create
  );
  router.patch(
    "/prescriptions/:prescriptionId",
    requireAuth,
    authorizeRoles("DOCTOR"),
    dependencies.prescriptionController.updateDraft
  );
  router.post(
    "/prescriptions/:prescriptionId/finalize",
    requireAuth,
    authorizeRoles("DOCTOR"),
    dependencies.prescriptionController.finalize
  );
  return router;
}
