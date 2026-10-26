import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { auditLogs, profiles, users } from "../../infrastructure/database/schema.js";
import { createAdminUserSchema } from "./admin.schemas.js";
import { PasswordService } from "../auth/password.service.js";

export type BootstrapAdministratorInput = {
  databaseUrl: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
};

export async function bootstrapAdministrator(
  bootstrap: BootstrapAdministratorInput
): Promise<{ id: string; created: boolean }> {
  const input = createAdminUserSchema.parse({
    email: bootstrap.email,
    password: bootstrap.password,
    role: "ADMIN",
    firstName: bootstrap.firstName,
    lastName: bootstrap.lastName,
    emailVerified: true
  });
  const pool = new Pool({ connectionString: bootstrap.databaseUrl, max: 1 });
  const database = drizzle(pool, { schema: { users, profiles, auditLogs } });

  try {
    return await database.transaction(async (transaction) => {
      await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`bootstrap-admin:${input.email}`}))`);
      const [existing] = await transaction.select({ id: users.id, role: users.role })
        .from(users).where(eq(users.email, input.email)).limit(1);
      if (existing) {
        if (existing.role !== "ADMIN") {
          throw new Error("The bootstrap email already belongs to a non-admin account; refusing to promote it");
        }
        return { id: existing.id, created: false };
      }

      const passwordHash = await new PasswordService().hash(input.password);
      const [admin] = await transaction.insert(users).values({
        email: input.email,
        passwordHash,
        role: "ADMIN",
        status: "ACTIVE",
        emailVerifiedAt: new Date()
      }).returning({ id: users.id });
      if (!admin) throw new Error("Admin insert returned no record");

      await transaction.insert(profiles).values({
        userId: admin.id,
        firstName: input.firstName,
        lastName: input.lastName
      });
      await transaction.insert(auditLogs).values({
        actorId: admin.id,
        action: "INITIAL_ADMIN_BOOTSTRAPPED",
        entityType: "user",
        entityId: admin.id,
        metadata: { source: "bootstrap-cli" }
      });
      return { id: admin.id, created: true };
    });
  } finally {
    await pool.end();
  }
}
