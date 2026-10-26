export type AuditLogView = {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  requestId: string | null;
  metadata: unknown;
  createdAt: Date;
};
