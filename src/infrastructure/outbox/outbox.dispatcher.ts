import type { OutboxQueue, OutboxStore } from "./outbox.types.js";

export class OutboxDispatcher {
  constructor(
    private readonly store: OutboxStore,
    private readonly queue: OutboxQueue,
    private readonly batchSize: number,
    private readonly maxAttempts: number
  ) {}

  async dispatchBatch(): Promise<number> {
    const events = await this.store.findPending(this.batchSize, this.maxAttempts);
    await Promise.all(events.map((event) => this.queue.add(event.eventType, {
      id: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      payload: event.payload,
      createdAt: event.createdAt.toISOString()
    }, { jobId: event.id })));
    return events.length;
  }
}
