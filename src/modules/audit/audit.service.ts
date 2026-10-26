import { AppError } from "../../common/errors/app-error.js";
import { AuditRepository } from "./audit.repository.js";
import type { ListAuditLogsInput } from "./audit.schemas.js";
import type { AuditLogView } from "./audit.types.js";

export class AuditService {
  constructor(private readonly repository: AuditRepository) {}

  list(input: ListAuditLogsInput): Promise<AuditLogView[]> {
    return this.repository.list(input);
  }

  async get(auditLogId: string): Promise<AuditLogView> {
    const record = await this.repository.findById(auditLogId);
    if (!record) throw new AppError("Audit log not found", 404, "AUDIT_LOG_NOT_FOUND");
    return record;
  }
}
