import { AppError } from "../../common/errors/app-error.js";
import type { AccessTokenIdentity } from "./auth.types.js";
import type { AuthResult, AuthService } from "./auth.service.js";
import { MfaCryptoService } from "./mfa-crypto.service.js";
import { MfaRepository } from "./mfa.repository.js";
import type { TokenService } from "./token.service.js";

export class MfaService {
  constructor(
    private readonly repository: MfaRepository,
    private readonly cryptoService: MfaCryptoService,
    private readonly tokenService: TokenService,
    private readonly authService: AuthService
  ) {}

  async setup(identity: AccessTokenIdentity): Promise<{ secret: string; otpauthUri: string }> {
    const existing = await this.repository.findByUserId(identity.userId);
    if (existing?.verifiedAt) throw new AppError("MFA is already enabled", 409, "MFA_ALREADY_ENABLED");
    const user = await this.authService.me(identity.userId);
    const secret = this.cryptoService.createSecret();
    await this.repository.savePending(identity.userId, this.cryptoService.encrypt(secret));
    const label = encodeURIComponent(`Amrutam:${user.email}`);
    const issuer = encodeURIComponent("Amrutam");
    return {
      secret,
      otpauthUri: `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`
    };
  }

  async verifySetup(
    identity: AccessTokenIdentity,
    code: string,
    requestId?: string
  ): Promise<{ session: AuthResult; recoveryCodes: string[] }> {
    const credential = await this.repository.findByUserId(identity.userId);
    if (!credential || credential.verifiedAt) {
      throw new AppError("No pending MFA setup was found", 409, "MFA_SETUP_NOT_PENDING");
    }
    const step = this.cryptoService.verifyTotp(this.cryptoService.decrypt(credential.encryptedSecret), code);
    if (step === undefined) throw new AppError("Invalid authentication code", 401, "INVALID_MFA_CODE");
    const recovery = this.cryptoService.createRecoveryCodes();
    if (!(await this.repository.activate(identity.userId, recovery.hashes, step, requestId))) {
      throw new AppError("MFA setup was already completed", 409, "MFA_SETUP_NOT_PENDING");
    }
    return { session: await this.authService.completeMfa(identity.userId), recoveryCodes: recovery.raw };
  }

  async verifyLogin(input: {
    challengeToken: string;
    code?: string | undefined;
    recoveryCode?: string | undefined;
  }): Promise<AuthResult> {
    const identity = await this.tokenService.verifyMfaToken(input.challengeToken, "mfa_login");
    const credential = await this.repository.findByUserId(identity.userId);
    if (!credential?.verifiedAt) throw new AppError("MFA is not configured", 409, "MFA_NOT_CONFIGURED");
    let accepted = false;
    if (input.code) {
      const step = this.cryptoService.verifyTotp(this.cryptoService.decrypt(credential.encryptedSecret), input.code);
      accepted = step !== undefined && await this.repository.consumeTotp(identity.userId, step);
    } else if (input.recoveryCode) {
      accepted = await this.repository.consumeRecoveryCode(
        identity.userId,
        this.cryptoService.hashRecoveryCode(input.recoveryCode)
      );
    }
    if (!accepted) throw new AppError("Invalid or already used authentication code", 401, "INVALID_MFA_CODE");
    return this.authService.completeMfa(identity.userId);
  }

  async disable(
    identity: AccessTokenIdentity,
    password: string,
    code: string,
    requestId?: string
  ): Promise<void> {
    if (identity.role === "DOCTOR" || identity.role === "ADMIN") {
      throw new AppError("MFA is required for this role", 409, "MFA_REQUIRED_FOR_ROLE");
    }
    if (!(await this.authService.verifyCurrentPassword(identity.userId, password))) {
      throw new AppError("Invalid password", 401, "INVALID_CREDENTIALS");
    }
    const credential = await this.repository.findByUserId(identity.userId);
    if (!credential?.verifiedAt) throw new AppError("MFA is not enabled", 409, "MFA_NOT_CONFIGURED");
    const step = this.cryptoService.verifyTotp(this.cryptoService.decrypt(credential.encryptedSecret), code);
    if (step === undefined || !(await this.repository.consumeTotp(identity.userId, step))) {
      throw new AppError("Invalid authentication code", 401, "INVALID_MFA_CODE");
    }
    await this.repository.disable(identity.userId, requestId);
    await this.authService.logoutAll(identity.userId);
  }
}
