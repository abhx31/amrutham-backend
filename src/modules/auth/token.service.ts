import crypto from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { AppConfig } from "../../config/env.js";
import { AppError } from "../../common/errors/app-error.js";
import { roles, type AccessTokenIdentity, type MfaTokenPurpose, type UserRole } from "./auth.types.js";

export class TokenService {
  private readonly secret: Uint8Array;

  constructor(private readonly config: AppConfig) {
    this.secret = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
  }

  createAccessToken(userId: string, role: UserRole): Promise<string> {
    return new SignJWT({ role, purpose: "access" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setIssuer(this.config.JWT_ISSUER)
      .setAudience(this.config.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime(`${this.config.ACCESS_TOKEN_TTL_SECONDS}s`)
      .sign(this.secret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        algorithms: ["HS256"]
      });

      if (!payload.sub || payload.purpose !== "access" || !roles.includes(payload.role as UserRole)) {
        throw new Error("Invalid claims");
      }
      return { userId: payload.sub, role: payload.role as UserRole };
    } catch {
      throw new AppError("Authentication is required", 401, "UNAUTHORIZED");
    }
  }

  createMfaToken(userId: string, role: UserRole, purpose: MfaTokenPurpose): Promise<string> {
    return new SignJWT({ role, purpose })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(userId)
      .setIssuer(this.config.JWT_ISSUER)
      .setAudience(this.config.JWT_AUDIENCE)
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(this.secret);
  }

  async verifyMfaToken(token: string, allowedPurpose: MfaTokenPurpose): Promise<AccessTokenIdentity> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: this.config.JWT_ISSUER,
        audience: this.config.JWT_AUDIENCE,
        algorithms: ["HS256"]
      });
      if (
        !payload.sub || payload.purpose !== allowedPurpose ||
        !roles.includes(payload.role as UserRole)
      ) throw new Error("Invalid MFA claims");
      return { userId: payload.sub, role: payload.role as UserRole };
    } catch {
      throw new AppError("MFA challenge is invalid or expired", 401, "INVALID_MFA_CHALLENGE");
    }
  }

  createRefreshToken(): { raw: string; hash: string } {
    const raw = crypto.randomBytes(48).toString("base64url");
    return { raw, hash: this.hashRefreshToken(raw) };
  }

  hashRefreshToken(raw: string): string {
    return crypto.createHash("sha256").update(raw).digest("hex");
  }
}
