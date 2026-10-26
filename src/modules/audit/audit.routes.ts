import { Router } from "express";
import { authenticate, authorizeRoles } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/token.service.js";
import type { AuditController } from "./audit.controller.js";

export function createAuditRouter(dependencies: {
  auditController: AuditController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  router.use(authenticate(dependencies.tokenService), authorizeRoles("ADMIN"));
  router.get("/", dependencies.auditController.list);
  router.get("/:auditLogId", dependencies.auditController.get);
  return router;
}
