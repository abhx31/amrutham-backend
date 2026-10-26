export type OutboxEvent = {
  id: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: unknown;
  attempts: number;
  createdAt: Date;
};

export type OutboxJobData = Omit<OutboxEvent, "attempts" | "createdAt"> & { createdAt: string };

export interface OutboxStore {
  findPending(limit: number, maxAttempts: number): Promise<OutboxEvent[]>;
  markProcessed(id: string): Promise<void>;
  recordFailure(id: string): Promise<void>;
}

export interface OutboxQueue {
  add(name: string, data: OutboxJobData, options: { jobId: string }): Promise<unknown>;
}

export interface DomainEventHandler {
  handle(event: OutboxJobData): Promise<void>;
}
