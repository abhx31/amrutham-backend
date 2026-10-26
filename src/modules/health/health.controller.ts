import type { RequestHandler } from "express";
import { sql } from "drizzle-orm";
import type { Database } from "../../infrastructure/database/database.js";

export class HealthController {
  constructor(private readonly database: Database) {}

  readonly live: RequestHandler = (_request, response) => {
    response.status(200).json({ status: "ok" });
  };

  readonly ready: RequestHandler = async (_request, response) => {
    try {
      await this.database.execute(sql`select 1`);
      response.status(200).json({ status: "ready", checks: { database: "up" } });
    } catch {
      response.status(503).json({ status: "not_ready", checks: { database: "down" } });
    }
  };
}
