import { describe, expect, it, vi } from "vitest";
import { OutboxDispatcher } from "../src/infrastructure/outbox/outbox.dispatcher.js";
import { OutboxProcessor } from "../src/infrastructure/outbox/outbox.processor.js";
import type { DomainEventHandler, OutboxQueue, OutboxStore } from "../src/infrastructure/outbox/outbox.types.js";

function dependencies() {
  const store: OutboxStore = {
    findPending: vi.fn().mockResolvedValue([]),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    recordFailure: vi.fn().mockResolvedValue(undefined)
  };
  const queue: OutboxQueue = { add: vi.fn().mockResolvedValue(undefined) };
  const handler: DomainEventHandler = { handle: vi.fn().mockResolvedValue(undefined) };
  return { store, queue, handler };
}

const event = {
  id: "9ec0c27f-c564-48ff-9204-d163e153576c",
  eventType: "consultation.booked",
  aggregateType: "consultation",
  aggregateId: "d6ec5657-58dd-46a8-a491-d000375d366f",
  payload: { consultationId: "d6ec5657-58dd-46a8-a491-d000375d366f" },
  attempts: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z")
};

describe("transactional outbox", () => {
  it("uses the event ID as the BullMQ deduplication ID", async () => {
    const { store, queue } = dependencies();
    vi.mocked(store.findPending).mockResolvedValue([event]);
    const count = await new OutboxDispatcher(store, queue, 100, 5).dispatchBatch();

    expect(count).toBe(1);
    expect(queue.add).toHaveBeenCalledWith(event.eventType, expect.objectContaining({ id: event.id }), { jobId: event.id });
  });

  it("marks an event processed only after its handler succeeds", async () => {
    const { store, handler } = dependencies();
    const processor = new OutboxProcessor(store, handler);
    await processor.process({ ...event, createdAt: event.createdAt.toISOString() });

    expect(handler.handle).toHaveBeenCalledOnce();
    expect(store.markProcessed).toHaveBeenCalledWith(event.id);
    expect(store.recordFailure).not.toHaveBeenCalled();
  });

  it("records a failed attempt and lets BullMQ retry", async () => {
    const { store, handler } = dependencies();
    vi.mocked(handler.handle).mockRejectedValue(new Error("delivery unavailable"));
    const processor = new OutboxProcessor(store, handler);

    await expect(processor.process({ ...event, createdAt: event.createdAt.toISOString() })).rejects.toThrow("delivery unavailable");
    expect(store.markProcessed).not.toHaveBeenCalled();
    expect(store.recordFailure).toHaveBeenCalledWith(event.id);
  });
});
