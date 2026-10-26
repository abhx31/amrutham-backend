import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config/env.js";
import type { AuthRepository } from "../src/modules/auth/auth.repository.js";
import { AuthService } from "../src/modules/auth/auth.service.js";
import { MfaCryptoService } from "../src/modules/auth/mfa-crypto.service.js";
import type { PasswordService } from "../src/modules/auth/password.service.js";
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

describe("MFA", () => {
  it("encrypts and authenticates TOTP secrets", () => {
    const cryptoService = new MfaCryptoService(config);
    const secret = cryptoService.createSecret();
    const encrypted = cryptoService.encrypt(secret);

    expect(encrypted).not.toContain(secret);
    expect(cryptoService.decrypt(encrypted)).toBe(secret);
  });

  it("validates the six-digit RFC TOTP vector", () => {
    const cryptoService = new MfaCryptoService(config);
    expect(cryptoService.verifyTotp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", "287082", 59_000)).toBe(1);
  });

  it("returns an enrollment challenge instead of a session for a doctor without MFA", async () => {
    const credentials = {
      id: "a570dd6c-dacf-469a-a1d0-fcb0f272834c",
      email: "doctor@example.com",
      passwordHash: "hash",
      role: "DOCTOR" as const,
      status: "ACTIVE" as const,
      mfaEnabled: false
    };
    const repository = {
      findCredentialsByEmail: vi.fn().mockResolvedValue(credentials),
      findUserById: vi.fn().mockResolvedValue({
        id: credentials.id,
        email: credentials.email,
        role: credentials.role,
        status: credentials.status,
        firstName: "Maya",
        lastName: "Shah"
      })
    } as unknown as AuthRepository;
    const passwordService = { verify: vi.fn().mockResolvedValue(true) } as unknown as PasswordService;
    const service = new AuthService(repository, passwordService, new TokenService(config), config);

    await expect(service.login({ email: credentials.email, password: "StrongPassword123" }))
      .resolves.toMatchObject({ mfaSetupRequired: true, mfaRequired: false, expiresIn: 300 });
  });
});
