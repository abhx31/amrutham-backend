import { and, eq, isNull, lt, or } from "drizzle-orm";
import type { Database } from "../../infrastructure/database/database.js";
import { auditLogs, mfaCredentials, users } from "../../infrastructure/database/schema.js";

export type MfaCredential = {
  userId: string;
  encryptedSecret: string;
  recoveryCodeHashes: string[];
  verifiedAt: Date | null;
  lastUsedStep: number | null;
};

export class MfaRepository {
  constructor(private readonly database: Database) {}

  async findByUserId(userId: string): Promise<MfaCredential | undefined> {
    const [record] = await this.database.select({
      userId: mfaCredentials.userId,
      encryptedSecret: mfaCredentials.encryptedSecret,
      recoveryCodeHashes: mfaCredentials.recoveryCodeHashes,
      verifiedAt: mfaCredentials.verifiedAt,
      lastUsedStep: mfaCredentials.lastUsedStep
    }).from(mfaCredentials).where(eq(mfaCredentials.userId, userId)).limit(1);
    return record ? { ...record, recoveryCodeHashes: record.recoveryCodeHashes as string[] } : undefined;
  }

  async savePending(userId: string, encryptedSecret: string): Promise<void> {
    await this.database.insert(mfaCredentials).values({ userId, encryptedSecret })
      .onConflictDoUpdate({
        target: mfaCredentials.userId,
        set: { encryptedSecret, recoveryCodeHashes: [], verifiedAt: null, lastUsedStep: null, updatedAt: new Date() }
      });
  }

  activate(
    userId: string,
    recoveryCodeHashes: string[],
    usedStep: number,
    requestId?: string
  ): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const changed = await transaction.update(mfaCredentials).set({
        recoveryCodeHashes,
        verifiedAt: new Date(),
        lastUsedStep: usedStep,
        updatedAt: new Date()
      }).where(and(eq(mfaCredentials.userId, userId), isNull(mfaCredentials.verifiedAt)))
        .returning({ id: mfaCredentials.id });
      if (changed.length === 0) return false;
      await transaction.update(users).set({ mfaEnabled: true, updatedAt: new Date() }).where(eq(users.id, userId));
      await transaction.insert(auditLogs).values({
        actorId: userId,
        action: "MFA_ENABLED",
        entityType: "user",
        entityId: userId,
        requestId
      });
      return true;
    });
  }

  async consumeTotp(userId: string, step: number): Promise<boolean> {
    const changed = await this.database.update(mfaCredentials).set({ lastUsedStep: step, updatedAt: new Date() })
      .where(and(
        eq(mfaCredentials.userId, userId),
        or(isNull(mfaCredentials.lastUsedStep), lt(mfaCredentials.lastUsedStep, step))
      )).returning({ id: mfaCredentials.id });
    return changed.length > 0;
  }

  consumeRecoveryCode(userId: string, hash: string): Promise<boolean> {
    return this.database.transaction(async (transaction) => {
      const [credential] = await transaction.select({ hashes: mfaCredentials.recoveryCodeHashes })
        .from(mfaCredentials).where(eq(mfaCredentials.userId, userId)).for("update").limit(1);
      const hashes = credential?.hashes as string[] | undefined;
      if (!hashes?.includes(hash)) return false;
      await transaction.update(mfaCredentials).set({
        recoveryCodeHashes: hashes.filter((candidate) => candidate !== hash),
        updatedAt: new Date()
      }).where(eq(mfaCredentials.userId, userId));
      return true;
    });
  }

  disable(userId: string, requestId?: string): Promise<void> {
    return this.database.transaction(async (transaction) => {
      await transaction.delete(mfaCredentials).where(eq(mfaCredentials.userId, userId));
      await transaction.update(users).set({ mfaEnabled: false, updatedAt: new Date() }).where(eq(users.id, userId));
      await transaction.insert(auditLogs).values({
        actorId: userId,
        action: "MFA_DISABLED",
        entityType: "user",
        entityId: userId,
        requestId
      });
    });
  }
}
