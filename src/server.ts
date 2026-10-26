import "dotenv/config";
import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { createAppContainer } from "./container.js";
import { shutdownTelemetry } from "./infrastructure/observability/telemetry.js";

const config = loadConfig();
const container = createAppContainer(config);
const app = createApp(container.cradle);

const server = app.listen(config.PORT, () => {
  container.cradle.logger.info({ port: config.PORT }, "HTTP server started");
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  container.cradle.logger.info({ signal }, "Shutting down");
  server.close(async (error) => {
    await container.cradle.cache.close();
    await container.cradle.database.$client.end();
    await shutdownTelemetry();
    if (error) {
      container.cradle.logger.error({ err: error }, "Graceful shutdown failed");
      process.exitCode = 1;
    }
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
