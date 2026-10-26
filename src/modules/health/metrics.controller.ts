import crypto from "node:crypto";
import type { Request, Response } from "express";
import { AppError } from "../../common/errors/app-error.js";
import type { AppConfig } from "../../config/env.js";
import type { MetricsService } from "../../infrastructure/observability/metrics.service.js";

export class MetricsController {
  constructor(
    private readonly metrics: MetricsService,
    private readonly config: AppConfig
  ) {}

  get = (request: Request, response: Response): void => {
    const supplied = request.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!supplied || !safeEqual(supplied, this.config.METRICS_BEARER_TOKEN)) {
      throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
    }
    response.type("text/plain; version=0.0.4").status(200).send(this.metrics.render());
  };
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
