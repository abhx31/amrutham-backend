import { and, asc, eq, isNull, lt, sql } from "drizzle-orm";
import type { Database } from "../database/database.js";
import { outboxEvents } from "../database/schema.js";
import type { OutboxEvent, OutboxStore } from "./outbox.types.js";

export class OutboxRepository implements OutboxStore {
  constructor(private readonly database: Database) {}

  findPending(limit: number, maxAttempts: number): Promise<OutboxEvent[]> {
    return this.database.select({
      id: outboxEvents.id,
      eventType: outboxEvents.eventType,
      aggregateType: outboxEvents.aggregateType,
      aggregateId: outboxEvents.aggregateId,
      payload: outboxEvents.payload,
      attempts: outboxEvents.attempts,
      createdAt: outboxEvents.createdAt
    }).from(outboxEvents).where(and(
      isNull(outboxEvents.processedAt),
      lt(outboxEvents.attempts, maxAttempts)
    )).orderBy(asc(outboxEvents.createdAt)).limit(limit);
  }

  async markProcessed(id: string): Promise<void> {
    await this.database.update(outboxEvents).set({ processedAt: new Date() }).where(and(
      eq(outboxEvents.id, id), isNull(outboxEvents.processedAt)
    ));
  }

  async recordFailure(id: string): Promise<void> {
    await this.database.update(outboxEvents).set({
      attempts: sql`${outboxEvents.attempts} + 1`
    }).where(and(eq(outboxEvents.id, id), isNull(outboxEvents.processedAt)));
  }
}
