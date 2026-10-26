import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import type { AuthController } from "./auth.controller.js";
import { authenticate } from "./auth.middleware.js";
import type { TokenService } from "./token.service.js";

export function createAuthRouter(dependencies: {
  authController: AuthController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  const sensitiveRateLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many authentication attempts" } }
  });
  const requireAuth = authenticate(dependencies.tokenService);

  router.post("/register", sensitiveRateLimit, dependencies.authController.register);
  router.post("/login", sensitiveRateLimit, dependencies.authController.login);
  router.post("/refresh", sensitiveRateLimit, dependencies.authController.refresh);
  router.post("/logout", dependencies.authController.logout);
  router.post("/logout-all", requireAuth, dependencies.authController.logoutAll);
  router.get("/me", requireAuth, dependencies.authController.me);
  return router;
}
