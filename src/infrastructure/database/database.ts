import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { AppConfig } from "../../config/env.js";
import * as schema from "./schema.js";

export type Database = NodePgDatabase<typeof schema> & { $client: Pool };

export type DatabaseDependencies = { config: AppConfig };

export function createDatabase({ config }: DatabaseDependencies): Database {
  const pool = new Pool({ connectionString: config.DATABASE_URL, max: 20 });
  return drizzle(pool, { schema });
}
