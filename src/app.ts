import crypto from "node:crypto";
import express, { type Express, type Request } from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import type { ContainerCradle } from "./container.js";
import { errorHandler } from "./common/middleware/error-handler.js";
import { notFound } from "./common/middleware/not-found.js";

export function createApp(cradle: ContainerCradle): Express {
  const app = express();

  app.set("trust proxy", cradle.config.TRUST_PROXY_HOPS);
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({
    limit: "1mb",
    verify: (request, _response, buffer) => {
      (request as Request).rawBody = Buffer.from(buffer);
    }
  }));
  app.use(pinoHttp({
    logger: cradle.logger,
    genReqId: (request, response) => {
      const suppliedId = request.headers["x-request-id"];
      const requestId = typeof suppliedId === "string" ? suppliedId : crypto.randomUUID();
      response.setHeader("x-request-id", requestId);
      return requestId;
    }
  }));
  app.use(cradle.metricsService.middleware());

  app.use("/api", cradle.openApiRouter);
  app.use("/api/v1/health", cradle.healthRouter);
  app.get("/metrics", cradle.metricsController.get);
  app.use("/api/v1/auth", cradle.authRouter);
  app.use("/api/v1/auth/mfa", cradle.mfaRouter);
  app.use("/api/v1/auth", cradle.accountRouter);
  app.use("/api/v1/users", cradle.userRouter);
  app.use("/api/v1/profiles", cradle.profileRouter);
  app.use("/api/v1/doctors", cradle.doctorRouter);
  app.use("/api/v1/consultations", cradle.consultationRouter);
  app.use("/api/v1", cradle.prescriptionRouter);
  app.use("/api/v1", cradle.paymentRouter);
  app.use("/api/v1/audit-logs", cradle.auditRouter);
  app.use("/api/v1/admin/analytics", cradle.analyticsRouter);
  app.use("/api/v1/admin", cradle.adminRouter);
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
