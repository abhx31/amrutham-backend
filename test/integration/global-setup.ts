import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";

const databaseUrl = process.env.TEST_DATABASE_URL ?? "postgresql://amrutam:amrutam@localhost:5433/amrutam_test";

export async function setup(): Promise<void> {
  const databaseName = new URL(databaseUrl).pathname.slice(1);
  if (!databaseName.endsWith("_test")) {
    throw new Error(`Refusing to reset non-test database '${databaseName}'`);
  }

  const client = await connectWithRetry();
  try {
    await client.query("DROP SCHEMA public CASCADE");
    await client.query("CREATE SCHEMA public");
    const directory = resolve("drizzle");
    const migrations = (await readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort();
    for (const migration of migrations) {
      const sql = await readFile(resolve(directory, migration), "utf8");
      for (const statement of sql.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
        await client.query(statement);
      }
    }
  } finally {
    await client.end();
  }
}

async function connectWithRetry(): Promise<Client> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 30; attempt += 1) {
    const client = new Client({ connectionString: databaseUrl });
    try {
      await client.connect();
      return client;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => undefined);
      if (attempt < 30) await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
    }
  }
  throw lastError;
}
