import type { Database } from "../../infrastructure/database/database.js";
import { auditLogs, profiles, users } from "../../infrastructure/database/schema.js";
import type { CreateAdminUserInput } from "./admin.schemas.js";

export type CreatedUserView = {
  id: string;
  email: string;
  role: "PATIENT" | "ADMIN";
  status: "ACTIVE";
  firstName: string;
  lastName: string;
};

export class AdminRepository {
  constructor(private readonly database: Database) {}

  createUser(
    input: CreateAdminUserInput,
    passwordHash: string,
    actorId: string,
    requestId?: string
  ): Promise<CreatedUserView> {
    return this.database.transaction(async (transaction) => {
      const [user] = await transaction.insert(users).values({
        email: input.email,
        passwordHash,
        role: input.role,
        status: "ACTIVE",
        emailVerifiedAt: input.emailVerified ? new Date() : null
      }).returning({ id: users.id, email: users.email, role: users.role, status: users.status });
      if (!user) throw new Error("User insert returned no record");
      await transaction.insert(profiles).values({
        userId: user.id,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone
      });
      await transaction.insert(auditLogs).values({
        actorId,
        action: "USER_CREATED_BY_ADMIN",
        entityType: "user",
        entityId: user.id,
        requestId,
        metadata: { role: input.role, emailVerified: input.emailVerified }
      });
      return {
        id: user.id,
        email: user.email,
        role: input.role,
        status: "ACTIVE",
        firstName: input.firstName,
        lastName: input.lastName
      };
    });
  }
}
