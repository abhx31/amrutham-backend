import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { authenticate, authenticateMfaSetup } from "./auth.middleware.js";
import type { MfaController } from "./mfa.controller.js";
import type { TokenService } from "./token.service.js";

export function createMfaRouter(dependencies: {
  mfaController: MfaController;
  tokenService: TokenService;
}): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1_000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many MFA attempts" } }
  });
  const setupAuth = authenticateMfaSetup(dependencies.tokenService);

  router.post("/setup", limiter, setupAuth, dependencies.mfaController.setup);
  router.post("/verify-setup", limiter, setupAuth, dependencies.mfaController.verifySetup);
  router.post("/verify-login", limiter, dependencies.mfaController.verifyLogin);
  router.delete("/", limiter, authenticate(dependencies.tokenService), dependencies.mfaController.disable);
  return router;
}
