import { Router } from "express";
import type { HealthController } from "./health.controller.js";

export type HealthRouterDependencies = { healthController: HealthController };

export function createHealthRouter({ healthController }: HealthRouterDependencies): Router {
  const router = Router();
  router.get("/live", healthController.live);
  router.get("/ready", healthController.ready);
  return router;
}
