import crypto from "node:crypto";
import { AppError } from "../../common/errors/app-error.js";
import type { AppConfig } from "../../config/env.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";
import { AuthRepository } from "./auth.repository.js";
import type { AuthUser } from "./auth.types.js";
import { PasswordService } from "./password.service.js";
import { TokenService } from "./token.service.js";

export type AuthResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
};

export type MfaChallengeResult = {
  mfaRequired: boolean;
  mfaSetupRequired: boolean;
  challengeToken: string;
  expiresIn: 300;
};

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly config: AppConfig
  ) {}

  async register(input: RegisterInput): Promise<AuthResult> {
    if (await this.repository.findCredentialsByEmail(input.email)) {
      throw new AppError("An account with this email already exists", 409, "EMAIL_ALREADY_EXISTS");
    }

    const passwordHash = await this.passwordService.hash(input.password);
    try {
      const user = await this.repository.createPatient({ ...input, passwordHash });
      return this.issueSession(user);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError("An account with this email already exists", 409, "EMAIL_ALREADY_EXISTS");
      }
      throw error;
    }
  }

  async login(input: LoginInput): Promise<AuthResult | MfaChallengeResult> {
    const credentials = await this.repository.findCredentialsByEmail(input.email);
    if (!credentials || !(await this.passwordService.verify(credentials.passwordHash, input.password))) {
      throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    }
    if (credentials.status !== "ACTIVE") {
      throw new AppError("This account is not active", 403, "ACCOUNT_NOT_ACTIVE");
    }

    const user = await this.repository.findUserById(credentials.id);
    if (!user) throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
    const privileged = user.role === "DOCTOR" || user.role === "ADMIN";
    if (privileged && !credentials.mfaEnabled) {
      return {
        mfaRequired: false,
        mfaSetupRequired: true,
        challengeToken: await this.tokenService.createMfaToken(user.id, user.role, "mfa_setup"),
        expiresIn: 300
      };
    }
    if (credentials.mfaEnabled) {
      return {
        mfaRequired: true,
        mfaSetupRequired: false,
        challengeToken: await this.tokenService.createMfaToken(user.id, user.role, "mfa_login"),
        expiresIn: 300
      };
    }
    return this.issueSession(user);
  }

  async completeMfa(userId: string): Promise<AuthResult> {
    const user = await this.repository.findUserById(userId);
    if (!user || user.status !== "ACTIVE") {
      throw new AppError("This account is not active", 403, "ACCOUNT_NOT_ACTIVE");
    }
    return this.issueSession(user);
  }

  async verifyCurrentPassword(userId: string, password: string): Promise<boolean> {
    const user = await this.repository.findUserById(userId);
    if (!user) return false;
    const credentials = await this.repository.findCredentialsByEmail(user.email);
    return credentials ? this.passwordService.verify(credentials.passwordHash, password) : false;
  }

  async refresh(rawToken: string): Promise<AuthResult> {
    const tokenHash = this.tokenService.hashRefreshToken(rawToken);
    const stored = await this.repository.findRefreshToken(tokenHash);
    if (!stored) throw new AppError("Invalid refresh token", 401, "INVALID_REFRESH_TOKEN");
    if (stored.revokedAt) {
      await this.repository.revokeFamily(stored.familyId);
      throw new AppError("Refresh token reuse detected", 401, "REFRESH_TOKEN_REUSED");
    }
    if (stored.expiresAt.getTime() <= Date.now()) {
      await this.repository.revokeRefreshToken(tokenHash);
      throw new AppError("Refresh token has expired", 401, "REFRESH_TOKEN_EXPIRED");
    }

    const user = await this.repository.findUserById(stored.userId);
    if (!user || user.status !== "ACTIVE") {
      await this.repository.revokeFamily(stored.familyId);
      throw new AppError("This account is not active", 403, "ACCOUNT_NOT_ACTIVE");
    }
    if (user.role === "DOCTOR" || user.role === "ADMIN") {
      const credentials = await this.repository.findCredentialsByEmail(user.email);
      if (!credentials?.mfaEnabled) {
        await this.repository.revokeFamily(stored.familyId);
        throw new AppError("MFA enrollment is required", 403, "MFA_SETUP_REQUIRED");
      }
    }

    const next = this.tokenService.createRefreshToken();
    try {
      await this.repository.rotateRefreshToken(stored.id, {
        userId: user.id,
        familyId: stored.familyId,
        tokenHash: next.hash,
        expiresAt: this.refreshExpiry()
      });
    } catch (error) {
      if (error instanceof Error && error.message === "REFRESH_TOKEN_ALREADY_USED") {
        await this.repository.revokeFamily(stored.familyId);
        throw new AppError("Refresh token reuse detected", 401, "REFRESH_TOKEN_REUSED");
      }
      throw error;
    }

    return {
      accessToken: await this.tokenService.createAccessToken(user.id, user.role),
      refreshToken: next.raw,
      expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
      user
    };
  }

  async logout(rawToken: string): Promise<void> {
    await this.repository.revokeRefreshToken(this.tokenService.hashRefreshToken(rawToken));
  }

  logoutAll(userId: string): Promise<void> {
    return this.repository.revokeAllForUser(userId);
  }

  async me(userId: string): Promise<AuthUser> {
    const user = await this.repository.findUserById(userId);
    if (!user || user.status !== "ACTIVE") {
      throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
    }
    return user;
  }

  private async issueSession(user: AuthUser): Promise<AuthResult> {
    const refresh = this.tokenService.createRefreshToken();
    await this.repository.createRefreshToken({
      userId: user.id,
      familyId: crypto.randomUUID(),
      tokenHash: refresh.hash,
      expiresAt: this.refreshExpiry()
    });
    return {
      accessToken: await this.tokenService.createAccessToken(user.id, user.role),
      refreshToken: refresh.raw,
      expiresIn: this.config.ACCESS_TOKEN_TTL_SECONDS,
      user
    };
  }

  private refreshExpiry(): Date {
    return new Date(Date.now() + this.config.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
