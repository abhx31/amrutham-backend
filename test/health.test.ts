import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createAppContainer } from "../src/container.js";

const config = {
  NODE_ENV: "test" as const,
  PORT: 3000,
  TRUST_PROXY_HOPS: 0,
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  REDIS_URL: "redis://localhost:6379",
  APP_PUBLIC_URL: "http://localhost:3000",
  EMAIL_FROM: "no-reply@amrutam.local",
  EMAIL_TRANSPORT: "fake" as const,
  LOG_LEVEL: "silent" as const,
  JWT_ACCESS_SECRET: "test-secret-with-at-least-32-characters-long",
  JWT_ISSUER: "amrutam-api",
  JWT_AUDIENCE: "amrutam-clients",
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 30,
  PAYMENT_WEBHOOK_SECRET: "test-payment-webhook-secret-32-characters",
  MFA_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  METRICS_BEARER_TOKEN: "test-metrics-bearer-token-32-characters",
  PAYMENT_GATEWAY_MODE: "fake" as const,
  OUTBOX_POLL_INTERVAL_MS: 1000,
  OUTBOX_BATCH_SIZE: 100,
  OUTBOX_MAX_ATTEMPTS: 5
};

describe("health endpoint", () => {
  it("returns a successful liveness response", async () => {
    const container = createAppContainer(config);
    const app = createApp(container.cradle);
    const response = await request(app).get("/api/v1/health/live");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
    expect(response.headers["x-request-id"]).toBeTypeOf("string");
    expect(app.get("trust proxy")).toBe(0);
  });
});
