import { Router } from "express";
import { authenticate, authorizeRoles } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/token.service.js";
import type { ProfileController } from "./profile.controller.js";

export function createProfileRouter(dependencies: {
  profileController: ProfileController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  router.use(authenticate(dependencies.tokenService));
  router.get("/me", dependencies.profileController.me);
  router.patch("/me", dependencies.profileController.updateMe);
  router.get("/:userId", authorizeRoles("ADMIN"), dependencies.profileController.getByUserId);
  return router;
}
