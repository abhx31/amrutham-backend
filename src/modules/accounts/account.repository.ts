import { and, desc, eq, gt, isNull, ne } from "drizzle-orm";
import { AppError } from "../../common/errors/app-error.js";
import type { Database } from "../../infrastructure/database/database.js";
import {
  accountTokens,
  auditLogs,
  outboxEvents,
  refreshTokens,
  users
} from "../../infrastructure/database/schema.js";
import type { SessionView } from "./account.types.js";

type TokenType = "PASSWORD_RESET" | "EMAIL_VERIFICATION";

export class AccountRepository {
  constructor(private readonly database: Database) {}

  createDeliveryToken(input: {
    email: string;
    type: TokenType;
    tokenHash: string;
    encryptedToken: string;
    expiresAt: Date;
  }): Promise<void> {
    return this.database.transaction(async (transaction) => {
      const [user] = await transaction.select({ id: users.id }).from(users)
        .where(eq(users.email, input.email)).limit(1);
      if (!user) return;
      await transaction.update(accountTokens).set({ usedAt: new Date() }).where(and(
        eq(accountTokens.userId, user.id),
        eq(accountTokens.type, input.type),
        isNull(accountTokens.usedAt)
      ));
      const [token] = await transaction.insert(accountTokens).values({
        userId: user.id,
        type: input.type,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt
      }).returning({ id: accountTokens.id });
      if (!token) throw new Error("Account token insert returned no record");
      await transaction.insert(outboxEvents).values({
        eventType: input.type === "PASSWORD_RESET" ? "account.password_reset_requested" : "account.email_verification_requested",
        aggregateType: "user",
        aggregateId: user.id,
        payload: { tokenId: token.id, encryptedToken: input.encryptedToken }
      });
    });
  }

  resetPassword(tokenHash: string, passwordHash: string): Promise<string | undefined> {
    return this.database.transaction(async (transaction) => {
      const [token] = await transaction.select({ id: accountTokens.id, userId: accountTokens.userId })
        .from(accountTokens).where(and(
          eq(accountTokens.tokenHash, tokenHash),
          eq(accountTokens.type, "PASSWORD_RESET"),
          isNull(accountTokens.usedAt),
          gt(accountTokens.expiresAt, new Date())
        )).for("update").limit(1);
      if (!token) return undefined;
      await transaction.update(accountTokens).set({ usedAt: new Date() }).where(eq(accountTokens.id, token.id));
      await transaction.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, token.userId));
      await transaction.update(refreshTokens).set({ revokedAt: new Date() }).where(and(
        eq(refreshTokens.userId, token.userId), isNull(refreshTokens.revokedAt)
      ));
      await transaction.insert(auditLogs).values({
        actorId: token.userId,
        action: "PASSWORD_RESET",
        entityType: "user",
        entityId: token.userId
      });
      return token.userId;
    });
  }

  changePassword(userId: string, passwordHash: string, requestId?: string): Promise<void> {
    return this.database.transaction(async (transaction) => {
      await transaction.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId));
      await transaction.update(refreshTokens).set({ revokedAt: new Date() }).where(and(
        eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)
      ));
      await transaction.insert(auditLogs).values({
        actorId: userId,
        action: "PASSWORD_CHANGED",
        entityType: "user",
        entityId: userId,
        requestId
      });
    });
  }

  verifyEmail(tokenHash: string): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const [token] = await transaction.select({ id: accountTokens.id, userId: accountTokens.userId })
        .from(accountTokens).where(and(
          eq(accountTokens.tokenHash, tokenHash),
          eq(accountTokens.type, "EMAIL_VERIFICATION"),
          isNull(accountTokens.usedAt),
          gt(accountTokens.expiresAt, new Date())
        )).for("update").limit(1);
      if (!token) return false;
      await transaction.update(accountTokens).set({ usedAt: new Date() }).where(eq(accountTokens.id, token.id));
      await transaction.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
        .where(eq(users.id, token.userId));
      await transaction.insert(auditLogs).values({
        actorId: token.userId,
        action: "EMAIL_VERIFIED",
        entityType: "user",
        entityId: token.userId
      });
      return true;
    });
  }

  async listSessions(userId: string): Promise<SessionView[]> {
    return this.database.select({
      id: refreshTokens.id,
      createdAt: refreshTokens.createdAt,
      lastUsedAt: refreshTokens.lastUsedAt,
      expiresAt: refreshTokens.expiresAt,
      revokedAt: refreshTokens.revokedAt
    }).from(refreshTokens).where(eq(refreshTokens.userId, userId)).orderBy(desc(refreshTokens.createdAt)).limit(100);
  }

  async revokeSession(userId: string, sessionId: string, requestId?: string): Promise<boolean> {
    const changed = await this.database.transaction(async (transaction) => {
      const records = await transaction.update(refreshTokens).set({ revokedAt: new Date() }).where(and(
        eq(refreshTokens.id, sessionId),
        eq(refreshTokens.userId, userId),
        isNull(refreshTokens.revokedAt)
      )).returning({ id: refreshTokens.id });
      if (records.length === 0) return false;
      await transaction.insert(auditLogs).values({
        actorId: userId,
        action: "SESSION_REVOKED",
        entityType: "refresh_token",
        entityId: sessionId,
        requestId
      });
      return true;
    });
    return changed;
  }
}
