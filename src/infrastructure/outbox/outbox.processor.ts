import type { Logger } from "pino";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import type { DomainEventHandler, OutboxJobData, OutboxStore } from "./outbox.types.js";

export class LoggingDomainEventHandler implements DomainEventHandler {
  constructor(private readonly logger: Logger) {}

  async handle(event: OutboxJobData): Promise<void> {
    this.logger.info({
      outboxEventId: event.id,
      eventType: event.eventType,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId
    }, "Domain event handled");
  }
}

export class RoutingDomainEventHandler implements DomainEventHandler {
  constructor(
    private readonly accountHandler: DomainEventHandler,
    private readonly domainNotificationHandler: DomainEventHandler,
    private readonly fallbackHandler: DomainEventHandler
  ) {}

  handle(event: OutboxJobData): Promise<void> {
    if (event.eventType.startsWith("account.")) return this.accountHandler.handle(event);
    if (["consultation.", "payment.", "prescription."].some((prefix) => event.eventType.startsWith(prefix))) {
      return this.domainNotificationHandler.handle(event);
    }
    return this.fallbackHandler.handle(event);
  }
}

export class OutboxProcessor {
  constructor(private readonly store: OutboxStore, private readonly handler: DomainEventHandler) {}

  async process(event: OutboxJobData): Promise<void> {
    return trace.getTracer("amrutam-outbox").startActiveSpan(`outbox ${event.eventType}`, {
      attributes: {
        "messaging.system": "bullmq",
        "messaging.operation.name": "process",
        "messaging.message.id": event.id,
        "amrutam.event.type": event.eventType,
        "amrutam.aggregate.type": event.aggregateType,
        "amrutam.aggregate.id": event.aggregateId
      }
    }, async (span) => {
      try {
        await this.handler.handle(event);
        await this.store.markProcessed(event.id);
        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        await this.store.recordFailure(event.id);
        span.recordException(error instanceof Error ? error : new Error(String(error)));
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
