import { and, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import type { Database } from "../../infrastructure/database/database.js";
import { auditLogs } from "../../infrastructure/database/schema.js";
import type { ListAuditLogsInput } from "./audit.schemas.js";
import type { AuditLogView } from "./audit.types.js";

const selection = {
  id: auditLogs.id,
  actorId: auditLogs.actorId,
  action: auditLogs.action,
  entityType: auditLogs.entityType,
  entityId: auditLogs.entityId,
  requestId: auditLogs.requestId,
  metadata: auditLogs.metadata,
  createdAt: auditLogs.createdAt
};

export class AuditRepository {
  constructor(private readonly database: Database) {}

  async list(input: ListAuditLogsInput): Promise<AuditLogView[]> {
    const conditions: SQL[] = [];
    if (input.actorId) conditions.push(eq(auditLogs.actorId, input.actorId));
    if (input.action) conditions.push(eq(auditLogs.action, input.action));
    if (input.entityType) conditions.push(eq(auditLogs.entityType, input.entityType));
    if (input.entityId) conditions.push(eq(auditLogs.entityId, input.entityId));
    if (input.from) conditions.push(gte(auditLogs.createdAt, input.from));
    if (input.to) conditions.push(lte(auditLogs.createdAt, input.to));
    return this.database.select(selection).from(auditLogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.createdAt), desc(auditLogs.id))
      .limit(input.limit).offset(input.offset);
  }

  async findById(auditLogId: string): Promise<AuditLogView | undefined> {
    const [record] = await this.database.select(selection).from(auditLogs)
      .where(eq(auditLogs.id, auditLogId)).limit(1);
    return record;
  }
}
