import { Router } from "express";
import { authenticate, authorizeRoles } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/token.service.js";
import type { AnalyticsController } from "./analytics.controller.js";

export function createAnalyticsRouter(dependencies: {
  analyticsController: AnalyticsController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  router.use(authenticate(dependencies.tokenService), authorizeRoles("ADMIN"));
  router.get("/overview", dependencies.analyticsController.overview);
  router.get("/consultations", dependencies.analyticsController.consultations);
  router.get("/doctors", dependencies.analyticsController.doctors);
  router.get("/payments", dependencies.analyticsController.payments);
  return router;
}
