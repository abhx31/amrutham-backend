import { describe, expect, it } from "vitest";
import { AppError } from "../src/common/errors/app-error.js";
import type { AppConfig } from "../src/config/env.js";
import type { AuthRepository } from "../src/modules/auth/auth.repository.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import { PasswordService } from "../src/modules/auth/password.service.js";
import { TokenService } from "../src/modules/auth/token.service.js";

const config: AppConfig = {
  NODE_ENV: "test",
  PORT: 3000,
  TRUST_PROXY_HOPS: 0,
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  REDIS_URL: "redis://localhost:6379",
  APP_PUBLIC_URL: "http://localhost:3000",
  EMAIL_FROM: "no-reply@amrutam.local",
  EMAIL_TRANSPORT: "fake",
  LOG_LEVEL: "silent",
  JWT_ACCESS_SECRET: "test-secret-with-at-least-32-characters-long",
  JWT_ISSUER: "amrutam-api",
  JWT_AUDIENCE: "amrutam-clients",
  ACCESS_TOKEN_TTL_SECONDS: 900,
  REFRESH_TOKEN_TTL_DAYS: 30,
  PAYMENT_WEBHOOK_SECRET: "test-payment-webhook-secret-32-characters",
  MFA_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  METRICS_BEARER_TOKEN: "test-metrics-bearer-token-32-characters",
  PAYMENT_GATEWAY_MODE: "fake",
  OUTBOX_POLL_INTERVAL_MS: 1000,
  OUTBOX_BATCH_SIZE: 100,
  OUTBOX_MAX_ATTEMPTS: 5
};

describe("authentication security primitives", () => {
  it("hashes passwords with Argon2id and verifies the correct password", async () => {
    const passwords = new PasswordService();
    const hash = await passwords.hash("StrongPassword123");

    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(passwords.verify(hash, "StrongPassword123")).resolves.toBe(true);
    await expect(passwords.verify(hash, "WrongPassword123")).resolves.toBe(false);
  });

  it("signs and verifies access-token identity", async () => {
    const tokens = new TokenService(config);
    const accessToken = await tokens.createAccessToken("8dc14d5f-d09d-4bb6-a5b5-27faebcf85aa", "PATIENT");

    await expect(tokens.verifyAccessToken(accessToken)).resolves.toEqual({
      userId: "8dc14d5f-d09d-4bb6-a5b5-27faebcf85aa",
      role: "PATIENT"
    });
  });

  it("uses a generic error for an unknown login email", async () => {
    const repository = {
      findCredentialsByEmail: async () => undefined
    } as unknown as AuthRepository;
    const service = new AuthService(repository, new PasswordService(), new TokenService(config), config);

    await expect(service.login({ email: "missing@example.com", password: "anything" }))
      .rejects.toMatchObject({ statusCode: 401, code: "INVALID_CREDENTIALS" } satisfies Partial<AppError>);
  });
});
