import "dotenv/config";
import { z } from "zod";
import { bootstrapAdministrator as createBootstrapAdministrator } from "./modules/admin/admin-bootstrap.service.js";

const environmentSchema = z.object({
  DATABASE_URL: z.string().url(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().min(1),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().min(1),
  BOOTSTRAP_ADMIN_FIRST_NAME: z.string().min(1),
  BOOTSTRAP_ADMIN_LAST_NAME: z.string().min(1)
});

try {
  const result = await bootstrapAdministrator();
  console.info(result.created
    ? `Initial administrator created (${result.id}); MFA enrollment is required at first login.`
    : `Administrator already exists (${result.id}); no changes were made.`);
} catch (error) {
  const message = error instanceof z.ZodError
    ? "Administrator bootstrap configuration is invalid; check the required environment variables and password policy."
    : error instanceof Error ? error.message : "Administrator bootstrap failed";
  console.error(message);
  process.exitCode = 1;
}

async function bootstrapAdministrator(): Promise<{ id: string; created: boolean }> {
  const environment = environmentSchema.parse(process.env);
  return createBootstrapAdministrator({
    databaseUrl: environment.DATABASE_URL,
    email: environment.BOOTSTRAP_ADMIN_EMAIL,
    password: environment.BOOTSTRAP_ADMIN_PASSWORD,
    firstName: environment.BOOTSTRAP_ADMIN_FIRST_NAME,
    lastName: environment.BOOTSTRAP_ADMIN_LAST_NAME
  });
}
