import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate } from "../auth/auth.middleware.js";
import type { TokenService } from "../auth/token.service.js";
import type { AccountController } from "./account.controller.js";

export function createAccountRouter(dependencies: {
  accountController: AccountController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  const recoveryLimit = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many account recovery attempts" } }
  });
  const requireAuth = authenticate(dependencies.tokenService);

  router.post("/forgot-password", recoveryLimit, dependencies.accountController.forgotPassword);
  router.post("/reset-password", recoveryLimit, dependencies.accountController.resetPassword);
  router.post("/request-email-verification", recoveryLimit, dependencies.accountController.requestEmailVerification);
  router.post("/verify-email", recoveryLimit, dependencies.accountController.verifyEmail);
  router.post("/change-password", requireAuth, dependencies.accountController.changePassword);
  router.get("/sessions", requireAuth, dependencies.accountController.listSessions);
  router.delete("/sessions/:sessionId", requireAuth, dependencies.accountController.revokeSession);
  return router;
}
