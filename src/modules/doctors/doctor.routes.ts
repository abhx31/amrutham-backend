import { Router } from "express";
import { authenticate, authorizeRoles } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/token.service.js";
import type { DoctorController } from "./doctor.controller.js";

export function createDoctorRouter(dependencies: {
  doctorController: DoctorController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  const requireAuth = authenticate(dependencies.tokenService);
  const doctorOnly = authorizeRoles("DOCTOR");
  const adminOnly = authorizeRoles("ADMIN");

  router.get("/", dependencies.doctorController.list);
  router.get("/me", requireAuth, doctorOnly, dependencies.doctorController.getMine);
  router.patch("/me", requireAuth, doctorOnly, dependencies.doctorController.updateMine);
  router.get("/me/availability", requireAuth, doctorOnly, dependencies.doctorController.listOwnAvailability);
  router.post("/me/availability", requireAuth, doctorOnly, dependencies.doctorController.createAvailability);
  router.patch("/me/availability/:slotId", requireAuth, doctorOnly, dependencies.doctorController.updateAvailability);
  router.delete("/me/availability/:slotId", requireAuth, doctorOnly, dependencies.doctorController.removeAvailability);
  router.post("/", requireAuth, adminOnly, dependencies.doctorController.create);
  router.patch("/:doctorId/verification", requireAuth, adminOnly, dependencies.doctorController.verify);
  router.get("/:doctorId/availability", dependencies.doctorController.listAvailability);
  router.get("/:doctorId", dependencies.doctorController.getPublic);
  return router;
}
