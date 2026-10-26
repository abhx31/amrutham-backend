import { Router } from "express";
import { authenticate, authorizeRoles } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/token.service.js";
import type { UserController } from "./user.controller.js";

export function createUserRouter(dependencies: {
  userController: UserController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  const requireAuth = authenticate(dependencies.tokenService);
  const requireAdmin = authorizeRoles("ADMIN");

  router.use(requireAuth);
  router.get("/me", dependencies.userController.me);
  router.patch("/me/profile", dependencies.userController.updateMe);
  router.get("/", requireAdmin, dependencies.userController.list);
  router.get("/:userId", requireAdmin, dependencies.userController.getById);
  router.patch("/:userId/status", requireAdmin, dependencies.userController.updateStatus);
  return router;
}
