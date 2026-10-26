import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "../../infrastructure/database/database.js";
import { profiles, refreshTokens, users } from "../../infrastructure/database/schema.js";
import type { AuthUser, RefreshTokenRecord, UserRole } from "./auth.types.js";

export type NewUser = {
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone?: string | undefined;
};

export class AuthRepository {
  constructor(private readonly database: Database) {}

  async findCredentialsByEmail(email: string) {
    const [record] = await this.database.select({
      id: users.id,
      email: users.email,
      passwordHash: users.passwordHash,
      role: users.role,
      status: users.status,
      mfaEnabled: users.mfaEnabled
    }).from(users).where(eq(users.email, email)).limit(1);
    return record;
  }

  async findUserByEmail(email: string): Promise<AuthUser | undefined> {
    const [record] = await this.database.select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      firstName: profiles.firstName,
      lastName: profiles.lastName
    }).from(users).innerJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.email, email)).limit(1);
    return record;
  }

  async findUserById(userId: string): Promise<AuthUser | undefined> {
    const [record] = await this.database.select({
      id: users.id,
      email: users.email,
      role: users.role,
      status: users.status,
      firstName: profiles.firstName,
      lastName: profiles.lastName
    }).from(users).innerJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, userId)).limit(1);
    return record;
  }

  createPatient(input: NewUser): Promise<AuthUser> {
    return this.database.transaction(async (transaction) => {
      const [user] = await transaction.insert(users).values({
        email: input.email,
        passwordHash: input.passwordHash,
        role: "PATIENT",
        status: "ACTIVE"
      }).returning({ id: users.id, email: users.email, role: users.role, status: users.status });

      if (!user) throw new Error("User insert returned no record");
      const [profile] = await transaction.insert(profiles).values({
        userId: user.id,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone
      }).returning({ firstName: profiles.firstName, lastName: profiles.lastName });
      if (!profile) throw new Error("Profile insert returned no record");
      return { ...user, ...profile };
    });
  }

  async createRefreshToken(input: {
    userId: string; familyId: string; tokenHash: string; expiresAt: Date;
  }): Promise<string> {
    const [record] = await this.database.insert(refreshTokens).values(input)
      .returning({ id: refreshTokens.id });
    if (!record) throw new Error("Refresh token insert returned no record");
    return record.id;
  }

  async findRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | undefined> {
    const [record] = await this.database.select({
      id: refreshTokens.id,
      userId: refreshTokens.userId,
      familyId: refreshTokens.familyId,
      tokenHash: refreshTokens.tokenHash,
      expiresAt: refreshTokens.expiresAt,
      revokedAt: refreshTokens.revokedAt
    }).from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).limit(1);
    return record;
  }

  rotateRefreshToken(currentId: string, replacement: {
    userId: string; familyId: string; tokenHash: string; expiresAt: Date;
  }): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const [next] = await transaction.insert(refreshTokens).values(replacement)
        .returning({ id: refreshTokens.id });
      if (!next) return false;
      const updated = await transaction.update(refreshTokens).set({
        revokedAt: new Date(), lastUsedAt: new Date(), replacedByTokenId: next.id
      }).where(and(eq(refreshTokens.id, currentId), isNull(refreshTokens.revokedAt)))
        .returning({ id: refreshTokens.id });
      if (updated.length === 0) throw new Error("REFRESH_TOKEN_ALREADY_USED");
      return true;
    });
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    await this.database.update(refreshTokens).set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.tokenHash, tokenHash), isNull(refreshTokens.revokedAt)));
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.database.update(refreshTokens).set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.database.update(refreshTokens).set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
  }
}
