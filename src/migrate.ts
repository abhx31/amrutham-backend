import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import pino from "pino";

const connectionString = process.env.MIGRATION_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("MIGRATION_DATABASE_URL or DATABASE_URL is required");

const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
const pool = new Pool({ connectionString, max: 1 });
const database = drizzle(pool);

try {
  logger.info("Applying database migrations");
  await migrate(database, { migrationsFolder: "drizzle" });
  logger.info("Database migrations completed");
} catch (error) {
  logger.error({ err: error }, "Database migration failed");
  process.exitCode = 1;
} finally {
  await pool.end();
}
