import crypto from "node:crypto";
import { AppError } from "../../common/errors/app-error.js";
import type { AuthService } from "../auth/auth.service.js";
import type { MfaCryptoService } from "../auth/mfa-crypto.service.js";
import type { PasswordService } from "../auth/password.service.js";
import { AccountRepository } from "./account.repository.js";

export class AccountService {
  constructor(
    private readonly repository: AccountRepository,
    private readonly passwordService: PasswordService,
    private readonly authService: AuthService,
    private readonly encryption: MfaCryptoService
  ) {}

  requestPasswordReset(email: string): Promise<void> {
    return this.createDeliveryToken(email, "PASSWORD_RESET", 30 * 60 * 1_000);
  }

  requestEmailVerification(email: string): Promise<void> {
    return this.createDeliveryToken(email, "EMAIL_VERIFICATION", 24 * 60 * 60 * 1_000);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const passwordHash = await this.passwordService.hash(newPassword);
    const userId = await this.repository.resetPassword(hashToken(token), passwordHash);
    if (!userId) throw new AppError("Reset token is invalid or expired", 400, "INVALID_RESET_TOKEN");
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    requestId?: string
  ): Promise<void> {
    if (!(await this.authService.verifyCurrentPassword(userId, currentPassword))) {
      throw new AppError("Current password is incorrect", 401, "INVALID_CREDENTIALS");
    }
    await this.repository.changePassword(userId, await this.passwordService.hash(newPassword), requestId);
  }

  async verifyEmail(token: string): Promise<void> {
    if (!(await this.repository.verifyEmail(hashToken(token)))) {
      throw new AppError("Verification token is invalid or expired", 400, "INVALID_VERIFICATION_TOKEN");
    }
  }

  listSessions(userId: string) {
    return this.repository.listSessions(userId);
  }

  async revokeSession(userId: string, sessionId: string, requestId?: string): Promise<void> {
    if (!(await this.repository.revokeSession(userId, sessionId, requestId))) {
      throw new AppError("Session not found or already revoked", 404, "SESSION_NOT_FOUND");
    }
  }

  private createDeliveryToken(email: string, type: "PASSWORD_RESET" | "EMAIL_VERIFICATION", ttl: number): Promise<void> {
    const rawToken = crypto.randomBytes(48).toString("base64url");
    return this.repository.createDeliveryToken({
      email,
      type,
      tokenHash: hashToken(rawToken),
      encryptedToken: this.encryption.encrypt(rawToken),
      expiresAt: new Date(Date.now() + ttl)
    });
  }
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
