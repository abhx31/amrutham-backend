import { Router } from "express";
import type { OpenApiController } from "./openapi.controller.js";

export function createOpenApiRouter({ openApiController }: { openApiController: OpenApiController }): Router {
  const router = Router();

  router.get("/openapi.json", openApiController.document);
  router.get("/docs", openApiController.explorer);
  router.get("/docs/", openApiController.explorer);

  return router;
}
