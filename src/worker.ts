import "dotenv/config";
import { Queue, Worker, type Job } from "bullmq";
import { Redis } from "ioredis";
import pino from "pino";
import { loadConfig } from "./config/env.js";
import { createDatabase } from "./infrastructure/database/database.js";
import { OutboxDispatcher } from "./infrastructure/outbox/outbox.dispatcher.js";
import { LoggingDomainEventHandler, OutboxProcessor, RoutingDomainEventHandler } from "./infrastructure/outbox/outbox.processor.js";
import { OutboxRepository } from "./infrastructure/outbox/outbox.repository.js";
import type { OutboxJobData } from "./infrastructure/outbox/outbox.types.js";
import { AccountNotificationHandler } from "./infrastructure/notifications/account-notification.handler.js";
import { FakeEmailProvider, SmtpEmailProvider } from "./infrastructure/notifications/email.provider.js";
import { NotificationRepository } from "./infrastructure/notifications/notification.repository.js";
import { DomainNotificationHandler } from "./infrastructure/notifications/domain-notification.handler.js";
import { MfaCryptoService } from "./modules/auth/mfa-crypto.service.js";
import { shutdownTelemetry } from "./infrastructure/observability/telemetry.js";

const queueName = "amrutam-domain-events";
const config = loadConfig();
const logger = pino({ level: config.LOG_LEVEL });
const database = createDatabase({ config });
const repository = new OutboxRepository(database);
const emailProvider = config.EMAIL_TRANSPORT === "smtp"
  ? new SmtpEmailProvider(config.SMTP_URL!, config.EMAIL_FROM)
  : new FakeEmailProvider(config.EMAIL_FROM, logger);
const accountNotificationHandler = new AccountNotificationHandler(
  new NotificationRepository(database),
  emailProvider,
  new MfaCryptoService(config),
  config.APP_PUBLIC_URL
);
const domainNotificationHandler = new DomainNotificationHandler(
  new NotificationRepository(database),
  emailProvider,
  config.APP_PUBLIC_URL
);
const eventHandler = new RoutingDomainEventHandler(
  accountNotificationHandler,
  domainNotificationHandler,
  new LoggingDomainEventHandler(logger)
);
const queueConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const workerConnection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
const queue = new Queue<OutboxJobData>(queueName, {
  connection: queueConnection,
  defaultJobOptions: {
    attempts: config.OUTBOX_MAX_ATTEMPTS,
    backoff: { type: "exponential", delay: 1_000 },
    removeOnComplete: { age: 86_400, count: 10_000 },
    removeOnFail: { age: 604_800, count: 50_000 }
  }
});
const dispatcher = new OutboxDispatcher(repository, queue, config.OUTBOX_BATCH_SIZE, config.OUTBOX_MAX_ATTEMPTS);
const processor = new OutboxProcessor(repository, eventHandler);
const worker = new Worker<OutboxJobData>(queueName, (job: Job<OutboxJobData>) => processor.process(job.data), {
  connection: workerConnection,
  concurrency: 10
});

let dispatching = false;
async function dispatch(): Promise<void> {
  if (dispatching) return;
  dispatching = true;
  try {
    const count = await dispatcher.dispatchBatch();
    if (count > 0) logger.debug({ count }, "Outbox events dispatched");
  } catch (error) {
    logger.error({ err: error }, "Outbox dispatch failed");
  } finally {
    dispatching = false;
  }
}

worker.on("completed", (job) => logger.debug({ jobId: job.id }, "Outbox job completed"));
worker.on("failed", (job, error) => logger.error({ jobId: job?.id, err: error }, "Outbox job failed"));
worker.on("error", (error) => logger.error({ err: error }, "Outbox worker error"));

const timer = setInterval(() => void dispatch(), config.OUTBOX_POLL_INTERVAL_MS);
timer.unref();
void dispatch();
logger.info({ queueName }, "Outbox worker started");

let stopping = false;
async function shutdown(signal: string): Promise<void> {
  if (stopping) return;
  stopping = true;
  clearInterval(timer);
  logger.info({ signal }, "Stopping outbox worker");
  await worker.close();
  await queue.close();
  await queueConnection.quit();
  await workerConnection.quit();
  await database.$client.end();
  await shutdownTelemetry();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
