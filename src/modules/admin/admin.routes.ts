import { Router } from "express";
import { authenticate, authorizeRoles } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/token.service.js";
import type { AdminController } from "./admin.controller.js";

export function createAdminRouter(dependencies: {
  adminController: AdminController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  router.use(authenticate(dependencies.tokenService), authorizeRoles("ADMIN"));
  router.get("/doctors/pending", dependencies.adminController.pendingDoctors);
  router.post("/users", dependencies.adminController.createUser);
  return router;
}
