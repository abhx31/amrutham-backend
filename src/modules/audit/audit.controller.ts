import type { Request, Response } from "express";
import { auditLogIdParamsSchema, listAuditLogsSchema } from "./audit.schemas.js";
import type { AuditService } from "./audit.service.js";

export class AuditController {
  constructor(private readonly service: AuditService) {}

  list = async (request: Request, response: Response): Promise<void> => {
    response.status(200).json({ items: await this.service.list(listAuditLogsSchema.parse(request.query)) });
  };

  get = async (request: Request, response: Response): Promise<void> => {
    const { auditLogId } = auditLogIdParamsSchema.parse(request.params);
    response.status(200).json({ auditLog: await this.service.get(auditLogId) });
  };
}
