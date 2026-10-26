import { describe, expect, it, vi } from "vitest";
import type { AppConfig } from "../src/config/env.js";
import type { AccountRepository } from "../src/modules/accounts/account.repository.js";
import { AccountService } from "../src/modules/accounts/account.service.js";
import type { AuthService } from "../src/modules/auth/auth.service.js";
import { MfaCryptoService } from "../src/modules/auth/mfa-crypto.service.js";
import type { PasswordService } from "../src/modules/auth/password.service.js";

const config = {
  MFA_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
} as AppConfig;

describe("account management", () => {
  it("stores only a hash and encrypted delivery token for password recovery", async () => {
    const createDeliveryToken = vi.fn().mockResolvedValue(undefined);
    const repository = { createDeliveryToken } as unknown as AccountRepository;
    const service = new AccountService(
      repository,
      {} as PasswordService,
      {} as AuthService,
      new MfaCryptoService(config)
    );

    await service.requestPasswordReset("patient@example.com");
    const input = createDeliveryToken.mock.calls[0]![0];
    expect(input.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(input.encryptedToken).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
    expect(input).not.toHaveProperty("rawToken");
  });

  it("returns a stable error for an invalid reset token", async () => {
    const repository = { resetPassword: vi.fn().mockResolvedValue(undefined) } as unknown as AccountRepository;
    const passwordService = { hash: vi.fn().mockResolvedValue("password-hash") } as unknown as PasswordService;
    const service = new AccountService(repository, passwordService, {} as AuthService, new MfaCryptoService(config));

    await expect(service.resetPassword("invalid-token-value-that-is-long-enough", "StrongPassword123"))
      .rejects.toMatchObject({ code: "INVALID_RESET_TOKEN", statusCode: 400 });
  });
});
