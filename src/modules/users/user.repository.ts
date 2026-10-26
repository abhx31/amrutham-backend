import { and, desc, eq, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { AppError } from "../../common/errors/app-error.js";
import type { Database } from "../../infrastructure/database/database.js";
import { auditLogs, profiles, users } from "../../infrastructure/database/schema.js";
import type { ListUsersInput, UpdateProfileInput, UpdateStatusInput } from "./user.schemas.js";
import type { UserListResult, UserView } from "./user.types.js";

const userSelection = {
  id: users.id,
  email: users.email,
  role: users.role,
  status: users.status,
  firstName: profiles.firstName,
  lastName: profiles.lastName,
  phone: profiles.phone,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt
};

export class UserRepository {
  constructor(private readonly database: Database) {}

  async findById(userId: string): Promise<UserView | undefined> {
    const [record] = await this.database.select(userSelection).from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(eq(users.id, userId)).limit(1);
    return record;
  }

  async list(input: ListUsersInput): Promise<UserListResult> {
    const conditions: SQL[] = [];
    if (input.role) conditions.push(eq(users.role, input.role));
    if (input.status) conditions.push(eq(users.status, input.status));
    if (input.search) {
      const pattern = `%${escapeLike(input.search)}%`;
      conditions.push(or(
        ilike(users.email, pattern),
        ilike(profiles.firstName, pattern),
        ilike(profiles.lastName, pattern)
      )!);
    }
    if (input.cursor) {
      const cursor = decodeCursor(input.cursor);
      conditions.push(or(
        lt(users.createdAt, cursor.createdAt),
        and(eq(users.createdAt, cursor.createdAt), lt(users.id, cursor.id))
      )!);
    }

    const records = await this.database.select(userSelection).from(users)
      .innerJoin(profiles, eq(profiles.userId, users.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(input.limit + 1);

    const hasMore = records.length > input.limit;
    const items = hasMore ? records.slice(0, input.limit) : records;
    const last = items.at(-1);
    return {
      items,
      nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null
    };
  }

  updateProfile(userId: string, input: UpdateProfileInput, requestId?: string): Promise<UserView | undefined> {
    return this.database.transaction(async (transaction) => {
      const update: { firstName?: string; lastName?: string; phone?: string | null; updatedAt: Date } = {
        updatedAt: new Date()
      };
      if (input.firstName !== undefined) update.firstName = input.firstName;
      if (input.lastName !== undefined) update.lastName = input.lastName;
      if (input.phone !== undefined) update.phone = input.phone;

      const changed = await transaction.update(profiles).set(update)
        .where(eq(profiles.userId, userId)).returning({ id: profiles.id });
      if (changed.length === 0) return undefined;

      await transaction.insert(auditLogs).values({
        actorId: userId,
        action: "USER_PROFILE_UPDATED",
        entityType: "user",
        entityId: userId,
        requestId,
        metadata: { changedFields: Object.keys(input) }
      });

      const [record] = await transaction.select(userSelection).from(users)
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .where(eq(users.id, userId)).limit(1);
      return record;
    });
  }

  updateStatus(
    userId: string,
    input: UpdateStatusInput,
    actorId: string,
    requestId?: string
  ): Promise<UserView | undefined> {
    return this.database.transaction(async (transaction) => {
      const changed = await transaction.update(users).set({
        status: input.status,
        updatedAt: new Date()
      }).where(eq(users.id, userId)).returning({ id: users.id });
      if (changed.length === 0) return undefined;

      await transaction.insert(auditLogs).values({
        actorId,
        action: "USER_STATUS_CHANGED",
        entityType: "user",
        entityId: userId,
        requestId,
        metadata: { status: input.status, reason: input.reason }
      });

      const [record] = await transaction.select(userSelection).from(users)
        .innerJoin(profiles, eq(profiles.userId, users.id))
        .where(eq(users.id, userId)).limit(1);
      return record;
    });
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify({ createdAt: createdAt.toISOString(), id }), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const value = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as unknown;
    if (
      typeof value !== "object" || value === null ||
      !("createdAt" in value) || typeof value.createdAt !== "string" ||
      !("id" in value) || typeof value.id !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(value.id)
    ) throw new Error("Invalid cursor");
    const createdAt = new Date(value.createdAt);
    if (Number.isNaN(createdAt.getTime())) throw new Error("Invalid cursor date");
    return { createdAt, id: value.id };
  } catch {
    throw new AppError("The pagination cursor is invalid", 400, "INVALID_CURSOR");
  }
}
