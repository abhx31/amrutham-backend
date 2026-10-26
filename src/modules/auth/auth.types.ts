export const roles = ["PATIENT", "DOCTOR", "ADMIN"] as const;
export type UserRole = (typeof roles)[number];

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  status: "PENDING" | "ACTIVE" | "SUSPENDED";
  firstName: string;
  lastName: string;
};

export type AccessTokenIdentity = {
  userId: string;
  role: UserRole;
};

export type MfaTokenPurpose = "mfa_setup" | "mfa_login";

export type RefreshTokenRecord = {
  id: string;
  userId: string;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
};

declare global {
  namespace Express {
    interface Request {
      auth?: AccessTokenIdentity;
      rawBody?: Buffer;
    }
  }
}
